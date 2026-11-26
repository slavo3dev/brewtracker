import * as Crypto from "expo-crypto";
import type { MultiMachineServiceVisit } from "../multi-machine-visit.types";
import type { BeforePhotoKind } from "../service-visit.types";

export class PhotoUploadNotEligibleError extends Error {
  constructor() {
    super("This photo is no longer eligible for upload.");
    this.name = "PhotoUploadNotEligibleError";
  }
}

export function claimBeforePhotoUpload(
  visit: MultiMachineServiceVisit,
  machineId: string,
  kind: BeforePhotoKind,
  localUri: string,
): MultiMachineServiceVisit {
  const machine = visit.machines.find((item) => item.machineId === machineId);

  const photo = machine?.beforePhotos.find(
    (item) => item.kind === kind && item.localUri === localUri,
  );

  if (
    !photo ||
    (photo.uploadStatus !== "pending_upload" && photo.uploadStatus !== "failed")
  ) {
    throw new PhotoUploadNotEligibleError();
  }

  const uploadAttemptId = Crypto.randomUUID();

  return {
    ...visit,
    machines: visit.machines.map((item) =>
      item.machineId === machineId
        ? {
            ...item,
            beforePhotos: item.beforePhotos.map((existing) =>
              existing.kind === kind && existing.localUri === localUri
                ? {
                    ...existing,
                    uploadStatus: "uploading" as const,
                    uploadError: null,
                    uploadAttemptId,
                  }
                : existing,
            ),
          }
        : item,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function claimAfterPhotoUpload(
  visit: MultiMachineServiceVisit,
  machineId: string,
  localUri: string,
): MultiMachineServiceVisit {
  const machine = visit.machines.find((item) => item.machineId === machineId);

  const photo = machine?.afterService.afterPhoto;

  if (
    !photo ||
    photo.localUri !== localUri ||
    (photo.uploadStatus !== "pending_upload" && photo.uploadStatus !== "failed")
  ) {
    throw new PhotoUploadNotEligibleError();
  }

  const uploadAttemptId = Crypto.randomUUID();

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
                uploadStatus: "uploading" as const,
                uploadError: null,
                uploadAttemptId,
              },
            },
          }
        : item,
    ),
    updatedAt: new Date().toISOString(),
  };
}
