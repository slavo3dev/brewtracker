import { useCallback, useRef } from "react";

import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";
import { prepareRestockDrop } from "../features/service-visit/restock-drop.prepare";
import { syncUnifiedRestockDrop } from "../features/service-visit/restock-drop.sync";
import { applyUnifiedRestockSyncResult } from "../features/service-visit/restock-drop.sync-state";
import type { CompleteRestockDropInput } from "../features/service-visit/service-visit.types";

type CommitVisitMutation = (
  mutation: (
    visit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type Params = {
  commitVisitMutation: CommitVisitMutation;
  clearError: () => void;
};

export function useUnifiedRestockStep({
  commitVisitMutation,
  clearError,
}: Params) {
  const syncInProgressRef = useRef(false);

  const runExclusively = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      if (syncInProgressRef.current) {
        throw new Error(
          "Client delivery synchronization is already in progress.",
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

  const synchronizeDelivery = useCallback(
    async (
      savedVisit: MultiMachineServiceVisit,
    ): Promise<MultiMachineServiceVisit> => {
      let databaseId: string;

      try {
        databaseId = await syncUnifiedRestockDrop(savedVisit);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to synchronize the client delivery.";

        await commitVisitMutation((current) =>
          applyUnifiedRestockSyncResult(current, savedVisit, {
            status: "failed",
            error: message,
          }),
        );

        throw new Error(message);
      }

      const updatedVisit = await commitVisitMutation((current) =>
        applyUnifiedRestockSyncResult(current, savedVisit, {
          status: "synced",
          databaseId,
        }),
      );

      clearError();
      return updatedVisit;
    },
    [commitVisitMutation, clearError],
  );

  const completeRestockDrop = useCallback(
    async (
      input: CompleteRestockDropInput,
    ): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        const savedVisit = await commitVisitMutation((visit) => {
          if (
            visit.status !== "in_progress" ||
            visit.currentStep !== "restock"
          ) {
            throw new Error("Restock is not the current visit step.");
          }

          if (visit.restockDrop) {
            throw new Error(
              "A client delivery already exists. Retry synchronization instead.",
            );
          }

          if (
            !visit.inventoryAudit ||
            visit.inventoryAudit.syncStatus !== "synced" ||
            !visit.inventoryAudit.databaseId
          ) {
            throw new Error(
              "Client reserve audit must be synchronized before delivery.",
            );
          }

          const items = prepareRestockDrop(input, visit.inventoryAudit);
          const now = new Date().toISOString();

          return {
            ...visit,
            restockDrop: {
              databaseId: null,
              sourceVisitId: visit.id,
              confirmedAt: now,
              items,
              syncStatus: "pending_sync",
              syncError: null,
            },
            updatedAt: now,
          };
        });

        return synchronizeDelivery(savedVisit);
      }),
    [commitVisitMutation, runExclusively, synchronizeDelivery],
  );

  const retryRestockSync = useCallback(
    async (): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        const savedVisit = await commitVisitMutation((visit) => {
          if (
            visit.status !== "in_progress" ||
            visit.currentStep !== "restock"
          ) {
            throw new Error("Restock is not the current visit step.");
          }

          if (!visit.restockDrop) {
            throw new Error("No saved client delivery is available to retry.");
          }

          if (visit.restockDrop.sourceVisitId !== visit.id) {
            throw new Error("Saved delivery belongs to a different visit.");
          }

          if (visit.restockDrop.syncStatus === "synced") {
            throw new Error("Client delivery is already synchronized.");
          }

          return visit;
        });

        return synchronizeDelivery(savedVisit);
      }),
    [commitVisitMutation, runExclusively, synchronizeDelivery],
  );

  return {
    completeRestockDrop,
    retryRestockSync,
  };
}
