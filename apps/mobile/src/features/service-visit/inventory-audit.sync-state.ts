import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";
import { advanceMultiMachineVisitStep } from "./state/multi-machine-visit.workflow";

type SyncResult =
  | { status: "synced"; databaseId: string }
  | { status: "failed"; error: string };

export function applyUnifiedInventoryAuditSyncResult(
  current: MultiMachineServiceVisit,
  source: MultiMachineServiceVisit,
  result: SyncResult,
): MultiMachineServiceVisit {
  const originalAudit = source.inventoryAudit;
  const currentAudit = current.inventoryAudit;

  if (
    !originalAudit ||
    !currentAudit ||
    current.id !== source.id ||
    current.status !== "in_progress" ||
    current.currentStep !== "inventory_audit" ||
    currentAudit.sourceVisitId !== originalAudit.sourceVisitId ||
    currentAudit.countedAt !== originalAudit.countedAt ||
    currentAudit.syncStatus === "synced"
  ) {
    return current;
  }

  const now = new Date().toISOString();

  if (result.status === "failed") {
    return {
      ...current,
      inventoryAudit: {
        ...currentAudit,
        syncStatus: "failed",
        syncError: result.error,
      },
      updatedAt: now,
    };
  }

  const syncedVisit: MultiMachineServiceVisit = {
    ...current,
    inventoryAudit: {
      ...currentAudit,
      databaseId: result.databaseId,
      syncStatus: "synced",
      syncError: null,
    },
    updatedAt: now,
  };

  return advanceMultiMachineVisitStep(syncedVisit, now);
}
