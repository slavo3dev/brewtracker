import { useCallback } from "react";

import { syncCompletedServiceVisit } from "../features/service-visit/service-visit-summary.service";

import { assertVisitReadyForCompletion } from "../features/service-visit/state/service-visit.completion";

import { transitionToNextStep } from "../features/service-visit/state/service-visit.transitions";

import type { ServiceVisit } from "../features/service-visit/service-visit.types";

type CommitVisitMutation = (
  mutation: (
    currentVisit: ServiceVisit,
  ) => ServiceVisit | Promise<ServiceVisit>,
) => Promise<ServiceVisit>;

type UseSummaryStepParams = {
  commitVisitMutation: CommitVisitMutation;
  setErrorMessage: (
    message: string | null,
  ) => void;
};

export function useSummaryStep({
  commitVisitMutation,
  setErrorMessage,
}: UseSummaryStepParams) {
  const verifyClosingMachineScan =
    useCallback(
      async (
        scannedValueInput: string,
      ): Promise<ServiceVisit> => {
        const scannedValue =
          scannedValueInput.trim();

        if (!scannedValue) {
          throw new Error(
            "The scanned QR code is empty.",
          );
        }

        const updatedVisit =
          await commitVisitMutation(
            (currentVisit) => {
              if (
                currentVisit.currentStep !==
                "summary"
              ) {
                throw new Error(
                  "Closing verification can only be performed during Step 8.",
                );
              }

              const expectedQrCode =
                currentVisit.machineTarget
                  .qrCode.trim();

              if (!expectedQrCode) {
                throw new Error(
                  "The assigned machine has no valid QR code.",
                );
              }

              if (
                scannedValue !==
                expectedQrCode
              ) {
                throw new Error(
                  "This QR code belongs to a different machine. Scan the machine assigned to this stop.",
                );
              }

              const now =
                new Date().toISOString();

              return {
                ...currentVisit,

                summary: {
                  ...currentVisit.summary,

                  closingVerification: {
                    scannedValue,
                    expectedQrCode,

                    machineId:
                      currentVisit
                        .machineTarget.id,

                    verifiedAt: now,
                  },
                },

                updatedAt: now,
              };
            },
          );

        setErrorMessage(null);

        return updatedVisit;
      },
      [
        commitVisitMutation,
        setErrorMessage,
      ],
    );

  const syncVisit = useCallback(
    async (
      visit: ServiceVisit,
    ): Promise<ServiceVisit> => {
      try {
        const result =
          await syncCompletedServiceVisit(
            visit,
          );

        const syncedVisit =
          await commitVisitMutation(
            (currentVisit) => ({
              ...currentVisit,

              summary: {
                ...currentVisit.summary,

                syncStatus: "synced",

                syncError: null,

                databaseId:
                  result.summaryId,

                surveyToken:
                  result.surveyToken,

                emailSentAt:
                  result.emailSentAt,
              },

              updatedAt:
                new Date().toISOString(),
            }),
          );

        setErrorMessage(null);

        return syncedVisit;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync the completed service visit.";

        const failedVisit =
          await commitVisitMutation(
            (currentVisit) => ({
              ...currentVisit,

              summary: {
                ...currentVisit.summary,

                syncStatus: "failed",

                syncError: message,
              },

              updatedAt:
                new Date().toISOString(),
            }),
          );

        /*
         * Important:
         *
         * The visit is already safely completed
         * locally. Do not turn a notification
         * failure into a failed service visit.
         */
        setErrorMessage(
          "Service completed. Client notification is waiting to sync.",
        );

        return failedVisit;
      }
    },
    [
      commitVisitMutation,
      setErrorMessage,
    ],
  );

  const completeSummary =
    useCallback(async (): Promise<ServiceVisit> => {
      const completedVisit =
        await commitVisitMutation(
          (currentVisit) => {
            assertVisitReadyForCompletion(
              currentVisit,
            );

            const now =
              new Date().toISOString();

            const pendingVisit: ServiceVisit =
              {
                ...currentVisit,

                summary: {
                  ...currentVisit.summary,

                  syncStatus:
                    "pending_sync",

                  syncError: null,
                },

                updatedAt: now,
              };

            /*
             * "summary" is the final state-machine
             * step, so this changes status to
             * "completed" and sets completedAt.
             */
            return transitionToNextStep(
              pendingVisit,
              "summary",
              now,
            );
          },
        );

      /*
       * The visit is persisted locally before this
       * network operation starts.
       */
      return syncVisit(completedVisit);
    }, [
      commitVisitMutation,
      syncVisit,
    ]);

  const retrySummarySync =
    useCallback(async (): Promise<ServiceVisit> => {
      const visit =
        await commitVisitMutation(
          (currentVisit) => {
            if (
              currentVisit.status !==
              "completed"
            ) {
              throw new Error(
                "Only a completed visit can retry synchronization.",
              );
            }

            return {
              ...currentVisit,

              summary: {
                ...currentVisit.summary,

                syncStatus:
                  "pending_sync",

                syncError: null,
              },

              updatedAt:
                new Date().toISOString(),
            };
          },
        );

      return syncVisit(visit);
    }, [
      commitVisitMutation,
      syncVisit,
    ]);

  return {
    verifyClosingMachineScan,
    completeSummary,
    retrySummarySync,
  };
}