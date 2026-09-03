import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  loadClientInventoryProducts,
} from "../features/service-visit/inventory-audit.service";

import {
  saveMachineRefill,
} from "../features/service-visit/machine-refill.service";

import {
  saveServiceVisit,
} from "../features/service-visit/service-visit.storage";

import type {
  CompleteMachineRefillInput,
  MachineRefillItemRecord,
  ServiceVisit,
} from "../features/service-visit/service-visit.types";

import {
  transitionToNextStep,
} from "../features/service-visit/state/service-visit.transitions";

type UseMachineRefillStepParams = {
  activeVisit: ServiceVisit | null;

  setActiveVisit: Dispatch<
    SetStateAction<ServiceVisit | null>
  >;

  setErrorMessage: Dispatch<
    SetStateAction<string | null>
  >;
};

export function useMachineRefillStep({
  activeVisit,
  setActiveVisit,
  setErrorMessage,
}: UseMachineRefillStepParams) {
  const completeMachineRefill =
    useCallback(
      async (
        input: CompleteMachineRefillInput,
      ): Promise<ServiceVisit> => {
        if (!activeVisit) {
          throw new Error(
            "There is no active service visit.",
          );
        }

        if (
          activeVisit.currentStep !==
          "machine_refill"
        ) {
          throw new Error(
            "Machine refill cannot be completed yet.",
          );
        }

        /*
         * FLOW-18 follows FLOW-17.
         *
         * The delivery is NOT the source of the
         * machine stock. This dependency only ensures
         * the workflow happened in order.
         */
        if (
          !activeVisit.restockDrop ||
          activeVisit.restockDrop
            .syncStatus !== "synced" ||
          !activeVisit.restockDrop
            .databaseId
        ) {
          throw new Error(
            "Client delivery must be synced before machine refill.",
          );
        }

        const configuredProducts =
          await loadClientInventoryProducts(
            activeVisit.clientId,
          );

        const configuredById =
          new Map(
            configuredProducts.map(
              (product) => [
                product.productId,
                product,
              ],
            ),
          );

        const productIds =
          new Set<string>();

        const items: MachineRefillItemRecord[] =
          [];

        for (const quantity of
          input.quantities) {
          if (
            !quantity.productId.trim()
          ) {
            throw new Error(
              "Every machine refill quantity must reference a product.",
            );
          }

          if (
            productIds.has(
              quantity.productId,
            )
          ) {
            throw new Error(
              "A product cannot appear more than once.",
            );
          }

          const product =
            configuredById.get(
              quantity.productId,
            );

          if (!product) {
            throw new Error(
              "A selected product is no longer configured for this client.",
            );
          }

          if (
            !Number.isFinite(
              quantity.issueQuantity,
            ) ||
            quantity.issueQuantity < 0 ||
            !Number.isInteger(
              quantity.issueQuantity,
            )
          ) {
            throw new Error(
              `${product.name}: package quantity must be a whole number.`,
            );
          }

          if (
            !Number.isFinite(
              quantity.looseQuantity,
            ) ||
            quantity.looseQuantity < 0
          ) {
            throw new Error(
              `${product.name}: loose quantity cannot be negative.`,
            );
          }

          if (
            !product.packaging
              .allowsLooseUnits &&
            quantity.looseQuantity > 0
          ) {
            throw new Error(
              `${product.name} does not allow loose units.`,
            );
          }

          if (
            !product.packaging
              .allowsPartialBaseUnit &&
            !Number.isInteger(
              quantity.looseQuantity,
            )
          ) {
            throw new Error(
              `${product.name} does not allow partial ${product.packaging.baseUnit} quantities.`,
            );
          }

          const actualQuantity =
            quantity.issueQuantity *
              product.packaging
                .unitsPerIssueUnit +
            quantity.looseQuantity;

          items.push({
            productId:
              product.productId,

            sku:
              product.sku,

            name:
              product.name,

            category:
              product.category,

            unitLabel:
              product.unitLabel,

            issueQuantity:
              quantity.issueQuantity,

            looseQuantity:
              quantity.looseQuantity,

            actualQuantity,

            normalizedUnit:
              product.packaging
                .baseUnit,
          });

          productIds.add(
            quantity.productId,
          );
        }

        const now =
          new Date().toISOString();

        const pendingVisit: ServiceVisit =
          {
            ...activeVisit,

            machineRefill: {
              databaseId: null,

              sourceVisitId:
                activeVisit.id,

              confirmedAt: now,

              items,

              syncStatus:
                "pending_sync",

              syncError: null,
            },

            updatedAt: now,
          };

        /*
         * Persist BEFORE network sync so an app
         * restart cannot lose the driver's input.
         */
        await saveServiceVisit(
          pendingVisit,
        );

        setActiveVisit(
          pendingVisit,
        );

        try {
          const databaseId =
            await saveMachineRefill({
              sourceVisitId:
                activeVisit.id,

              clientId:
                activeVisit.clientId,

              stopId:
                activeVisit.stopId,

              machineId:
                activeVisit.machineId,

              confirmedAt: now,

              quantities:
                input.quantities,
            });

          const syncedVisit: ServiceVisit =
            {
              ...pendingVisit,

              machineRefill: {
                ...pendingVisit.machineRefill!,

                databaseId,

                syncStatus:
                  "synced",

                syncError: null,
              },
            };

          const transitionedVisit =
            transitionToNextStep(
              syncedVisit,
              "machine_refill",
              now,
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
          const message =
            error instanceof Error
              ? error.message
              : "Unable to sync machine refill.";

          const failedVisit: ServiceVisit =
            {
              ...pendingVisit,

              machineRefill: {
                ...pendingVisit.machineRefill!,

                syncStatus:
                  "failed",

                syncError: message,
              },
            };

          await saveServiceVisit(
            failedVisit,
          );

          setActiveVisit(
            failedVisit,
          );

          setErrorMessage(message);

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