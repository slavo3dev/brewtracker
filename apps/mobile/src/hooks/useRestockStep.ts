import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  loadClientInventoryProducts,
} from "../../src/features/service-visit/inventory-audit.service";

import {
  saveClientDelivery,
} from "../../src/features/service-visit/restock-drop.service";

import {
  saveServiceVisit,
} from "../../src/features/service-visit/service-visit.storage";

import {
  type CompleteRestockDropInput,
  type RestockDropItemRecord,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";

import {
  transitionToNextStep,
} from "../../src/features/service-visit/state/service-visit.transitions";

type UseRestockStepParams = {
  activeVisit: ServiceVisit | null;

  setActiveVisit: Dispatch<
    SetStateAction<ServiceVisit | null>
  >;

  setErrorMessage: Dispatch<
    SetStateAction<string | null>
  >;
};

export function useRestockStep({
  activeVisit,
  setActiveVisit,
  setErrorMessage,
}: UseRestockStepParams) {
  const completeRestockDrop =
    useCallback(
      async (
        input: CompleteRestockDropInput,
      ): Promise<ServiceVisit> => {
        if (!activeVisit) {
          throw new Error(
            "There is no active service visit.",
          );
        }

        if (
          activeVisit.currentStep !==
          "restock"
        ) {
          throw new Error(
            "Delivery can only be completed during Step 6.",
          );
        }

        const reserveBefore =
          activeVisit.inventoryAudit;

        if (
          !reserveBefore ||
          reserveBefore.syncStatus !==
            "synced" ||
          !reserveBefore.databaseId
        ) {
          throw new Error(
            "The client reserve count must be synced before delivery.",
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

        const reserveByProductId =
          new Map(
            reserveBefore.items.map(
              (item) => [
                item.productId,
                item,
              ],
            ),
          );

        const requiredDeliveryIds =
          new Set<string>();

        for (const reserveItem of
          reserveBefore.items) {
          const product =
            configuredById.get(
              reserveItem.productId,
            );

          if (
            !product ||
            product.parLevel === null
          ) {
            throw new Error(
              `${reserveItem.name} does not have a configured par level.`,
            );
          }

          const recommended =
            Math.max(
              product.parLevel -
                reserveItem.normalizedQuantity,
              0,
            );

          if (recommended > 0) {
            requiredDeliveryIds.add(
              reserveItem.productId,
            );
          }
        }

        const suppliedIds =
          new Set<string>();

        for (const quantity of
          input.quantities) {
          if (
            !quantity.productId.trim()
          ) {
            throw new Error(
              "Every delivery quantity must reference a product.",
            );
          }

          if (
            suppliedIds.has(
              quantity.productId,
            )
          ) {
            throw new Error(
              "A product cannot appear more than once.",
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
              "Package quantities must be whole numbers of zero or greater.",
            );
          }

          if (
            !Number.isFinite(
              quantity.looseQuantity,
            ) ||
            quantity.looseQuantity < 0
          ) {
            throw new Error(
              "Loose quantities must be zero or greater.",
            );
          }

          suppliedIds.add(
            quantity.productId,
          );
        }

        const missingProduct =
          [...requiredDeliveryIds].find(
            (productId) =>
              !suppliedIds.has(
                productId,
              ),
          );

        if (missingProduct) {
          throw new Error(
            "Confirm the actual delivery for every product that requires delivery.",
          );
        }

        const unexpected =
          input.quantities.find(
            (quantity) =>
              !requiredDeliveryIds.has(
                quantity.productId,
              ),
          );

        if (unexpected) {
          throw new Error(
            "A submitted product does not require delivery.",
          );
        }

        const items: RestockDropItemRecord[] =
          input.quantities.map(
            (quantity) => {
              const reserveItem =
                reserveByProductId.get(
                  quantity.productId,
                );

              const product =
                configuredById.get(
                  quantity.productId,
                );

              if (
                !reserveItem ||
                !product ||
                product.parLevel === null
              ) {
                throw new Error(
                  "The inventory configuration changed. Reload the step and try again.",
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

              const recommendedQuantity =
                Math.max(
                  product.parLevel -
                    reserveItem.normalizedQuantity,
                  0,
                );

              return {
                productId:
                  product.productId,

                sku: product.sku,

                name: product.name,

                category:
                  product.category,

                unitLabel:
                  product.unitLabel,

                reserveBeforeQuantity:
                  reserveItem.normalizedQuantity,

                parLevel:
                  product.parLevel,

                recommendedQuantity,

                issueQuantity:
                  quantity.issueQuantity,

                looseQuantity:
                  quantity.looseQuantity,

                actualQuantity,

                normalizedUnit:
                  product.packaging.baseUnit,
              };
            },
          );

        const confirmedAt =
          new Date().toISOString();

        const pendingVisit: ServiceVisit = {
          ...activeVisit,

          restockDrop: {
            databaseId: null,

            sourceVisitId:
              activeVisit.id,

            confirmedAt,

            items,

            syncStatus:
              "pending_sync",

            syncError: null,
          },

          updatedAt: confirmedAt,
        };

        await saveServiceVisit(
          pendingVisit,
        );

        setActiveVisit(
          pendingVisit,
        );

        try {
          const databaseId =
            await saveClientDelivery({
              sourceVisitId:
                activeVisit.id,

              clientId:
                activeVisit.clientId,

              stopId:
                activeVisit.stopId,

              machineId:
                activeVisit.machineId,

              confirmedAt,

              quantities:
                input.quantities,
            });

          const syncedAt =
            new Date().toISOString();

          const syncedVisit: ServiceVisit = {
            ...pendingVisit,

            restockDrop: {
              ...pendingVisit
                .restockDrop!,

              databaseId,

              syncStatus:
                "synced",

              syncError: null,
            },

            updatedAt: syncedAt,
          };

          const updatedVisit =
            transitionToNextStep(
              syncedVisit,
              "restock",
              syncedAt,
            );

          await saveServiceVisit(
            updatedVisit,
          );

          setActiveVisit(
            updatedVisit,
          );

          setErrorMessage(null);

          return updatedVisit;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to sync the client delivery.";

          const failedVisit: ServiceVisit = {
            ...pendingVisit,

            restockDrop: {
              ...pendingVisit
                .restockDrop!,

              syncStatus:
                "failed",

              syncError:
                message,
            },

            updatedAt:
              new Date().toISOString(),
          };

          await saveServiceVisit(
            failedVisit,
          );

          setActiveVisit(
            failedVisit,
          );

          setErrorMessage(
            message,
          );

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
    completeRestockDrop,
  };
}