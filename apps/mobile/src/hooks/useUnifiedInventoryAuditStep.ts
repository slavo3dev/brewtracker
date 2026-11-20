import { useCallback, useRef } from "react";

import { prepareInventoryAudit } from "../features/service-visit/inventory-audit.prepare";
import { prepareUnifiedInventoryAuditRetry } from "../features/service-visit/inventory-audit.retry";
import { syncUnifiedInventoryAudit } from "../features/service-visit/inventory-audit.sync";
import { applyUnifiedInventoryAuditSyncResult } from "../features/service-visit/inventory-audit.sync-state";
import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";
import type { CompleteInventoryAuditInput } from "../features/service-visit/service-visit.types";

type CommitVisitMutation = (
  mutation: (
    visit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type Params = {
  commitVisitMutation: CommitVisitMutation;
  clearError: () => void;
};

export function useUnifiedInventoryAuditStep({
  commitVisitMutation,
  clearError,
}: Params) {
  const syncInProgressRef = useRef(false);

  const runExclusively = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      if (syncInProgressRef.current) {
        throw new Error(
          "Inventory Audit synchronization is already in progress.",
        );
      }

      syncInProgressRef.current = true;

      try {
        return await operation();
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [],
  );

  const completeInventoryAudit = useCallback(
    async (
      input: CompleteInventoryAuditInput,
    ): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        const result = await commitVisitMutation((visit) => {
          if (
            visit.status !== "in_progress" ||
            visit.currentStep !== "inventory_audit"
          ) {
            throw new Error("Inventory Audit is not the current visit step.");
          }

          if (visit.inventoryAudit) {
            throw new Error(
              "An inventory audit already exists. " +
                "Retry synchronization instead of replacing saved quantities.",
            );
          }

          const items = prepareInventoryAudit(input);
          const now = new Date().toISOString();

          return {
            ...visit,
            inventoryAudit: {
              databaseId: null,
              sourceVisitId: visit.id,
              countedAt: now,
              items,
              configuredProducts: input.configuredProducts.map((product) => ({
                ...product,
                packaging: { ...product.packaging },
              })),
              syncStatus: "pending_sync",
              syncError: null,
            },
            updatedAt: now,
          };
        });

        let databaseId: string;

        try {
          databaseId = await syncUnifiedInventoryAudit(result);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to synchronize the client reserve audit.";

          await commitVisitMutation((current) =>
            applyUnifiedInventoryAuditSyncResult(current, result, {
              status: "failed",
              error: message,
            }),
          );

          throw new Error(message);
        }

        const updatedVisit = await commitVisitMutation((current) =>
          applyUnifiedInventoryAuditSyncResult(current, result, {
            status: "synced",
            databaseId,
          }),
        );

        clearError();
        return updatedVisit;
      }),
    [commitVisitMutation, clearError, runExclusively],
  );

  const retryInventoryAuditSync = useCallback(
    async (): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        const savedVisit = await commitVisitMutation(async (visit) => {
          const prepared = await prepareUnifiedInventoryAuditRetry(visit);

          // Persist recovered packaging before attempting synchronization.
          return prepared;
        });

        let databaseId: string;

        try {
          databaseId = await syncUnifiedInventoryAudit(savedVisit);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to synchronize the saved inventory audit.";

          await commitVisitMutation((current) =>
            applyUnifiedInventoryAuditSyncResult(current, savedVisit, {
              status: "failed",
              error: message,
            }),
          );

          throw new Error(message);
        }

        const updatedVisit = await commitVisitMutation((current) =>
          applyUnifiedInventoryAuditSyncResult(current, savedVisit, {
            status: "synced",
            databaseId,
          }),
        );

        clearError();
        return updatedVisit;
      }),
    [commitVisitMutation, clearError, runExclusively],
  );

  return {
    completeInventoryAudit,
    retryInventoryAuditSync,
  };
}
