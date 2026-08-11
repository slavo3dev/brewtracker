import { useCallback, type Dispatch, type SetStateAction } from "react";

import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import {
  type BeforePhotoKind,
  type SaveBeforePhotoInput,
  type ServiceVisit,
  type UpdateBeforePhotoUploadInput,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../../src/features/service-visit/state/service-visit.transitions";

type UseBeforePhotosStepParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;
  clearError: () => void;
};

export function useBeforePhotosStep({
  activeVisit,
  setActiveVisit,
  clearError,
}: UseBeforePhotosStepParams) {
  const saveBeforePhoto = useCallback(
    async (input: SaveBeforePhotoInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "before_photos") {
        throw new Error("Before photos can only be captured during Step 3.");
      }

      if (!input.localUri.trim()) {
        throw new Error("The locally stored photo URI is missing.");
      }

      const updatedPhotos = activeVisit.beforePhotos.filter(
        (photo) => photo.kind !== input.kind,
      );

      updatedPhotos.push({
        kind: input.kind,
        localUri: input.localUri,
        storagePath: null,
        databaseId: null,
        uploadStatus: "pending_upload",
        uploadError: null,
        capturedAt: input.capturedAt,
        uploadedAt: null,
      });

      const updatedVisit: ServiceVisit = {
        ...activeVisit,
        beforePhotos: updatedPhotos,
        updatedAt: new Date().toISOString(),
      };

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      clearError();

      return updatedVisit;
    },
    [activeVisit, clearError, setActiveVisit],
  );

  const updateBeforePhotoUpload = useCallback(
    async (
      visit: ServiceVisit,
      kind: BeforePhotoKind,
      input: UpdateBeforePhotoUploadInput,
    ): Promise<ServiceVisit> => {
      const existingPhoto = visit.beforePhotos.find(
        (photo) => photo.kind === kind,
      );

      if (!existingPhoto) {
        throw new Error("The selected before photo could not be found.");
      }

      const updatedPhotos = visit.beforePhotos.map((photo) =>
        photo.kind === kind
          ? {
              ...photo,
              uploadStatus: input.uploadStatus,
              storagePath:
                input.storagePath !== undefined
                  ? input.storagePath
                  : photo.storagePath,
              uploadError:
                input.uploadError !== undefined
                  ? input.uploadError
                  : photo.uploadError,
              uploadedAt:
                input.uploadedAt !== undefined
                  ? input.uploadedAt
                  : photo.uploadedAt,
              databaseId:
                input.databaseId !== undefined
                  ? input.databaseId
                  : photo.databaseId,
            }
          : photo,
      );

      const updatedVisit: ServiceVisit = {
        ...visit,
        beforePhotos: updatedPhotos,
        updatedAt: new Date().toISOString(),
      };

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);

      return updatedVisit;
    },
    [setActiveVisit],
  );

  const removeBeforePhoto = useCallback(
    async (kind: BeforePhotoKind): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "before_photos") {
        throw new Error("Before photos can only be changed during Step 3.");
      }

      const updatedVisit: ServiceVisit = {
        ...activeVisit,
        beforePhotos: activeVisit.beforePhotos.filter(
          (photo) => photo.kind !== kind,
        ),
        updatedAt: new Date().toISOString(),
      };

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      clearError();

      return updatedVisit;
    },
    [activeVisit, clearError, setActiveVisit],
  );

  const completeBeforePhotos = useCallback(async (): Promise<ServiceVisit> => {
    if (!activeVisit) {
      throw new Error("There is no active service visit.");
    }

    if (activeVisit.currentStep !== "before_photos") {
      throw new Error(
        "Before-photo verification can only be completed during Step 3.",
      );
    }

    const exteriorPhoto = activeVisit.beforePhotos.find(
      (photo) => photo.kind === "exterior",
    );

    const interiorPhoto = activeVisit.beforePhotos.find(
      (photo) => photo.kind === "interior_hopper",
    );

    if (!exteriorPhoto?.localUri) {
      throw new Error("Capture the required exterior machine photo.");
    }

    if (!interiorPhoto?.localUri) {
      throw new Error("Capture the required interior/hopper photo.");
    }

    const hasUploadingPhoto = activeVisit.beforePhotos.some(
      (photo) => photo.uploadStatus === "uploading",
    );

    if (hasUploadingPhoto) {
      throw new Error("Wait for the current photo upload attempt to finish.");
    }

    const now = new Date().toISOString();

    const updatedVisit = transitionToNextStep(
      activeVisit,
      "before_photos",
      now,
    );

    await saveServiceVisit(updatedVisit);

    setActiveVisit(updatedVisit);
    clearError();

    return updatedVisit;
  }, [activeVisit, clearError, setActiveVisit]);

  return {
    saveBeforePhoto,
    updateBeforePhotoUpload,
    removeBeforePhoto,
    completeBeforePhotos,
  };
}
