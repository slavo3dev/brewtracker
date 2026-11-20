import { useCallback } from "react";

import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";
import type {
  BeforePhotoKind,
  SaveBeforePhotoInput,
  UpdateBeforePhotoUploadInput,
} from "../features/service-visit/service-visit.types";
import { advanceActiveMachine } from "../features/service-visit/state/multi-machine-visit.transitions";

type CommitVisitMutation = (
  mutation: (
    visit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type Params = {
  commitVisitMutation: CommitVisitMutation;
  clearError: () => void;
};

function requireMachine(
  visit: MultiMachineServiceVisit,
  machineId: string,
) {
  if (visit.status !== "in_progress" ||
      visit.currentStep !== "machine_service") {
    throw new Error("Machine service is not active.");
  }

  const machine = visit.machines[visit.activeMachineIndex];

  if (!machine || machine.machineId !== machineId ||
      machine.currentStep !== "before_photos" ||
      machine.completedAt !== null) {
    throw new Error("The selected machine is not in the before-photo step.");
  }

  return machine;
}

export function useUnifiedBeforePhotosStep({
  commitVisitMutation,
  clearError,
}: Params) {
  const saveBeforePhoto = useCallback(
    async (machineId: string, input: SaveBeforePhotoInput) => {
      if (!input.localUri.trim()) {
        throw new Error("The locally stored photo URI is missing.");
      }

      const result = await commitVisitMutation((visit) => {
        const machine = requireMachine(visit, machineId);
        const photos = machine.beforePhotos.filter(
          (photo) => photo.kind !== input.kind,
        );

        photos.push({
          kind: input.kind,
          localUri: input.localUri,
          capturedAt: input.capturedAt,
          storagePath: null,
          databaseId: null,
          uploadStatus: "pending_upload",
          uploadError: null,
          uploadedAt: null,
        });

        return {
          ...visit,
          machines: visit.machines.map((item) =>
            item.machineId === machineId
              ? { ...item, beforePhotos: photos }
              : item,
          ),
          updatedAt: new Date().toISOString(),
        };
      });

      clearError();
      return result;
    },
    [commitVisitMutation, clearError],
  );

  const updateBeforePhotoUpload = useCallback(
    (
      machineId: string,
      kind: BeforePhotoKind,
      localUri: string,
      input: UpdateBeforePhotoUploadInput,
    ) =>
      commitVisitMutation((visit) => {
        const machine = visit.machines.find(
          (item) => item.machineId === machineId,
        );

        if (!machine) {
          throw new Error("The selected machine could not be found.");
        }

        const photo = machine.beforePhotos.find(
          (item) => item.kind === kind && item.localUri === localUri,
        );

        if (!photo) {
          // A replaced or removed photo must not be restored
          // by an asynchronous upload callback.
          return visit;
        }

        return {
          ...visit,
          machines: visit.machines.map((item) =>
            item.machineId === machineId
              ? {
                  ...item,
                  beforePhotos: item.beforePhotos.map((existing) =>
                    existing.kind === kind &&
                    existing.localUri === localUri
                      ? {
                          ...existing,
                          uploadStatus: input.uploadStatus,
                          storagePath:
                            input.storagePath !== undefined
                              ? input.storagePath
                              : existing.storagePath,
                          databaseId:
                            input.databaseId !== undefined
                              ? input.databaseId
                              : existing.databaseId,
                          uploadError:
                            input.uploadError !== undefined
                              ? input.uploadError
                              : existing.uploadError,
                          uploadedAt:
                            input.uploadedAt !== undefined
                              ? input.uploadedAt
                              : existing.uploadedAt,
                        }
                      : existing,
                  ),
                }
              : item,
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    [commitVisitMutation],
  );

  const removeBeforePhoto = useCallback(
    async (machineId: string, kind: BeforePhotoKind) => {
      const result = await commitVisitMutation((visit) => {
        const machine = requireMachine(visit, machineId);

        return {
          ...visit,
          machines: visit.machines.map((item) =>
            item.machineId === machineId
              ? {
                  ...item,
                  beforePhotos: machine.beforePhotos.filter(
                    (photo) => photo.kind !== kind,
                  ),
                }
              : item,
          ),
          updatedAt: new Date().toISOString(),
        };
      });

      clearError();
      return result;
    },
    [commitVisitMutation, clearError],
  );

  const completeBeforePhotos = useCallback(
    async (machineId: string) => {
      const result = await commitVisitMutation((visit) => {
        requireMachine(visit, machineId);
        return advanceActiveMachine(visit);
      });

      clearError();
      return result;
    },
    [commitVisitMutation, clearError],
  );

  return {
    saveBeforePhoto,
    updateBeforePhotoUpload,
    removeBeforePhoto,
    completeBeforePhotos,
  };
}
