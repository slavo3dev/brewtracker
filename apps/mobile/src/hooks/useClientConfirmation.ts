import { useCallback } from "react";

import { deleteLocalSignature } from "../features/service-visit/service-signature.service";
import type {
  SaveSignatureInput,
  ServiceVisit,
  UpdateMediaUploadInput,
} from "../features/service-visit/service-visit.types";

type CommitVisitMutation = (
  mutation: (
    currentVisit: ServiceVisit,
  ) => ServiceVisit | Promise<ServiceVisit>,
) => Promise<ServiceVisit>;

type UseClientConfirmationParams = {
  commitVisitMutation: CommitVisitMutation;
  setErrorMessage: (message: string | null) => void;
};

export function useClientConfirmation({
  commitVisitMutation,
  setErrorMessage,
}: UseClientConfirmationParams) {
  const saveSignature = useCallback(
    async (
      input: SaveSignatureInput,
    ): Promise<ServiceVisit> => {
      if (!input.localUri.trim()) {
        throw new Error(
          "The locally stored signature is missing.",
        );
      }

      if (
        !input.signedAt.trim() ||
        Number.isNaN(Date.parse(input.signedAt))
      ) {
        throw new Error(
          "The signature timestamp is invalid.",
        );
      }

      let previousLocalUri: string | null = null;

      const updatedVisit =
        await commitVisitMutation((currentVisit) => {
          if (currentVisit.currentStep !== "summary") {
            throw new Error(
              "A signature can only be captured during Review & Complete.",
            );
          }

          previousLocalUri =
            currentVisit.clientConfirmation.signature
              ?.localUri ?? null;

          return {
            ...currentVisit,

            clientConfirmation: {
              signature: {
                localUri: input.localUri,
                storagePath: null,
                databaseId: null,
                uploadStatus: "pending_upload",
                uploadError: null,
                signedAt: input.signedAt,
                uploadedAt: null,
              },

              confirmedAt: null,
            },

            updatedAt: new Date().toISOString(),
          };
        });

      if (
        previousLocalUri &&
        previousLocalUri !== input.localUri
      ) {
        await deleteLocalSignature(
          previousLocalUri,
        ).catch((error: unknown) => {
          console.warn(
            "Unable to remove replaced signature:",
            error,
          );
        });
      }

      setErrorMessage(null);

      return updatedVisit;
    },
    [commitVisitMutation, setErrorMessage],
  );

  const updateSignatureUpload = useCallback(
    (
      localUri: string,
      input: UpdateMediaUploadInput,
    ): Promise<ServiceVisit> =>
      commitVisitMutation((currentVisit) => {
        const signature =
          currentVisit.clientConfirmation.signature;

        if (
          !signature ||
          signature.localUri !== localUri
        ) {
          throw new Error(
            "This signature was replaced before its upload finished.",
          );
        }

        const updatedSignature = {
          ...signature,
          ...input,
        };

        return {
          ...currentVisit,

          clientConfirmation: {
            signature: updatedSignature,

            confirmedAt:
              updatedSignature.uploadStatus === "uploaded"
                ? updatedSignature.signedAt
                : currentVisit.clientConfirmation
                    .confirmedAt,
          },

          updatedAt: new Date().toISOString(),
        };
      }),
    [commitVisitMutation],
  );

  const removeSignature = useCallback(
    async (): Promise<ServiceVisit> => {
      let removedLocalUri: string | null = null;

      const updatedVisit =
        await commitVisitMutation((currentVisit) => {
          if (currentVisit.currentStep !== "summary") {
            throw new Error(
              "The signature cannot be changed now.",
            );
          }

          const signature =
            currentVisit.clientConfirmation.signature;

          if (signature?.uploadStatus === "uploaded") {
            throw new Error(
              "An uploaded client signature cannot be removed.",
            );
          }

          removedLocalUri =
            signature?.localUri ?? null;

          return {
            ...currentVisit,

            clientConfirmation: {
              signature: null,
              confirmedAt: null,
            },

            updatedAt: new Date().toISOString(),
          };
        });

      await deleteLocalSignature(
        removedLocalUri,
      ).catch((error: unknown) => {
        console.warn(
          "Unable to remove local signature:",
          error,
        );
      });

      setErrorMessage(null);

      return updatedVisit;
    },
    [commitVisitMutation, setErrorMessage],
  );

  return {
    saveSignature,
    updateSignatureUpload,
    removeSignature,
  };
}