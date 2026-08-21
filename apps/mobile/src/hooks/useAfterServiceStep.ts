import { useCallback } from "react";

import { deleteLocalMedia } from "../../src/features/service-visit/after-service-media.service";
import {
  type SaveAfterPhotoInput,
  type ServiceVisit,
  type UpdateMediaUploadInput,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../../src/features/service-visit/state/service-visit.transitions";

type CommitVisitMutation = (
  mutation: (
    currentVisit: ServiceVisit,
  ) => ServiceVisit | Promise<ServiceVisit>,
) => Promise<ServiceVisit>;

type UseAfterServiceStepParams = {
  commitVisitMutation: CommitVisitMutation;
  clearError: () => void;
};

export function useAfterServiceStep({
  commitVisitMutation,
  clearError,
}: UseAfterServiceStepParams) {
  const saveAfterPhoto = useCallback(
    async (input: SaveAfterPhotoInput): Promise<ServiceVisit> => {
      if (!input.localUri.trim()) {
        throw new Error("The locally stored after-service photo is missing.");
      }

      let previousLocalUri: string | null = null;

      const updatedVisit = await commitVisitMutation((currentVisit) => {
        if (currentVisit.currentStep !== "after_service") {
          throw new Error(
            "After-service photos can only be captured during Step 7.",
          );
        }

        previousLocalUri =
          currentVisit.afterService.afterPhoto?.localUri ?? null;

        return {
          ...currentVisit,
          afterService: {
            ...currentVisit.afterService,
            afterPhoto: {
              localUri: input.localUri,
              storagePath: null,
              databaseId: null,
              uploadStatus: "pending_upload",
              uploadError: null,
              capturedAt: input.capturedAt,
              uploadedAt: null,
            },
          },
          updatedAt: new Date().toISOString(),
        };
      });

      /*
       * Delete the old local image only after
       * the replacement has been persisted.
       */
      if (previousLocalUri && previousLocalUri !== input.localUri) {
        await deleteLocalMedia(previousLocalUri).catch((error: unknown) => {
          console.warn("Unable to remove replaced after photo:", error);
        });
      }

      clearError();

      return updatedVisit;
    },
    [clearError, commitVisitMutation],
  );

  const updateAfterPhotoUpload = useCallback(
    (localUri: string, input: UpdateMediaUploadInput): Promise<ServiceVisit> =>
      commitVisitMutation((currentVisit) => {
        const photo = currentVisit.afterService.afterPhoto;

        /*
         * Ignore/reject late upload results from a
         * photo which has already been replaced.
         */
        if (!photo || photo.localUri !== localUri) {
          throw new Error(
            "This after-service photo was replaced before its upload finished.",
          );
        }

        return {
          ...currentVisit,
          afterService: {
            ...currentVisit.afterService,
            afterPhoto: {
              ...photo,
              ...input,
            },
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    [commitVisitMutation],
  );

  const completeAfterService = useCallback(
  async (): Promise<ServiceVisit> => {
    const updatedVisit = await commitVisitMutation(
      (currentVisit) => {
        if (currentVisit.currentStep !== "after_service") {
          throw new Error(
            "After Service Photo is not the current required task.",
          );
        }

        if (!currentVisit.afterService.afterPhoto?.localUri) {
          throw new Error(
            "Capture the required after-service photo.",
          );
        }

        const now = new Date().toISOString();

        return transitionToNextStep(
          {
            ...currentVisit,
            updatedAt: now,
          },
          "after_service",
          now,
        );
      },
    );

    clearError();

    return updatedVisit;
  },
  [clearError, commitVisitMutation],
);

  return {
    saveAfterPhoto,
    updateAfterPhotoUpload,
    completeAfterService,
  };
}
