
import { useCallback, useRef } from "react";

import { saveMachineServiceConfirmation } from "../features/service-visit/machine-refill.service";
import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";
import type {
  MachineServiceConfirmationRecord,
  MachineServiceOutcome,
} from "../features/service-visit/service-visit.types";

type CommitVisitMutation = (
  mutation: (
    visit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type Params = {
  commitVisitMutation: CommitVisitMutation;
  clearError: () => void;
};

type ConfirmationInput = {
  outcome: MachineServiceOutcome;
  reason: string | null;
};

function requireActiveMachine(
  visit: MultiMachineServiceVisit,
  machineId: string,
) {
  if (
    visit.status !== "in_progress" ||
    visit.currentStep !== "machine_service"
  ) {
    throw new Error("Machine Service is not the current visit step.");
  }

  const machine = visit.machines[visit.activeMachineIndex];

  if (
    !machine ||
    machine.machineId !== machineId ||
    machine.currentStep !== "machine_refill" ||
    machine.completedAt !== null
  ) {
    throw new Error("Machine Refill is not the active machine step.");
  }

  return machine;
}

function matchesConfirmation(
  record: MachineServiceConfirmationRecord | null,
  expected: MachineServiceConfirmationRecord,
): boolean {
  return (
    record !== null &&
    record.recordType === "confirmation" &&
    record.sourceVisitId === expected.sourceVisitId &&
    record.confirmedAt === expected.confirmedAt &&
    record.outcome === expected.outcome &&
    record.reason === expected.reason
  );
}

function applySyncResult(
  visit: MultiMachineServiceVisit,
  machineId: string,
  expected: MachineServiceConfirmationRecord,
  result:
    | { status: "synced"; databaseId: string }
    | { status: "failed"; error: string },
): MultiMachineServiceVisit {
  if (
    visit.id !== expected.sourceVisitId ||
    visit.status !== "in_progress" ||
    visit.currentStep !== "machine_service"
  ) {
    return visit;
  }

  const index = visit.machines.findIndex(
    (machine) => machine.machineId === machineId,
  );

  if (index < 0 || index !== visit.activeMachineIndex) {
    return visit;
  }

  const machine = visit.machines[index];

  if (
    machine.currentStep !== "machine_refill" ||
    !matchesConfirmation(machine.machineRefill, expected) ||
    machine.machineRefill?.syncStatus === "synced"
  ) {
    return visit;
  }

  const updatedRecord: MachineServiceConfirmationRecord =
    result.status === "synced"
      ? {
          ...expected,
          databaseId: result.databaseId,
          syncStatus: "synced",
          syncError: null,
        }
      : {
          ...expected,
          databaseId: null,
          syncStatus: "failed",
          syncError: result.error,
        };

  const machines = [...visit.machines];

  machines[index] = {
    ...machine,
    machineRefill: updatedRecord,
  };

  return {
    ...visit,
    machines,
    updatedAt: new Date().toISOString(),
  };
}

export function useUnifiedMachineRefillStep({
  commitVisitMutation,
  clearError,
}: Params) {
  const syncInProgressRef = useRef(false);

  const runExclusively = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      if (syncInProgressRef.current) {
        throw new Error(
          "Machine service synchronization is already in progress.",
        );
      }

      syncInProgressRef.current = true;

      try {
        return await operation();
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [],
  );

  const synchronizeConfirmation = useCallback(
    async (
      savedVisit: MultiMachineServiceVisit,
      machineId: string,
      expected: MachineServiceConfirmationRecord,
    ): Promise<MultiMachineServiceVisit> => {
      let databaseId: string;

      try {
        databaseId = await saveMachineServiceConfirmation({
          sourceVisitId: expected.sourceVisitId,
          clientId: savedVisit.clientId,
          stopId: savedVisit.stopId,
          machineId,
          confirmedAt: expected.confirmedAt,
          outcome: expected.outcome,
          reason: expected.reason,
        });

        if (!databaseId) {
          throw new Error(
            "Machine service synchronization returned no confirmation ID.",
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to synchronize machine service confirmation.";

        await commitVisitMutation((current) =>
          applySyncResult(current, machineId, expected, {
            status: "failed",
            error: message,
          }),
        );

        throw new Error(message);
      }

      const updatedVisit = await commitVisitMutation((current) =>
        applySyncResult(current, machineId, expected, {
          status: "synced",
          databaseId,
        }),
      );

      clearError();
      return updatedVisit;
    },
    [commitVisitMutation, clearError],
  );

  const completeMachineRefill = useCallback(
    async (
      machineId: string,
      input: ConfirmationInput,
    ): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        const reason = input.reason?.trim() || null;

        if (
          !["refilled", "not_needed", "unable_to_refill"].includes(
            input.outcome,
          )
        ) {
          throw new Error("Select a valid machine service outcome.");
        }

        if (input.outcome === "unable_to_refill" && !reason) {
          throw new Error(
            "Enter a reason why the machine could not be refilled.",
          );
        }

        if (input.outcome !== "unable_to_refill" && reason) {
          throw new Error(
            "A reason is only allowed when refill was not possible.",
          );
        }

        const savedVisit = await commitVisitMutation((visit) => {
          const machine = requireActiveMachine(visit, machineId);

          if (machine.machineRefill !== null) {
            throw new Error(
              "Machine service confirmation is already saved. " +
                "Retry synchronization instead.",
            );
          }

          const now = new Date().toISOString();
          const machines = [...visit.machines];

          machines[visit.activeMachineIndex] = {
            ...machine,
            machineRefill: {
              recordType: "confirmation",
              databaseId: null,
              sourceVisitId: visit.id,
              confirmedAt: now,
              outcome: input.outcome,
              reason,
              syncStatus: "pending_sync",
              syncError: null,
            },
          };

          return {
            ...visit,
            machines,
            updatedAt: now,
          };
        });

        const expected =
          savedVisit.machines[savedVisit.activeMachineIndex].machineRefill;

        if (!expected) {
          throw new Error("Saved machine confirmation could not be found.");
        }

        return synchronizeConfirmation(savedVisit, machineId, expected);
      }),
    [commitVisitMutation, runExclusively, synchronizeConfirmation],
  );

  const retryMachineRefillSync = useCallback(
    async (machineId: string): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        const savedVisit = await commitVisitMutation((visit) => {
          const machine = requireActiveMachine(visit, machineId);

          if (!machine.machineRefill) {
            throw new Error(
              "No saved machine service confirmation is available.",
            );
          }

          if (machine.machineRefill.syncStatus === "synced") {
            throw new Error(
              "Machine service confirmation is already synchronized.",
            );
          }

          return visit;
        });

        const expected =
          savedVisit.machines[savedVisit.activeMachineIndex].machineRefill;

        if (!expected) {
          throw new Error("Saved machine confirmation could not be found.");
        }

        return synchronizeConfirmation(savedVisit, machineId, expected);
      }),
    [commitVisitMutation, runExclusively, synchronizeConfirmation],
  );

  return {
    completeMachineRefill,
    retryMachineRefillSync,
  };
}
