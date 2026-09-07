import { useCallback, type Dispatch, type SetStateAction } from "react";

import { saveClientReserveAfterService } from "../features/service-visit/client-reserve-after.service";
import { loadClientInventoryProducts } from "../features/service-visit/inventory-audit.service";
import { saveMachineRefill } from "../features/service-visit/machine-refill.service";
import { saveServiceVisit } from "../features/service-visit/service-visit.storage";

import type {
  ClientReserveAfterItemRecord,
  CompleteMachineRefillInput,
  MachineRefillItemRecord,
  MachineRefillQuantityInput,
  MachineRefillZeroReason,
  ServiceVisit,
} from "../features/service-visit/service-visit.types";

import { transitionToNextStep } from "../features/service-visit/state/service-visit.transitions";

type UseMachineRefillStepParams = {
  activeVisit: ServiceVisit | null;

  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;

  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

const MACHINE_REFILL_ZERO_REASONS = new Set<MachineRefillZeroReason>([
  "refill_not_required",
  "product_unavailable",
  "machine_issue",
  "other",
]);

class ReserveAfterSyncError extends Error {
  visit: ServiceVisit;

  constructor(
    message: string,
    visit: ServiceVisit,
  ) {
    super(message);

    this.name = "ReserveAfterSyncError";
    this.visit = visit;
  }
}

async function syncReserveAfter(
  visit: ServiceVisit,
): Promise<ServiceVisit> {
  const inventoryAudit = visit.inventoryAudit;
  const clientDelivery = visit.restockDrop;

  if (
    !inventoryAudit ||
    inventoryAudit.syncStatus !== "synced" ||
    !inventoryAudit.databaseId
  ) {
    throw new Error(
      "Client reserve before service must be synced before calculating reserve after service.",
    );
  }

  if (
    !clientDelivery ||
    clientDelivery.syncStatus !== "synced" ||
    !clientDelivery.databaseId
  ) {
    throw new Error(
      "Client delivery must be synced before calculating reserve after service.",
    );
  }

  /*
   * FLOW-19:
   *
   * Reserve After =
   *   Reserve Before + Actual Client Delivery
   *
   * FLOW-18 Machine Refill is intentionally excluded.
   */
  const deliveryByProduct = new Map(
    clientDelivery.items.map((item) => [
      item.productId,
      item.actualQuantity,
    ]),
  );

  const items: ClientReserveAfterItemRecord[] =
    inventoryAudit.items.map((item) => {
      const deliveredQuantity =
        deliveryByProduct.get(item.productId) ?? 0;

      return {
        productId: item.productId,

        reserveBeforeQuantity:
          item.normalizedQuantity,

        deliveredQuantity,

        reserveAfterQuantity:
          item.normalizedQuantity +
          deliveredQuantity,

        normalizedUnit:
          item.normalizedUnit,
      };
    });

  /*
   * If this is a retry, preserve the original
   * calculatedAt timestamp.
   */
  const calculatedAt =
    visit.reserveAfter?.calculatedAt ??
    new Date().toISOString();

  const pendingVisit: ServiceVisit = {
    ...visit,

    reserveAfter: {
      databaseId: null,

      sourceVisitId: visit.id,

      calculatedAt,

      items,

      syncStatus: "pending_sync",

      syncError: null,
    },

    updatedAt: new Date().toISOString(),
  };

  await saveServiceVisit(pendingVisit);

  try {
    const databaseId =
      await saveClientReserveAfterService({
        sourceVisitId: visit.id,

        clientId: visit.clientId,

        stopId: visit.stopId,

        machineId: visit.machineId,

        calculatedAt,
      });

    const syncedVisit: ServiceVisit = {
      ...pendingVisit,

      reserveAfter: {
        ...pendingVisit.reserveAfter!,

        databaseId,

        syncStatus: "synced",

        syncError: null,
      },

      updatedAt: new Date().toISOString(),
    };

    await saveServiceVisit(syncedVisit);

    return syncedVisit;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to sync client reserve after service.";

    const failedVisit: ServiceVisit = {
      ...pendingVisit,

      reserveAfter: {
        ...pendingVisit.reserveAfter!,

        syncStatus: "failed",

        syncError: message,
      },

      updatedAt: new Date().toISOString(),
    };

    await saveServiceVisit(failedVisit);

    /*
     * Throw the failed visit together with the error so
     * the caller can update React state correctly.
     */
    throw new ReserveAfterSyncError(
      message,
      failedVisit,
    );
  }
}

export function useMachineRefillStep({
  activeVisit,
  setActiveVisit,
  setErrorMessage,
}: UseMachineRefillStepParams) {
  const completeMachineRefill = useCallback(
    async (input: CompleteMachineRefillInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "machine_refill") {
        throw new Error("Machine refill cannot be completed yet.");
      }

      /*
       * --------------------------------------------------
       * FLOW-19 RESUME / RETRY
       * --------------------------------------------------
       *
       * If FLOW-18 is already synced, do not submit
       * Machine Refill again.
       *
       * This covers:
       *
       * - FLOW-19 missing
       * - FLOW-19 pending after app restart
       * - FLOW-19 failed
       * - FLOW-19 synced but local transition was interrupted
       */
      if (
        activeVisit.machineRefill?.syncStatus === "synced" &&
        activeVisit.machineRefill.databaseId
      ) {
        /*
         * FLOW-19 already synced.
         *
         * Nothing needs to be sent to Supabase again.
         * We only need to finish the local transition.
         */
        if (
          activeVisit.reserveAfter?.syncStatus === "synced" &&
          activeVisit.reserveAfter.databaseId
        ) {
          const transitionedVisit = transitionToNextStep(
            activeVisit,
            "machine_refill",
            new Date().toISOString(),
          );

          await saveServiceVisit(transitionedVisit);

          setActiveVisit(transitionedVisit);

          setErrorMessage(null);

          return transitionedVisit;
        }

        /*
         * FLOW-18 is synced but FLOW-19 is either:
         *
         * - missing
         * - pending_sync
         * - failed
         *
         * Retry FLOW-19 ONLY.
         */
        try {
          const syncedReserveAfterVisit =
            await syncReserveAfter(activeVisit);

          const transitionedVisit = transitionToNextStep(
            syncedReserveAfterVisit,
            "machine_refill",
            new Date().toISOString(),
          );

          await saveServiceVisit(transitionedVisit);

          setActiveVisit(transitionedVisit);

          setErrorMessage(null);

          return transitionedVisit;
        } catch (error) {
          if (error instanceof ReserveAfterSyncError) {
            setActiveVisit(error.visit);

            setErrorMessage(error.message);
          } else {
            const message =
              error instanceof Error
                ? error.message
                : "Unable to sync client reserve after service.";

            setErrorMessage(message);
          }

          throw error;
        }
      }

      /*
       * --------------------------------------------------
       * NORMAL FLOW-18 PATH
       * --------------------------------------------------
       *
       * We only reach this point when Machine Refill
       * has NOT already been synced.
       */

      /*
       * FLOW-18 follows FLOW-17.
       *
       * The delivery is NOT the source of machine stock.
       * This dependency only guarantees workflow order.
       */
      if (
        !activeVisit.restockDrop ||
        activeVisit.restockDrop.syncStatus !== "synced" ||
        !activeVisit.restockDrop.databaseId
      ) {
        throw new Error(
          "Client delivery must be synced before machine refill.",
        );
      }

      /*
       * FLOW-19 requires the FLOW-16 reserve-before
       * snapshot.
       *
       * Validate it before saving FLOW-18 so we do not
       * successfully persist Machine Refill and only then
       * discover that FLOW-19 cannot be calculated.
       */
      if (
        !activeVisit.inventoryAudit ||
        activeVisit.inventoryAudit.syncStatus !== "synced" ||
        !activeVisit.inventoryAudit.databaseId
      ) {
        throw new Error(
          "Client reserve before service must be synced before machine refill.",
        );
      }

      const configuredProducts = await loadClientInventoryProducts(
        activeVisit.clientId,
      );

      const configuredById = new Map(
        configuredProducts.map((product) => [
          product.productId,
          product,
        ]),
      );

      const productIds = new Set<string>();

      const items: MachineRefillItemRecord[] = [];

      const normalizedQuantities: MachineRefillQuantityInput[] = [];

      /*
       * Validate and normalize FLOW-18 input.
       */
      for (const quantity of input.quantities) {
        if (!quantity.productId.trim()) {
          throw new Error(
            "Every machine refill quantity must reference a product.",
          );
        }

        if (productIds.has(quantity.productId)) {
          throw new Error(
            "A product cannot appear more than once.",
          );
        }

        const product = configuredById.get(
          quantity.productId,
        );

        if (!product) {
          throw new Error(
            "A selected product is no longer configured for this client.",
          );
        }

        if (
          !Number.isFinite(quantity.issueQuantity) ||
          quantity.issueQuantity < 0 ||
          !Number.isInteger(quantity.issueQuantity)
        ) {
          throw new Error(
            `${product.name}: package quantity must be a whole number.`,
          );
        }

        /*
         * Normalize unsupported loose quantities to zero.
         *
         * This also protects against stale local UI state
         * for products where loose units are not allowed.
         */
        const looseQuantity =
          product.packaging.allowsLooseUnits
            ? quantity.looseQuantity
            : 0;

        if (
          !Number.isFinite(looseQuantity) ||
          looseQuantity < 0
        ) {
          throw new Error(
            `${product.name}: loose quantity cannot be negative.`,
          );
        }

        if (
          product.packaging.allowsLooseUnits &&
          !product.packaging.allowsPartialBaseUnit &&
          !Number.isInteger(looseQuantity)
        ) {
          throw new Error(
            `${product.name} does not allow partial ${product.packaging.baseUnit} quantities.`,
          );
        }

        const actualQuantity =
          quantity.issueQuantity *
            product.packaging.unitsPerIssueUnit +
          looseQuantity;

        /*
         * Zero reason is optional.
         *
         * It is only meaningful when no product was
         * actually added to the machine.
         */
        let zeroReason: MachineRefillZeroReason | null =
          null;

        let zeroReasonNote: string | null = null;

        if (actualQuantity === 0) {
          if (
            quantity.zeroReason !== null &&
            !MACHINE_REFILL_ZERO_REASONS.has(
              quantity.zeroReason,
            )
          ) {
            throw new Error(
              `${product.name}: invalid zero refill reason.`,
            );
          }

          zeroReason = quantity.zeroReason;

          if (zeroReason === "other") {
            const trimmedNote =
              quantity.zeroReasonNote?.trim() ?? "";

            if (!trimmedNote) {
              throw new Error(
                `${product.name}: enter a reason when Other is selected.`,
              );
            }

            zeroReasonNote = trimmedNote;
          }
        }

        normalizedQuantities.push({
          productId: quantity.productId,

          issueQuantity: quantity.issueQuantity,

          looseQuantity,

          zeroReason,

          zeroReasonNote,
        });

        items.push({
          productId: product.productId,

          sku: product.sku,

          name: product.name,

          category: product.category,

          unitLabel: product.unitLabel,

          issueQuantity: quantity.issueQuantity,

          looseQuantity,

          actualQuantity,

          normalizedUnit:
            product.packaging.baseUnit,

          zeroReason,

          zeroReasonNote,
        });

        productIds.add(quantity.productId);
      }

      const machineRefillConfirmedAt =
        new Date().toISOString();

      /*
       * FLOW-18:
       * Persist driver's input locally BEFORE network sync.
       */
      const pendingMachineRefillVisit: ServiceVisit = {
        ...activeVisit,

        machineRefill: {
          databaseId: null,

          sourceVisitId: activeVisit.id,

          confirmedAt: machineRefillConfirmedAt,

          items,

          syncStatus: "pending_sync",

          syncError: null,
        },

        updatedAt: machineRefillConfirmedAt,
      };

      await saveServiceVisit(
        pendingMachineRefillVisit,
      );

      setActiveVisit(pendingMachineRefillVisit);

      /*
       * --------------------------------------------------
       * FLOW-18 NETWORK SYNC
       * --------------------------------------------------
       *
       * This try/catch belongs ONLY to machine refill.
       */
      let syncedMachineRefillVisit: ServiceVisit;

      try {
        const machineRefillDatabaseId =
          await saveMachineRefill({
            sourceVisitId: activeVisit.id,

            clientId: activeVisit.clientId,

            stopId: activeVisit.stopId,

            machineId: activeVisit.machineId,

            confirmedAt:
              machineRefillConfirmedAt,

            quantities: normalizedQuantities,
          });

        syncedMachineRefillVisit = {
          ...pendingMachineRefillVisit,

          machineRefill: {
            ...pendingMachineRefillVisit.machineRefill!,

            databaseId: machineRefillDatabaseId,

            syncStatus: "synced",

            syncError: null,
          },

          updatedAt: new Date().toISOString(),
        };

        /*
         * Persist successful FLOW-18 immediately.
         *
         * From this point onward FLOW-18 must remain
         * "synced", even if FLOW-19 later fails.
         */
        await saveServiceVisit(
          syncedMachineRefillVisit,
        );

        setActiveVisit(
          syncedMachineRefillVisit,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync machine refill.";

        const failedMachineRefillVisit: ServiceVisit = {
          ...pendingMachineRefillVisit,

          machineRefill: {
            ...pendingMachineRefillVisit.machineRefill!,

            syncStatus: "failed",

            syncError: message,
          },

          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(
          failedMachineRefillVisit,
        );

        setActiveVisit(
          failedMachineRefillVisit,
        );

        setErrorMessage(message);

        throw error;
      }

            /*
       * --------------------------------------------------
       * FLOW-19
       * --------------------------------------------------
       *
       * FLOW-18 is now safely synced.
       *
       * Use the same FLOW-19 synchronization path for
       * both:
       *
       * 1. normal completion after FLOW-18
       * 2. retry/resume when FLOW-18 was already synced
       */
      try {
        const syncedReserveAfterVisit =
          await syncReserveAfter(
            syncedMachineRefillVisit,
          );

        /*
         * FLOW-18 and FLOW-19 are both synced.
         *
         * It is now safe to advance:
         *
         * Machine Refill -> After Service
         */
        const transitionedVisit =
          transitionToNextStep(
            syncedReserveAfterVisit,
            "machine_refill",
            new Date().toISOString(),
          );

        await saveServiceVisit(
          transitionedVisit,
        );

        setActiveVisit(
          transitionedVisit,
        );

        setErrorMessage(null);

        return transitionedVisit;
      } catch (error) {
        if (error instanceof ReserveAfterSyncError) {
          /*
           * FLOW-18 remains synced.
           *
           * Only FLOW-19 is marked failed by
           * syncReserveAfter().
           */
          setActiveVisit(error.visit);

          setErrorMessage(error.message);
        } else {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to sync client reserve after service.";

          setErrorMessage(message);
        }

        throw error;
      }
    },
    [
      activeVisit,
      setActiveVisit,
      setErrorMessage,
    ],
  );

  return {
    completeMachineRefill,
  };
}