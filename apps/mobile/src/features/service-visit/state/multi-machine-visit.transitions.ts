import { BEFORE_PHOTO_KINDS } from "../service-visit.types";

import type {
  MachineServiceState,
  MachineServiceStepId,
  MultiMachineServiceVisit,
} from "../multi-machine-visit.types";

export function getRequiredMachineSteps(
  machine: MachineServiceState,
): MachineServiceStepId[] {
  const steps: MachineServiceStepId[] = [
    "machine_scan",
    "before_photos",
  ];

  if (machine.drinkCountRequired) {
    steps.push("drink_count");
  }

  steps.push("machine_refill", "after_service");

  return steps;
}

export function getNextMachineStep(
  machine: MachineServiceState,
): MachineServiceStepId | null {
  const steps = getRequiredMachineSteps(machine);
  const currentIndex = steps.indexOf(machine.currentStep);

  if (currentIndex === -1) {
    throw new Error("Invalid machine service step.");
  }

  return steps[currentIndex + 1] ?? null;
}


export function assertMachineStepComplete(
  machine: MachineServiceState,
): void {
  switch (machine.currentStep) {
    case "machine_scan": {
      const scan = machine.machineScanVerification;

      if (
        !scan ||
        scan.machineId !== machine.machineId ||
        scan.expectedQrCode !== machine.machineTarget.qrCode ||
        scan.scannedValue !== machine.machineTarget.qrCode
      ) {
        throw new Error("Machine QR verification is incomplete.");
      }

      break;
    }

    case "before_photos": {
      for (const kind of BEFORE_PHOTO_KINDS) {
        const photo = machine.beforePhotos.find(
          (item) => item.kind === kind,
        );

        if (!photo?.localUri) {
          throw new Error(`Required ${kind} photo is missing.`);
        }

        if (photo.uploadStatus !== "uploaded") {
          throw new Error(
            `Required ${kind} photo must finish uploading before continuing.`,
          );
        }
      }

      break;
    }

    case "drink_count": {
      if (!machine.drinkCountRequired || !machine.drinkCount) {
        throw new Error("Required Drink Count is missing.");
      }

      break;
    }

    case "machine_refill": {
      const confirmation = machine.machineRefill;

      if (!confirmation) {
        throw new Error("Machine service confirmation is missing.");
      }

      if (
        confirmation.outcome === "unable_to_refill" &&
        !confirmation.reason?.trim()
      ) {
        throw new Error(
          "A reason is required when the machine cannot be refilled.",
        );
      }

      if (
        confirmation.syncStatus !== "synced" ||
        !confirmation.databaseId
      ) {
        throw new Error(
          "Machine service confirmation must finish syncing.",
        );
      }

      break;
    }

    case "after_service": {
      if (!machine.afterService.afterPhoto?.localUri) {
        throw new Error("After-service photo is missing.");
      }

      break;
    }
  }
}


export function advanceMachineStep(
  machine: MachineServiceState,
  now: string = new Date().toISOString(),
): MachineServiceState {
  if (machine.completedAt !== null) {
    throw new Error("This machine service is already completed.");
  }

  assertMachineStepComplete(machine);

  const nextStep = getNextMachineStep(machine);

  if (nextStep === null) {
    return {
      ...machine,
      completedAt: now,
    };
  }

  return {
    ...machine,
    currentStep: nextStep,
  };
}


export function advanceActiveMachine(
  visit: MultiMachineServiceVisit,
  now: string = new Date().toISOString(),
): MultiMachineServiceVisit {
  if (visit.status !== "in_progress") {
    throw new Error("Only an active visit can advance.");
  }

  if (visit.currentStep !== "machine_service") {
    throw new Error("The visit is not in the machine service stage.");
  }

  const index = visit.activeMachineIndex;
  const machine = visit.machines[index];

  if (!machine) {
    throw new Error("The active machine assignment is invalid.");
  }

  const updatedMachine = advanceMachineStep(machine, now);

  const machines = visit.machines.map((item, itemIndex) =>
    itemIndex === index ? updatedMachine : item,
  );

  if (updatedMachine.completedAt === null) {
    return {
      ...visit,
      machines,
      updatedAt: now,
    };
  }

  const nextIndex = index + 1;

  if (nextIndex < machines.length) {
    return {
      ...visit,
      machines,
      activeMachineIndex: nextIndex,
      updatedAt: now,
    };
  }

  return {
    ...visit,
    machines,
    currentStep: "reserve_after",
    updatedAt: now,
  };
}



