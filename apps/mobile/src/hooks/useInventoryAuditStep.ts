import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  loadClientInventoryProducts,
  saveInventoryAudit,
} from "../../src/features/service-visit/inventory-audit.service";
import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import {
  type CompleteInventoryAuditInput,
  type InventoryAuditItemRecord,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../../src/features/service-visit/state/service-visit.transitions";

type UseInventoryAuditStepParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

export function useInventoryAuditStep({
  activeVisit,
  setActiveVisit,
  setErrorMessage,
}: UseInventoryAuditStepParams) {
  const completeInventoryAudit = useCallback(
    async (input: CompleteInventoryAuditInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "inventory_audit") {
        throw new Error(
          "The inventory audit can only be completed during Step 5.",
        );
      }

      if (input.counts.length === 0) {
        throw new Error("At least one inventory count is required.");
      }

      const productIds = new Set<string>();

      for (const count of input.counts) {
        if (!count.productId.trim()) {
          throw new Error("Every inventory count must reference a product.");
        }

        if (productIds.has(count.productId)) {
          throw new Error(
            "A product cannot appear more than once in the audit.",
          );
        }

        if (!Number.isFinite(count.quantity) || count.quantity < 0) {
          throw new Error("Every inventory quantity must be zero or greater.");
        }

        productIds.add(count.productId);
      }

      const configuredProducts = await loadClientInventoryProducts(
        activeVisit.clientId,
      );

      const configuredById = new Map(
        configuredProducts.map((product) => [product.productId, product]),
      );

      const missingRequiredProduct = configuredProducts.some(
        (product) => product.isRequired && !productIds.has(product.productId),
      );

      if (missingRequiredProduct) {
        throw new Error("Enter a quantity for every required client product.");
      }

      const items: InventoryAuditItemRecord[] = input.counts.map((count) => {
        const product = configuredById.get(count.productId);

        if (!product) {
          throw new Error(
            "The inventory list changed. Reload the step and try again.",
          );
        }

        return {
          productId: product.productId,
          sku: product.sku,
          name: product.name,
          category: product.category,
          unitLabel: product.unitLabel,
          quantity: count.quantity,
        };
      });

      const countedAt = new Date().toISOString();

      /*
       * Save locally before attempting network sync.
       */
      const visitWithPendingAudit: ServiceVisit = {
        ...activeVisit,
        inventoryAudit: {
          databaseId: null,
          sourceVisitId: activeVisit.id,
          countedAt,
          items,
          syncStatus: "pending_sync",
          syncError: null,
        },
        updatedAt: countedAt,
      };

      await saveServiceVisit(visitWithPendingAudit);

      setActiveVisit(visitWithPendingAudit);

      try {
        const databaseId = await saveInventoryAudit({
          sourceVisitId: activeVisit.id,
          clientId: activeVisit.clientId,
          stopId: activeVisit.stopId,
          machineId: activeVisit.machineId,
          countedAt,
          counts: input.counts,
        });

        const syncedAt = new Date().toISOString();

        const visitWithSyncedAudit: ServiceVisit = {
          ...visitWithPendingAudit,
          inventoryAudit: {
            ...visitWithPendingAudit.inventoryAudit!,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: syncedAt,
        };

        const updatedVisit = transitionToNextStep(
          visitWithSyncedAudit,
          "inventory_audit",
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
            : "Unable to sync the inventory audit.";

        const failedVisit: ServiceVisit = {
          ...visitWithPendingAudit,
          inventoryAudit: {
            ...visitWithPendingAudit.inventoryAudit!,
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
    completeInventoryAudit,
  };
}
