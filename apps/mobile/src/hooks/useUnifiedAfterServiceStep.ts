
import { useCallback } from "react";

import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";
import type {
  SaveAfterPhotoInput,
  UpdateMediaUploadInput,
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

function requireActiveMachine(
  visit: MultiMachineServiceVisit,
  machineId: string,
) {
  if (
    visit.status !== "in_progress" ||
    visit.currentStep !== "machine_service"
  ) {
    throw new Error("Machine service is not active.");
  }

  const machine = visit.machines[visit.activeMachineIndex];

  if (
    !machine ||
    machine.machineId !== machineId ||
    machine.currentStep !== "after_service" ||
    machine.completedAt !== null
  ) {
    throw new Error(
      "The selected machine is not in the after-service step.",
    );
  }

  return machine;
}

export function useUnifiedAfterServiceStep({
  commitVisitMutation,
  clearError,
}: Params) {
  const saveAfterPhoto = useCallback(
    async (machineId: string, input: SaveAfterPhotoInput) => {
      if (!input.localUri.trim()) {
        throw new Error(
          "The locally stored after-service photo is missing.",
        );
      }

      const result = await commitVisitMutation((visit) => {
        const machine = requireActiveMachine(visit, machineId);
        const now = new Date().toISOString();

        return {
          ...visit,
          machines: visit.machines.map((item) =>
            item.machineId === machineId
              ? {
                  ...machine,
                  afterService: {
                    ...machine.afterService,
                    afterPhoto: {
                      localUri: input.localUri,
                      storagePath: null,
                      databaseId: null,
                      uploadStatus: "pending_upload" as const,
                      uploadError: null,
                      capturedAt: input.capturedAt,
                      uploadedAt: null,
                    },
                  },
                }
              : item,
          ),
          updatedAt: now,
        };
      });

      clearError();
      return result;
    },
    [commitVisitMutation, clearError],
  );

  const updateAfterPhotoUpload = useCallback(
    (
      machineId: string,
      localUri: string,
      input: UpdateMediaUploadInput,
    ) =>
      commitVisitMutation((visit) => {
        const machine = visit.machines.find(
          (item) => item.machineId === machineId,
        );

        if (!machine) {
          throw new Error("The selected machine could not be found.");
        }

        const photo = machine.afterService.afterPhoto;

        // Ignore stale upload callbacks after a retake.
        if (!photo || photo.localUri !== localUri) {
          return visit;
        }

        return {
          ...visit,
          machines: visit.machines.map((item) =>
            item.machineId === machineId
              ? {
                  ...item,
                  afterService: {
                    ...item.afterService,
                    afterPhoto: {
                      ...photo,
                      ...input,
                    },
                  },
                }
              : item,
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    [commitVisitMutation],
  );

  return {
    saveAfterPhoto,
    updateAfterPhotoUpload,
  };
}
