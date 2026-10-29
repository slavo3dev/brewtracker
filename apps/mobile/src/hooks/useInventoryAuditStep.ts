import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  loadClientInventoryProducts,
  saveClientReserveBefore,
} from "../../src/features/service-visit/inventory-audit.service";
import { recoverLegacyAuditConfiguration } from
  "../../src/features/service-visit/inventory-audit-recovery";
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

      const configuredProducts = input.configuredProducts;

      const configuredById = new Map(
        configuredProducts.map((product) => [product.productId, product]),
      );

      // Protect an unfinished audit from losing previously saved products.
      const savedAudit = activeVisit.inventoryAudit;

      const hasUnfinishedAudit =
        savedAudit != null &&
        savedAudit.sourceVisitId === activeVisit.id &&
        savedAudit.syncStatus !== "synced";

      if (hasUnfinishedAudit) {
        throw new Error(
          "An unfinished inventory audit already exists. " +
            "Retry synchronization or reconcile the saved audit " +
            "instead of recording a new one.",
        );
      }

      const missingRequiredProduct = configuredProducts.some(
        (product) => product.isRequired && !productIds.has(product.productId),
      );

      if (missingRequiredProduct) {
        throw new Error("Enter a quantity for every required client product.");
      }

      const recordedAt = new Date().toISOString();

      const previousBalances = input.previousBalances;

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

          // Preserve the configuration used for this audit.
          configuredProducts: input.configuredProducts.map((product) => ({
            ...product,
            packaging: { ...product.packaging },
          })),

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
          quantities: input.counts.map((count) => {
            const product = configuredById.get(count.productId);

            if (!product) {
              throw new Error(
                `Missing original packaging configuration for product ${count.productId}.`,
              );
            }

            return {
              ...count,
              expectedPackaging: product.packaging,
            };
          }),
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

  const retryInventoryAuditSync = useCallback(
    async (): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "inventory_audit") {
        throw new Error(
          "Inventory audit synchronization is only available during Step 5.",
        );
      }

      const savedAudit = activeVisit.inventoryAudit;

      if (
        !savedAudit ||
        savedAudit.sourceVisitId !== activeVisit.id ||
        savedAudit.syncStatus === "synced"
      ) {
        throw new Error("There is no unfinished inventory audit to retry.");
      }

      
      let auditForRetry = savedAudit;

      if (!savedAudit.configuredProducts?.length) {
        const availableProducts = await loadClientInventoryProducts(
          activeVisit.clientId,
        );

        const recoveredProducts = recoverLegacyAuditConfiguration(
          savedAudit,
          availableProducts,
        );

        auditForRetry = {
          ...savedAudit,
          configuredProducts: recoveredProducts,
        };

        // Persist recovery before attempting network synchronization.
        // Keep all original audit items and their countedAt timestamp.
        const recoveredVisit: ServiceVisit = {
          ...activeVisit,
          inventoryAudit: auditForRetry,
          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(recoveredVisit);
        setActiveVisit(recoveredVisit);
      }

      const productsById = new Map(
        auditForRetry.configuredProducts!.map((product) => [
          product.productId,
          product,
        ]),
      );

      if (savedAudit.items.length === 0) {
        throw new Error("The saved inventory audit contains no products.");
      }

      const productIds = new Set<string>();

      const quantities = savedAudit.items.map((item) => {
        if (productIds.has(item.productId)) {
          throw new Error("The saved inventory audit contains duplicate products.");
        }

        productIds.add(item.productId);

        const product = productsById.get(item.productId);

        if (!product) {
          throw new Error(
            `Original packaging is missing for product ${item.productId}.`,
          );
        }

        const prepared = prepareClientReserveQuantity({
          productId: item.productId,
          packaging: product.packaging,
          quantity: {
            issueUnits: item.issueQuantity,
            looseBaseUnits: item.looseQuantity,
          },
        });

        if (
          prepared.normalizedQuantity !== item.normalizedQuantity ||
          prepared.normalizedUnit !== item.normalizedUnit
        ) {
          throw new Error(
            `Saved inventory quantities do not match original packaging for product ${item.productId}.`,
          );
        }

        return {
          productId: item.productId,
          issueQuantity: item.issueQuantity,
          looseQuantity: item.looseQuantity,
          expectedPackaging: product.packaging,
        };
      });

      try {
        const databaseId = await saveClientReserveBefore({
          sourceVisitId: savedAudit.sourceVisitId,
          clientId: activeVisit.clientId,
          stopId: activeVisit.stopId,
          machineId: activeVisit.machineId,
          recordedAt: savedAudit.countedAt,
          quantities,
        });

        const syncedAt = new Date().toISOString();

        const syncedVisit: ServiceVisit = {
          ...activeVisit,
          inventoryAudit: {
            ...auditForRetry,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: syncedAt,
        };

        const updatedVisit = transitionToNextStep(
          syncedVisit,
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
            : "Unable to synchronize the saved inventory audit.";

        const failedVisit: ServiceVisit = {
          ...activeVisit,
          inventoryAudit: {
            ...auditForRetry,
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
    retryInventoryAuditSync,
  };
}
