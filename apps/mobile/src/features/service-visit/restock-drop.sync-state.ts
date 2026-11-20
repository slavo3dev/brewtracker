import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";
import { advanceMultiMachineVisitStep } from "./state/multi-machine-visit.workflow";

type SyncResult =
  | { status: "synced"; databaseId: string }
  | { status: "failed"; error: string };

export function applyUnifiedRestockSyncResult(
  current: MultiMachineServiceVisit,
  source: MultiMachineServiceVisit,
  result: SyncResult,
): MultiMachineServiceVisit {
  const originalDelivery = source.restockDrop;
  const currentDelivery = current.restockDrop;

  if (
    !originalDelivery ||
    !currentDelivery ||
    current.id !== source.id ||
    current.status !== "in_progress" ||
    current.currentStep !== "restock" ||
    currentDelivery.sourceVisitId !== originalDelivery.sourceVisitId ||
    currentDelivery.confirmedAt !== originalDelivery.confirmedAt ||
    currentDelivery.items.length !== originalDelivery.items.length ||
    currentDelivery.items.some((item, index) => {
      const original = originalDelivery.items[index];

      return (
        item.productId !== original.productId ||
        item.issueQuantity !== original.issueQuantity ||
        item.looseQuantity !== original.looseQuantity ||
        item.actualQuantity !== original.actualQuantity
      );
    }) ||
    currentDelivery.syncStatus === "synced"
  ) {
    return current;
  }

  const now = new Date().toISOString();

  if (result.status === "failed") {
    return {
      ...current,
      restockDrop: {
        ...currentDelivery,
        syncStatus: "failed",
        syncError: result.error,
      },
      updatedAt: now,
    };
  }

  if (!result.databaseId) {
    throw new Error("Synchronized client delivery has no database ID.");
  }

  const syncedVisit: MultiMachineServiceVisit = {
    ...current,
    restockDrop: {
      ...currentDelivery,
      databaseId: result.databaseId,
      syncStatus: "synced",
      syncError: null,
    },
    updatedAt: now,
  };

  return advanceMultiMachineVisitStep(syncedVisit, now);
}
