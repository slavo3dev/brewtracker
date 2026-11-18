import * as Crypto from "expo-crypto";

import type {
  MachineServiceState,
  MultiMachineServiceVisit,
} from "../multi-machine-visit.types";

import type {
  ServiceVisitMachineTarget,
  ServiceVisitTarget,
} from "../service-visit.types";

export type StartMultiMachineVisitInput = {
  userId: string;
  routeId: string;
  stopId: string;
  clientId: string;
  target: ServiceVisitTarget;
  machines: {
    machineId: string;
    sequenceNumber: number;
    drinkCountRequired: boolean;
    machineTarget: ServiceVisitMachineTarget;
  }[];
};

export function createMultiMachineVisit(
  input: StartMultiMachineVisitInput,
): MultiMachineServiceVisit {
  if (input.machines.length < 2) {
    throw new Error(
      "A multi-machine visit requires at least two assigned machines.",
    );
  }

  const machineIds = new Set<string>();
  const sequenceNumbers = new Set<number>();

  const orderedMachines = [...input.machines].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber,
  );

  const machines: MachineServiceState[] = orderedMachines.map((machine) => {
    if (!machine.machineId || machine.machineTarget.id !== machine.machineId) {
      throw new Error("Invalid machine assignment.");
    }

    if (!machine.machineTarget.qrCode.trim()) {
      throw new Error("An assigned machine is missing its QR code.");
    }

    if (
      !Number.isSafeInteger(machine.sequenceNumber) ||
      machine.sequenceNumber <= 0
    ) {
      throw new Error("Invalid machine sequence number.");
    }

    if (machineIds.has(machine.machineId)) {
      throw new Error("Duplicate machine assignment.");
    }

    if (sequenceNumbers.has(machine.sequenceNumber)) {
      throw new Error("Duplicate machine sequence number.");
    }

    machineIds.add(machine.machineId);
    sequenceNumbers.add(machine.sequenceNumber);

    return {
      machineId: machine.machineId,
      sequenceNumber: machine.sequenceNumber,
      drinkCountRequired: machine.drinkCountRequired,
      machineTarget: machine.machineTarget,

      currentStep: "machine_scan",
      machineScanVerification: null,
      beforePhotos: [],
      drinkCount: null,
      machineRefill: null,
      afterService: {
        afterPhoto: null,
      },
      completedAt: null,
    };
  });

  const now = new Date().toISOString();

  return {
    schemaVersion: 2,

    id: Crypto.randomUUID(),
    userId: input.userId,
    routeId: input.routeId,
    stopId: input.stopId,
    clientId: input.clientId,
    target: input.target,

    status: "in_progress",
    currentStep: "arrival",
    arrivalVerification: null,

    inventoryAudit: null,
    restockDrop: null,
    reserveAfter: null,

    machines,
    activeMachineIndex: 0,

    clientConfirmation: {
      signature: null,
      confirmedAt: null,
    },

    summary: {
      syncStatus: "not_started",
      syncError: null,
      databaseId: null,
      surveyToken: null,
      emailSentAt: null,
    },

    startedAt: now,
    updatedAt: now,
    completedAt: null,
    cancelledAt: null,
  };
}
