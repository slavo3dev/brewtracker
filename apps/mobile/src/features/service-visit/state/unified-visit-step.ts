import type {
  MultiMachineServiceVisit,
  MachineServiceStepId,
  MultiMachineVisitStepId,
} from "../multi-machine-visit.types";

export type UnifiedVisitStepId =
  | Exclude<MultiMachineVisitStepId, "machine_service">
  | MachineServiceStepId;

export function getUnifiedVisitStep(
  visit: MultiMachineServiceVisit,
): UnifiedVisitStepId {
  if (visit.currentStep !== "machine_service") {
    return visit.currentStep;
  }

  const machine = visit.machines[visit.activeMachineIndex];

  if (!machine) {
    throw new Error("The active machine assignment is invalid.");
  }

  if (machine.completedAt !== null) {
    throw new Error("The active machine has already been completed.");
  }

  return machine.currentStep;
}
