import { useCallback, type Dispatch, type SetStateAction } from "react";

import { saveMachineRefill } from "../features/service-visit/machine-refill.service";
import { saveServiceVisit } from "../features/service-visit/service-visit.storage";

import type {
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
       * FLOW-18 RESUME / RETRY
       * --------------------------------------------------
       *
       * Machine refill has already been synced.
       *
       * Do not submit it again. Only finish the
       * interrupted local step transition.
       */
      if (
        activeVisit.machineRefill?.syncStatus === "synced" &&
        activeVisit.machineRefill.databaseId
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

      /*
       * INV-V3-03:
       * Client reserve after delivery must already be synced.
       *
       * Machine refill does not calculate or sync
       * client reserve balances.
       */
      if (
        activeVisit.reserveAfter?.syncStatus !== "synced" ||
        !activeVisit.reserveAfter.databaseId
      ) {
        throw new Error(
          "Client reserve after delivery must be synced before machine refill.",
        );
      }

      const configuredProducts = input.configuredProducts;

      const configuredById = new Map(
        configuredProducts.map((product) => [product.productId, product]),
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
          throw new Error("A product cannot appear more than once.");
        }

        const product = configuredById.get(quantity.productId);

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
        const looseQuantity = product.packaging.allowsLooseUnits
          ? quantity.looseQuantity
          : 0;

        if (!Number.isFinite(looseQuantity) || looseQuantity < 0) {
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
          quantity.issueQuantity * product.packaging.unitsPerIssueUnit +
          looseQuantity;

        /*
         * Zero reason is optional.
         *
         * It is only meaningful when no product was
         * actually added to the machine.
         */
        let zeroReason: MachineRefillZeroReason | null = null;

        let zeroReasonNote: string | null = null;

        if (actualQuantity === 0) {
          if (
            quantity.zeroReason !== null &&
            !MACHINE_REFILL_ZERO_REASONS.has(quantity.zeroReason)
          ) {
            throw new Error(`${product.name}: invalid zero refill reason.`);
          }

          zeroReason = quantity.zeroReason;

          if (zeroReason === "other") {
            const trimmedNote = quantity.zeroReasonNote?.trim() ?? "";

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

          normalizedUnit: product.packaging.baseUnit,

          zeroReason,

          zeroReasonNote,
        });

        productIds.add(quantity.productId);
      }

      const machineRefillConfirmedAt = new Date().toISOString();

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

      await saveServiceVisit(pendingMachineRefillVisit);

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
        const machineRefillDatabaseId = await saveMachineRefill({
          sourceVisitId: activeVisit.id,

          clientId: activeVisit.clientId,

          stopId: activeVisit.stopId,

          machineId: activeVisit.machineId,

          confirmedAt: machineRefillConfirmedAt,

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
         * Persist successful machine refill immediately.
         *
         * If the local step transition fails, the next
         * attempt must not submit machine refill again.
         */
        await saveServiceVisit(syncedMachineRefillVisit);

        setActiveVisit(syncedMachineRefillVisit);
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

        await saveServiceVisit(failedMachineRefillVisit);

        setActiveVisit(failedMachineRefillVisit);

        setErrorMessage(message);

        throw error;
      }

      /*
       * --------------------------------------------------
       * FLOW-18 COMPLETE
       * --------------------------------------------------
       *
       * Machine refill is already synced.
       * Reserve-after was handled during Client Delivery.
       *
       * Advance to the next service step.
       */
      const transitionedVisit = transitionToNextStep(
        syncedMachineRefillVisit,
        "machine_refill",
        new Date().toISOString(),
      );

      await saveServiceVisit(transitionedVisit);

      setActiveVisit(transitionedVisit);
      setErrorMessage(null);

      return transitionedVisit;
    },
    [activeVisit, setActiveVisit, setErrorMessage],
  );

  return {
    completeMachineRefill,
  };
}
