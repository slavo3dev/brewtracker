import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";
import { advanceMultiMachineVisitStep } from "./state/multi-machine-visit.workflow";

type SyncResult =
  | { status: "synced"; databaseId: string }
  | { status: "failed"; error: string };

export function applyUnifiedReserveAfterSyncResult(
  current: MultiMachineServiceVisit,
  source: MultiMachineServiceVisit,
  result: SyncResult,
): MultiMachineServiceVisit {
  const original = source.reserveAfter;
  const existing = current.reserveAfter;

  if (
    !original ||
    !existing ||
    current.id !== source.id ||
    current.status !== "in_progress" ||
    current.currentStep !== "reserve_after" ||
    existing.sourceVisitId !== original.sourceVisitId ||
    existing.calculatedAt !== original.calculatedAt ||
    existing.syncStatus === "synced" ||
    existing.items.length !== original.items.length ||
    existing.items.some((item, index) => {
      const sourceItem = original.items[index];

      return (
        item.productId !== sourceItem.productId ||
        item.reserveBeforeQuantity !==
          sourceItem.reserveBeforeQuantity ||
        item.deliveredQuantity !== sourceItem.deliveredQuantity ||
        item.reserveAfterQuantity !== sourceItem.reserveAfterQuantity ||
        item.normalizedUnit !== sourceItem.normalizedUnit
      );
    })
  ) {
    return current;
  }

  const now = new Date().toISOString();

  if (result.status === "failed") {
    return {
      ...current,
      reserveAfter: {
        ...existing,
        syncStatus: "failed",
        syncError: result.error,
      },
      updatedAt: now,
    };
  }

  if (!result.databaseId) {
    throw new Error(
      "Synchronized final client reserve has no database ID.",
    );
  }

  const syncedVisit: MultiMachineServiceVisit = {
    ...current,
    reserveAfter: {
      ...existing,
      databaseId: result.databaseId,
      syncStatus: "synced",
      syncError: null,
    },
    updatedAt: now,
  };

  return advanceMultiMachineVisitStep(syncedVisit, now);
}