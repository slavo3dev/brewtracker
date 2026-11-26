import type { UnifiedVisitStepId } from "./state/unified-visit-step";
import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";

export const UNIFIED_STEP_TITLES: Record<UnifiedVisitStepId, string> = {
  arrival: "Confirm Arrival",
  inventory_audit: "Inventory Audit",
  restock: "Client Delivery",
  machine_scan: "Scan Machine",
  before_photos: "Before-Service Photos",
  drink_count: "Drink Count",
  machine_refill: "Machine Refill",
  after_service: "After-Service Photo",
  reserve_after: "Synchronizing Client Inventory",
  summary: "Review & Complete",
};

export function getUnifiedVisitProgress(visit: MultiMachineServiceVisit): {
  current: number;
  total: number;
} {
  const sharedStepsBefore = 3;
  const sharedStepsAfter = 1;

  const machineStepCount = (machine: (typeof visit.machines)[number]) =>
    machine.drinkCountRequired ? 5 : 4;

  const totalMachineSteps = visit.machines.reduce(
    (sum, machine) => sum + machineStepCount(machine),
    0,
  );

  const total = sharedStepsBefore + totalMachineSteps + sharedStepsAfter;

  if (visit.currentStep === "arrival") {
    return { current: 1, total };
  }

  if (visit.currentStep === "inventory_audit") {
    return { current: 2, total };
  }

  if (visit.currentStep === "restock") {
    return { current: 3, total };
  }

  if (visit.currentStep === "reserve_after") {
    return { current: total, total };
  }

  if (visit.currentStep === "summary") {
    return { current: total, total };
  }

  const machine = visit.machines[visit.activeMachineIndex];

  if (!machine) {
    throw new Error("The active machine assignment is invalid.");
  }

  const completedMachineSteps = visit.machines
    .slice(0, visit.activeMachineIndex)
    .reduce((sum, item) => sum + machineStepCount(item), 0);

  const steps = [
    "machine_scan",
    "before_photos",
    ...(machine.drinkCountRequired ? ["drink_count"] : []),
    "machine_refill",
    "after_service",
  ] as const;

  const stepIndex = steps.findIndex((step) => step === machine.currentStep);

  if (stepIndex < 0) {
    throw new Error("The active machine step is invalid.");
  }

  return {
    current: sharedStepsBefore + completedMachineSteps + stepIndex + 1,
    total,
  };
}
