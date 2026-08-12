import { useCallback, type Dispatch, type SetStateAction } from "react";

import { loadClientInventoryProducts } from "../../src/features/service-visit/inventory-audit.service";
import { saveRestockDrop } from "../../src/features/service-visit/restock-drop.service";
import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import {
  type CompleteRestockDropInput,
  type RestockDropItemRecord,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../../src/features/service-visit/state/service-visit.transitions";

type UseRestockStepParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

export function useRestockStep({
  activeVisit,
  setActiveVisit,
  setErrorMessage,
}: UseRestockStepParams) {
  const completeRestockDrop = useCallback(
    async (input: CompleteRestockDropInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "restock") {
        throw new Error("Restock can only be completed during Step 6.");
      }

      const inventoryAudit = activeVisit.inventoryAudit;

      if (
        !inventoryAudit ||
        inventoryAudit.syncStatus !== "synced" ||
        !inventoryAudit.databaseId
      ) {
        throw new Error(
          "The inventory audit must be synced before restocking.",
        );
      }

      if (input.quantities.length === 0) {
        throw new Error("At least one restock quantity is required.");
      }

      const productIds = new Set<string>();

      for (const quantity of input.quantities) {
        if (!quantity.productId.trim()) {
          throw new Error("Every restock quantity must reference a product.");
        }

        if (productIds.has(quantity.productId)) {
          throw new Error("A product cannot appear more than once.");
        }

        if (
          !Number.isFinite(quantity.actualQuantity) ||
          quantity.actualQuantity < 0
        ) {
          throw new Error(
            "Every actual restock quantity must be zero or greater.",
          );
        }

        productIds.add(quantity.productId);
      }

      const configuredProducts = await loadClientInventoryProducts(
        activeVisit.clientId,
      );

      const configuredById = new Map(
        configuredProducts.map((product) => [product.productId, product]),
      );

      const auditByProductId = new Map(
        inventoryAudit.items.map((item) => [item.productId, item]),
      );

      const missingParProduct = configuredProducts.find(
        (product) =>
          auditByProductId.has(product.productId) && product.parLevel === null,
      );

      if (missingParProduct) {
        throw new Error(
          `${missingParProduct.name} does not have a configured par level.`,
        );
      }

      const expectedProductIds = inventoryAudit.items.map(
        (item) => item.productId,
      );

      if (expectedProductIds.some((productId) => !productIds.has(productId))) {
        throw new Error(
          "Confirm the actual quantity for every audited product.",
        );
      }

      const items: RestockDropItemRecord[] = input.quantities.map(
        (quantity) => {
          const auditItem = auditByProductId.get(quantity.productId);

          const configuredProduct = configuredById.get(quantity.productId);

          if (
            !auditItem ||
            !configuredProduct ||
            configuredProduct.parLevel === null
          ) {
            throw new Error(
              "The inventory configuration changed. Reload the step and try again.",
            );
          }

          const recommendedQuantity = Math.max(
            configuredProduct.parLevel - auditItem.quantity,
            0,
          );

          return {
            productId: auditItem.productId,
            sku: auditItem.sku,
            name: auditItem.name,
            category: auditItem.category,
            unitLabel: auditItem.unitLabel,
            countedQuantity: auditItem.quantity,
            parLevel: configuredProduct.parLevel,
            recommendedQuantity,
            actualQuantity: quantity.actualQuantity,
          };
        },
      );

      const confirmedAt = new Date().toISOString();

      const visitWithPendingRestock: ServiceVisit = {
        ...activeVisit,
        restockDrop: {
          databaseId: null,
          sourceVisitId: activeVisit.id,
          inventoryAuditId: inventoryAudit.databaseId,
          confirmedAt,
          items,
          syncStatus: "pending_sync",
          syncError: null,
        },
        updatedAt: confirmedAt,
      };

      await saveServiceVisit(visitWithPendingRestock);

      setActiveVisit(visitWithPendingRestock);

      try {
        const databaseId = await saveRestockDrop({
          sourceVisitId: activeVisit.id,
          inventoryAuditId: inventoryAudit.databaseId,
          clientId: activeVisit.clientId,
          stopId: activeVisit.stopId,
          machineId: activeVisit.machineId,
          confirmedAt,
          quantities: input.quantities,
        });

        const syncedAt = new Date().toISOString();

        const visitWithSyncedRestock: ServiceVisit = {
          ...visitWithPendingRestock,
          restockDrop: {
            ...visitWithPendingRestock.restockDrop!,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: syncedAt,
        };

        const updatedVisit = transitionToNextStep(
          visitWithSyncedRestock,
          "restock",
          syncedAt,
        );

        await saveServiceVisit(updatedVisit);

        setActiveVisit(updatedVisit);
        setErrorMessage(null);

        return updatedVisit;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync the restock drop.";

        const failedVisit: ServiceVisit = {
          ...visitWithPendingRestock,
          restockDrop: {
            ...visitWithPendingRestock.restockDrop!,
            syncStatus: "failed",
            syncError: message,
          },
          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(failedVisit);

        setActiveVisit(failedVisit);
        setErrorMessage(message);

        throw new Error(message);
      }
    },
    [activeVisit, setActiveVisit, setErrorMessage],
  );

  return {
    completeRestockDrop,
  };
}
