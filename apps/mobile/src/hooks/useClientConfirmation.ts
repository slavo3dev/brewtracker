import { useCallback } from "react";

import { deleteLocalSignature } from "../features/service-visit/service-signature.service";
import type {
  SaveSignatureInput,
  ServiceVisit,
  UpdateMediaUploadInput,
} from "../features/service-visit/service-visit.types";
import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";

type ConfirmableVisit = ServiceVisit | MultiMachineServiceVisit;

type CommitVisitMutation<TVisit extends ConfirmableVisit> = (
  mutation: (currentVisit: TVisit) => TVisit | Promise<TVisit>,
) => Promise<TVisit>;

type UseClientConfirmationParams<TVisit extends ConfirmableVisit> = {
  commitVisitMutation: CommitVisitMutation<TVisit>;
  setErrorMessage: (message: string | null) => void;
};

export function useClientConfirmation<TVisit extends ConfirmableVisit>({
  commitVisitMutation,
  setErrorMessage,
}: UseClientConfirmationParams<TVisit>) {
  const saveSignature = useCallback(
    async (input: SaveSignatureInput): Promise<TVisit> => {
      if (!input.localUri.trim()) {
        throw new Error("The locally stored signature is missing.");
      }

      if (!input.signedAt.trim() || Number.isNaN(Date.parse(input.signedAt))) {
        throw new Error("The signature timestamp is invalid.");
      }

      let previousLocalUri: string | null = null;

      const updatedVisit = await commitVisitMutation((currentVisit) => {
        if (
          currentVisit.status !== "in_progress" ||
          currentVisit.currentStep !== "summary"
        ) {
          throw new Error(
            "A signature can only be captured during Review & Complete.",
          );
        }
        if (currentVisit.currentStep !== "summary") {
          throw new Error(
            "A signature can only be captured during Review & Complete.",
          );
        }

        previousLocalUri =
          currentVisit.clientConfirmation.signature?.localUri ?? null;

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
        } as TVisit;
      });

      if (previousLocalUri && previousLocalUri !== input.localUri) {
        await deleteLocalSignature(previousLocalUri).catch((error: unknown) => {
          console.warn("Unable to remove replaced signature:", error);
        });
      }

      setErrorMessage(null);

      return updatedVisit;
    },
    [commitVisitMutation, setErrorMessage],
  );

  const updateSignatureUpload = useCallback(
    (localUri: string, input: UpdateMediaUploadInput): Promise<TVisit> =>
      commitVisitMutation((currentVisit) => {
        const signature = currentVisit.clientConfirmation.signature;

        if (
          currentVisit.status !== "in_progress" ||
          currentVisit.currentStep !== "summary"
        ) {
          throw new Error(
            "The signature cannot be updated after visit completion.",
          );
        }

        if (!signature || signature.localUri !== localUri) {
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
                : currentVisit.clientConfirmation.confirmedAt,
          },

          updatedAt: new Date().toISOString(),
        } as TVisit;
      }),
    [commitVisitMutation],
  );

  const removeSignature = useCallback(async (): Promise<TVisit> => {
    let removedLocalUri: string | null = null;

    const updatedVisit = await commitVisitMutation((currentVisit) => {
      if (currentVisit.currentStep !== "summary") {
        throw new Error("The signature cannot be changed now.");
      }

      const signature = currentVisit.clientConfirmation.signature;

      if (signature?.uploadStatus === "uploaded") {
        throw new Error("An uploaded client signature cannot be removed.");
      }

      removedLocalUri = signature?.localUri ?? null;

      return {
        ...currentVisit,

        clientConfirmation: {
          signature: null,
          confirmedAt: null,
        },

        updatedAt: new Date().toISOString(),
      } as TVisit;
    });

    await deleteLocalSignature(removedLocalUri).catch((error: unknown) => {
      console.warn("Unable to remove local signature:", error);
    });

    setErrorMessage(null);

    return updatedVisit;
  }, [commitVisitMutation, setErrorMessage]);

  return {
    saveSignature,
    updateSignatureUpload,
    removeSignature,
  };
}
