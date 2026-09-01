import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  loadClientInventoryProducts,
  loadPreviousClientReserveBalances,
  saveClientReserveBefore,
} from "../../src/features/service-visit/inventory-audit.service";
import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import {
  type CompleteInventoryAuditInput,
  type InventoryAuditItemRecord,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../../src/features/service-visit/state/service-visit.transitions";

import {
  calculateClientReserveDecrease,
  prepareClientReserveQuantity,
} from "@brewtracker/types";

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
        throw new Error("Client reserve can only be completed during Step 5.");
      }

      if (input.counts.length === 0) {
        throw new Error("At least one client reserve quantity is required.");
      }

      const productIds = new Set<string>();

      for (const count of input.counts) {
        if (!count.productId.trim()) {
          throw new Error("Every reserve count must reference a product.");
        }

        if (productIds.has(count.productId)) {
          throw new Error("A product cannot appear more than once.");
        }

        if (
          !Number.isFinite(count.issueQuantity) ||
          count.issueQuantity < 0 ||
          !Number.isInteger(count.issueQuantity)
        ) {
          throw new Error(
            "Package quantities must be whole numbers zero or greater.",
          );
        }

        if (!Number.isFinite(count.looseQuantity) || count.looseQuantity < 0) {
          throw new Error("Loose quantities must be zero or greater.");
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

      const recordedAt = new Date().toISOString();

      const previousBalances = await loadPreviousClientReserveBalances(
        activeVisit.clientId,
        configuredProducts,
        recordedAt,
      );

      const items: InventoryAuditItemRecord[] = input.counts.map((count) => {
        const product = configuredById.get(count.productId);

        if (!product) {
          throw new Error(
            "The inventory list changed. Reload the step and try again.",
          );
        }

        const prepared = prepareClientReserveQuantity({
          productId: product.productId,

          packaging: product.packaging,

          quantity: {
            issueUnits: count.issueQuantity,

            looseBaseUnits: count.looseQuantity,
          },
        });

        const previousReserveAfter =
          previousBalances.get(product.productId) ?? null;

        const comparison = calculateClientReserveDecrease(
          previousReserveAfter,
          prepared.normalizedQuantity,
        );

        return {
          productId: product.productId,

          sku: product.sku,

          name: product.name,

          category: product.category,

          unitLabel: product.unitLabel,

          issueQuantity: count.issueQuantity,

          looseQuantity: count.looseQuantity,

          normalizedQuantity: prepared.normalizedQuantity,

          normalizedUnit: prepared.normalizedUnit,

          previousReserveAfter: comparison.previousReserveAfter,

          reserveDecrease: comparison.reserveDecrease,
        };
      });

      // Save locally first
      const visitWithPendingAudit: ServiceVisit = {
        ...activeVisit,

        inventoryAudit: {
          databaseId: null,

          sourceVisitId: activeVisit.id,

          countedAt: recordedAt,

          items,

          syncStatus: "pending_sync",

          syncError: null,
        },

        updatedAt: recordedAt,
      };

      await saveServiceVisit(visitWithPendingAudit);

      setActiveVisit(visitWithPendingAudit);

      // Sync snapshot
      try {
        const databaseId = await saveClientReserveBefore({
          sourceVisitId: activeVisit.id,

          clientId: activeVisit.clientId,

          stopId: activeVisit.stopId,

          machineId: activeVisit.machineId,

          recordedAt,

          quantities: input.counts,
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
            : "Unable to sync client reserve.";

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
