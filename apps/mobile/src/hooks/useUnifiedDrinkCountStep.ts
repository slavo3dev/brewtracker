import { useCallback, useRef } from "react";

import {
  saveMachineMeterReading,
  type MachineMeterReadingResult,
} from "../features/service-visit/meter-reading.service";
import type {
  MultiMachineServiceVisit,
  UnifiedDrinkCountRecord,
} from "../features/service-visit/multi-machine-visit.types";

type CommitVisitMutation = (
  mutation: (
    visit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type Params = {
  commitVisitMutation: CommitVisitMutation;
  clearError: () => void;
};

function requireActiveDrinkCountMachine(
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
    machine.currentStep !== "drink_count" ||
    machine.completedAt !== null ||
    !machine.drinkCountRequired
  ) {
    throw new Error("Drink Count is not the active machine step.");
  }

  return machine;
}

function matchesSavedReading(
  record: UnifiedDrinkCountRecord | null,
  expected: UnifiedDrinkCountRecord,
): boolean {
  return (
    record !== null &&
    record.sourceVisitId === expected.sourceVisitId &&
    record.machineId === expected.machineId &&
    record.runningTotal === expected.runningTotal &&
    record.recordedAt === expected.recordedAt
  );
}

function applySyncResult(
  visit: MultiMachineServiceVisit,
  expected: UnifiedDrinkCountRecord,
  result:
    | { status: "synced"; reading: MachineMeterReadingResult }
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
    (machine) => machine.machineId === expected.machineId,
  );

  if (index !== visit.activeMachineIndex || index < 0) {
    return visit;
  }

  const machine = visit.machines[index];

  if (
    machine.currentStep !== "drink_count" ||
    !matchesSavedReading(machine.drinkCount, expected) ||
    machine.drinkCount?.syncStatus === "synced"
  ) {
    return visit;
  }

  const updatedRecord: UnifiedDrinkCountRecord =
    result.status === "synced"
      ? {
          ...expected,
          databaseId: result.reading.id,
          archiveTotal: result.reading.archiveTotal,
          recordedAt: expected.recordedAt,
          syncStatus: "synced",
          syncError: null,
        }
      : {
          ...expected,
          databaseId: null,
          archiveTotal: null,
          syncStatus: "failed",
          syncError: result.error,
        };

  const machines = [...visit.machines];

  machines[index] = {
    ...machine,
    drinkCount: updatedRecord,
  };

  return {
    ...visit,
    machines,
    updatedAt: new Date().toISOString(),
  };
}

export function useUnifiedDrinkCountStep({
  commitVisitMutation,
  clearError,
}: Params) {
  const syncInProgressRef = useRef(false);

  const runExclusively = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      if (syncInProgressRef.current) {
        throw new Error(
          "Drink Count synchronization is already in progress.",
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

  const synchronizeReading = useCallback(
    async (
      savedVisit: MultiMachineServiceVisit,
      expected: UnifiedDrinkCountRecord,
    ): Promise<MultiMachineServiceVisit> => {
      let reading: MachineMeterReadingResult;

      try {
        reading = await saveMachineMeterReading({
          machineId: expected.machineId,
          stopId: savedVisit.stopId,
          recordedBy: savedVisit.userId,
          sourceVisitId: savedVisit.id,
          runningTotal: expected.runningTotal,
        });

        if (
          reading.sourceVisitId !== expected.sourceVisitId ||
          reading.machineId !== expected.machineId ||
          reading.runningTotal !== expected.runningTotal ||
          reading.serviceStopId !== savedVisit.stopId
        ) {
          throw new Error(
            "The synchronized Drink Count does not match the saved reading.",
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to synchronize the saved Drink Count.";

        await commitVisitMutation((current) =>
          applySyncResult(current, expected, {
            status: "failed",
            error: message,
          }),
        );

        throw new Error(message);
      }

      const updatedVisit = await commitVisitMutation((current) =>
        applySyncResult(current, expected, {
          status: "synced",
          reading,
        }),
      );

      clearError();
      return updatedVisit;
    },
    [commitVisitMutation, clearError],
  );

  const completeDrinkCount = useCallback(
    async (
      machineId: string,
      runningTotal: number,
    ): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        if (!Number.isSafeInteger(runningTotal) || runningTotal < 0) {
          throw new Error(
            "Enter a valid non-negative whole-number Running Total.",
          );
        }

        const savedVisit = await commitVisitMutation((visit) => {
          const machine = requireActiveDrinkCountMachine(
            visit,
            machineId,
          );

          if (machine.drinkCount !== null) {
            throw new Error(
              "A Drink Count is already saved. " +
                "Retry synchronization instead of replacing it.",
            );
          }

          const now = new Date().toISOString();
          const machines = [...visit.machines];

          machines[visit.activeMachineIndex] = {
            ...machine,
            drinkCount: {
              databaseId: null,
              sourceVisitId: visit.id,
              machineId,
              runningTotal,
              archiveTotal: null,
              recordedAt: now,
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
          savedVisit.machines[savedVisit.activeMachineIndex].drinkCount;

        if (!expected) {
          throw new Error("Saved Drink Count could not be found.");
        }

        return synchronizeReading(savedVisit, expected);
      }),
    [commitVisitMutation, runExclusively, synchronizeReading],
  );

  const retryDrinkCountSync = useCallback(
    async (machineId: string): Promise<MultiMachineServiceVisit> =>
      runExclusively(async () => {
        const savedVisit = await commitVisitMutation((visit) => {
          const machine = requireActiveDrinkCountMachine(
            visit,
            machineId,
          );

          if (!machine.drinkCount) {
            throw new Error("No saved Drink Count is available to retry.");
          }

          if (machine.drinkCount.syncStatus === "synced") {
            throw new Error("Drink Count is already synchronized.");
          }

          return visit;
        });

        const expected =
          savedVisit.machines[savedVisit.activeMachineIndex].drinkCount;

        if (!expected) {
          throw new Error("Saved Drink Count could not be found.");
        }

        return synchronizeReading(savedVisit, expected);
      }),
    [commitVisitMutation, runExclusively, synchronizeReading],
  );

  return {
    completeDrinkCount,
    retryDrinkCountSync,
  };
}
