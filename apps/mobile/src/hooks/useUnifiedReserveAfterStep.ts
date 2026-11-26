
import { useCallback, useRef } from "react";

import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";
import { calculateClientReserveAfter } from "../features/service-visit/client-reserve-after.calculate";
import { syncUnifiedReserveAfter } from "../features/service-visit/client-reserve-after.unified-sync";
import { applyUnifiedReserveAfterSyncResult } from "../features/service-visit/client-reserve-after.unified-sync-state";

type CommitVisitMutation = (
  mutation: (
    visit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type Params = {
  commitVisitMutation: CommitVisitMutation;
  clearError: () => void;
};

export function useUnifiedReserveAfterStep({
  commitVisitMutation,
  clearError,
}: Params) {
  const syncInProgressRef = useRef(false);

  const synchronizeReserveAfter = useCallback(
    async (
      savedVisit: MultiMachineServiceVisit,
    ): Promise<MultiMachineServiceVisit> => {
      let databaseId: string;

      try {
        databaseId = await syncUnifiedReserveAfter(savedVisit);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to synchronize final client inventory.";

        await commitVisitMutation((current) =>
          applyUnifiedReserveAfterSyncResult(current, savedVisit, {
            status: "failed",
            error: message,
          }),
        );

        throw new Error(message);
      }

      const updatedVisit = await commitVisitMutation((current) =>
        applyUnifiedReserveAfterSyncResult(current, savedVisit, {
          status: "synced",
          databaseId,
        }),
      );

      clearError();
      return updatedVisit;
    },
    [commitVisitMutation, clearError],
  );

  const syncReserveAfter = useCallback(
    async (): Promise<MultiMachineServiceVisit> => {
      if (syncInProgressRef.current) {
        throw new Error(
          "Final client inventory synchronization is already running.",
        );
      }

      syncInProgressRef.current = true;

      try {
        const savedVisit = await commitVisitMutation((visit) => {
          if (
            visit.status !== "in_progress" ||
            visit.currentStep !== "reserve_after"
          ) {
            throw new Error(
              "Final client inventory is not the current visit step.",
            );
          }

          if (visit.machines.length === 0) {
            throw new Error(
              "The service visit has no assigned machines.",
            );
          }

          if (visit.machines.some((machine) => !machine.completedAt)) {
            throw new Error(
              "All assigned machines must be completed first.",
            );
          }

          if (
            !visit.inventoryAudit ||
            visit.inventoryAudit.syncStatus !== "synced" ||
            !visit.inventoryAudit.databaseId
          ) {
            throw new Error(
              "Client reserve audit must be synchronized first.",
            );
          }

          if (
            !visit.restockDrop ||
            visit.restockDrop.syncStatus !== "synced" ||
            !visit.restockDrop.databaseId
          ) {
            throw new Error(
              "Client delivery must be synchronized first.",
            );
          }

          if (visit.reserveAfter?.syncStatus === "synced") {
            throw new Error(
              "Final client inventory is already synchronized.",
            );
          }

          if (
            visit.reserveAfter &&
            visit.reserveAfter.sourceVisitId !== visit.id
          ) {
            throw new Error(
              "Saved final inventory belongs to another visit.",
            );
          }

          if (visit.reserveAfter) {
            return visit;
          }

          const now = new Date().toISOString();

          return {
            ...visit,
            reserveAfter: {
              databaseId: null,
              sourceVisitId: visit.id,
              calculatedAt: now,
              items: calculateClientReserveAfter(
                visit.inventoryAudit.items,
                visit.restockDrop.items,
              ),
              syncStatus: "pending_sync",
              syncError: null,
            },
            updatedAt: now,
          };
        });

        return await synchronizeReserveAfter(savedVisit);
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [commitVisitMutation, synchronizeReserveAfter],
  );

  return {
    syncReserveAfter,
    retryReserveAfterSync: syncReserveAfter,
  };
}
