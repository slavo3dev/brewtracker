
import type {
  MultiMachineServiceVisit,
  MultiMachineVisitStepId,
} from "../multi-machine-visit.types";

const VISIT_STEPS: MultiMachineVisitStepId[] = [
  "arrival",
  "inventory_audit",
  "restock",
  "machine_service",
  "reserve_after",
  "summary",
];

export function advanceMultiMachineVisitStep(
  visit: MultiMachineServiceVisit,
  now: string = new Date().toISOString(),
): MultiMachineServiceVisit {
  if (visit.status !== "in_progress") {
    throw new Error("Only an active visit can advance.");
  }

  const index = VISIT_STEPS.indexOf(visit.currentStep);

  if (index < 0 || index === VISIT_STEPS.length - 1) {
    throw new Error("Invalid visit-stage transition.");
  }

  switch (visit.currentStep) {
    case "arrival":
      if (!visit.arrivalVerification) {
        throw new Error("Arrival verification is missing.");
      }

      if (visit.arrivalSyncStatus !== "synced") {
        throw new Error(
          "Arrival must finish syncing before continuing.",
        );
      }
      break;

    case "inventory_audit":
      if (
        !visit.inventoryAudit ||
        visit.inventoryAudit.syncStatus !== "synced" ||
        !visit.inventoryAudit.databaseId
      ) {
        throw new Error("Client reserve audit must finish syncing.");
      }
      break;

    case "restock":
      if (
        !visit.restockDrop ||
        visit.restockDrop.syncStatus !== "synced" ||
        !visit.restockDrop.databaseId
      ) {
        throw new Error("Client delivery must finish syncing.");
      }
      break;

    case "machine_service":
      throw new Error(
        "Complete machine services using advanceActiveMachine().",
      );

    case "reserve_after":
      if (
        !visit.reserveAfter ||
        visit.reserveAfter.syncStatus !== "synced" ||
        !visit.reserveAfter.databaseId
      ) {
        throw new Error("Client reserve-after must finish syncing.");
      }
      break;
  }

  return {
    ...visit,
    currentStep: VISIT_STEPS[index + 1],
    updatedAt: now,
  };
}
