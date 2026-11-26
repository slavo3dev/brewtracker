import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";
import { saveClientReserveAfterService } from "./client-reserve-after.service";

export async function syncUnifiedReserveAfter(
  visit: MultiMachineServiceVisit,
): Promise<string> {
  if (
    visit.status !== "in_progress" ||
    visit.currentStep !== "reserve_after"
  ) {
    throw new Error(
      "Final client reserve synchronization is not the current visit step.",
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

  if (
    !visit.reserveAfter ||
    visit.reserveAfter.sourceVisitId !== visit.id
  ) {
    throw new Error(
      "No valid final client reserve calculation is available.",
    );
  }

  if (visit.machines.length === 0) {
    throw new Error(
      "A service visit must contain at least one machine.",
    );
  }

  if (visit.machines.some((machine) => !machine.completedAt)) {
    throw new Error(
      "All assigned machines must be serviced first.",
    );
  }

  return saveClientReserveAfterService({
    sourceVisitId: visit.id,
    clientId: visit.clientId,
    stopId: visit.stopId,
    machineId: null,
    calculatedAt: visit.reserveAfter.calculatedAt,
  });
}