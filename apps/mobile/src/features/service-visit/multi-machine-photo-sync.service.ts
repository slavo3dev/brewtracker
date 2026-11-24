import { uploadBeforePhoto } from "./before-photo.service";
import { uploadAfterPhoto } from "./after-service-media.service";
import {
  claimBeforePhotoUpload,
  claimAfterPhotoUpload,
  PhotoUploadNotEligibleError,
} from "./state/multi-machine-photo-claim";
import { PhotoUploadUpdateRejectedError } from "./state/photo-upload-transition";
import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";
import type {
  BeforePhotoKind,
  UpdateBeforePhotoUploadInput,
  UpdateMediaUploadInput,
} from "./service-visit.types";

type UpdateBeforePhoto = (
  machineId: string,
  kind: BeforePhotoKind,
  localUri: string,
  input: UpdateBeforePhotoUploadInput,
) => Promise<MultiMachineServiceVisit>;

type UpdateAfterPhoto = (
  machineId: string,
  localUri: string,
  input: UpdateMediaUploadInput,
) => Promise<MultiMachineServiceVisit>;

type CommitVisitMutation = (
  mutation: (
    currentVisit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type SyncMachinePhotosInput = {
  visit: MultiMachineServiceVisit;
  commitVisitMutation: CommitVisitMutation;
  updateBeforePhoto: UpdateBeforePhoto;
  updateAfterPhoto: UpdateAfterPhoto;
};

export type MachinePhotoSyncResult = {
  attempted: number;
  uploaded: number;
  failed: number;
};

export async function syncMultiMachinePhotos({
  visit,
  commitVisitMutation,
  updateBeforePhoto,
  updateAfterPhoto,
}: SyncMachinePhotosInput): Promise<MachinePhotoSyncResult> {
  const result: MachinePhotoSyncResult = {
    attempted: 0,
    uploaded: 0,
    failed: 0,
  };

  for (const machine of visit.machines) {
    for (const photo of machine.beforePhotos) {
      let claimedAttemptId: string | null = null;
      if (
        photo.uploadStatus !== "pending_upload" &&
        photo.uploadStatus !== "failed"
      ) {
        continue;
      }

      try {
        const claimedVisit = await commitVisitMutation((currentVisit) =>
          claimBeforePhotoUpload(
            currentVisit,
            machine.machineId,
            photo.kind,
            photo.localUri,
          ),
        );

        const claimedPhoto = claimedVisit.machines
          .find((item) => item.machineId === machine.machineId)
          ?.beforePhotos.find(
            (item) =>
              item.kind === photo.kind && item.localUri === photo.localUri,
          );

        if (!claimedPhoto || !claimedPhoto.uploadAttemptId) {
          throw new PhotoUploadNotEligibleError();
        }

        claimedAttemptId = claimedPhoto.uploadAttemptId;

        result.attempted += 1;

        const uploaded = await uploadBeforePhoto({
          userId: claimedVisit.userId,
          visitId: claimedVisit.id,
          stopId: claimedVisit.stopId,
          machineId: machine.machineId,
          kind: claimedPhoto.kind,
          stage: "before",
          localUri: claimedPhoto.localUri,
          capturedAt: claimedPhoto.capturedAt,
          schemaVersion: 2,
        });

        await updateBeforePhoto(machine.machineId, photo.kind, photo.localUri, {
          uploadStatus: "uploaded",
          uploadAttemptId: claimedAttemptId,
          storagePath: uploaded.storagePath,
          databaseId: uploaded.databaseId,
          uploadedAt: new Date().toISOString(),
          uploadError: null,
        });

        result.uploaded += 1;
      } catch (error) {
        if (
          error instanceof PhotoUploadNotEligibleError ||
          error instanceof PhotoUploadUpdateRejectedError
        ) {
          continue;
        }

        result.failed += 1;

        if (!claimedAttemptId) {
          console.warn(
            "Before-photo sync failed before an upload attempt was established:",
            error,
          );
          continue;
        }

        try {
          await updateBeforePhoto(
            machine.machineId,
            photo.kind,
            photo.localUri,
            {
              uploadStatus: "failed",
              uploadAttemptId: claimedAttemptId,
              uploadError:
                error instanceof Error ? error.message : "Photo upload failed.",
            },
          );
        } catch (statusError) {
          console.warn(
            "Unable to persist before-photo upload failure:",
            statusError,
          );
        }
      }
    }

    const afterPhoto = machine.afterService.afterPhoto;

    let claimedAfterAttemptId: string | null = null;

    if (
      !afterPhoto ||
      (afterPhoto.uploadStatus !== "pending_upload" &&
        afterPhoto.uploadStatus !== "failed")
    ) {
      continue;
    }

    try {
      const claimedVisit = await commitVisitMutation((currentVisit) =>
        claimAfterPhotoUpload(
          currentVisit,
          machine.machineId,
          afterPhoto.localUri,
        ),
      );

      const claimedPhoto = claimedVisit.machines.find(
        (item) => item.machineId === machine.machineId,
      )?.afterService.afterPhoto;

      if (
        !claimedPhoto ||
        claimedPhoto.localUri !== afterPhoto.localUri ||
        !claimedPhoto.uploadAttemptId
      ) {
        throw new PhotoUploadNotEligibleError();
      }

      claimedAfterAttemptId = claimedPhoto.uploadAttemptId;

      result.attempted += 1;

      const uploaded = await uploadAfterPhoto({
        userId: claimedVisit.userId,
        visitId: claimedVisit.id,
        stopId: claimedVisit.stopId,
        machineId: machine.machineId,
        localUri: claimedPhoto.localUri,
        capturedAt: claimedPhoto.capturedAt,
        storagePathMode: "per_machine",
      });

      await updateAfterPhoto(machine.machineId, afterPhoto.localUri, {
        uploadStatus: "uploaded",
        uploadAttemptId: claimedAfterAttemptId,
        storagePath: uploaded.storagePath,
        databaseId: uploaded.databaseId,
        uploadedAt: new Date().toISOString(),
        uploadError: null,
      });

      result.uploaded += 1;
    } catch (error) {
      if (
        error instanceof PhotoUploadNotEligibleError ||
        error instanceof PhotoUploadUpdateRejectedError
      ) {
        continue;
      }

      result.failed += 1;

      if (!claimedAfterAttemptId) {
        console.warn(
          "After-photo sync failed before an upload attempt was established:",
          error,
        );
        continue;
      }

      try {
        await updateAfterPhoto(machine.machineId, afterPhoto.localUri, {
          uploadStatus: "failed",
          uploadAttemptId: claimedAfterAttemptId,
          uploadError:
            error instanceof Error ? error.message : "Photo upload failed.",
        });
      } catch (statusError) {
        console.warn(
          "Unable to persist after-photo upload failure:",
          statusError,
        );
      }
    }
  }

  return result;
}
