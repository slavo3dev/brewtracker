import { useCallback } from "react";

import type { MultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit.types";
import { completeMultiMachineVisit } from "../features/service-visit/state/multi-machine-visit.completion";
import { syncCompletedMultiMachineServiceVisit } from "../features/service-visit/multi-machine-visit-summary.service";

type CommitVisitMutation = (
  mutation: (
    currentVisit: MultiMachineServiceVisit,
  ) => MultiMachineServiceVisit | Promise<MultiMachineServiceVisit>,
) => Promise<MultiMachineServiceVisit>;

type UseUnifiedSummaryStepParams = {
  commitVisitMutation: CommitVisitMutation;
  setErrorMessage: (message: string | null) => void;
};

export function useUnifiedSummaryStep({
  commitVisitMutation,
  setErrorMessage,
}: UseUnifiedSummaryStepParams) {
  const syncVisit = useCallback(
    async (
      visit: MultiMachineServiceVisit,
    ): Promise<MultiMachineServiceVisit> => {
      try {
        const result = await syncCompletedMultiMachineServiceVisit(visit);

        const syncedVisit = await commitVisitMutation((currentVisit) => {
          if (
            currentVisit.id !== visit.id ||
            currentVisit.status !== "completed" ||
            currentVisit.completedAt !== visit.completedAt
          ) {
            throw new Error("The visit changed during synchronization.");
          }

          return {
            ...currentVisit,
            summary: {
              ...currentVisit.summary,
              syncStatus: "synced",
              syncError: null,
              databaseId: result.summaryId,
              surveyToken: result.surveyToken,
              emailSentAt: result.emailSentAt,
            },
            updatedAt: new Date().toISOString(),
          };
        });

        setErrorMessage(null);
        return syncedVisit;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync the completed multi-machine visit.";

        await commitVisitMutation((currentVisit) => {
          if (
            currentVisit.id !== visit.id ||
            currentVisit.status !== "completed" ||
            currentVisit.completedAt !== visit.completedAt
          ) {
            throw new Error("The visit changed during synchronization.");
          }

          // A successful sync must not be downgraded by a stale failure.
          if (currentVisit.summary.syncStatus === "synced") {
            return currentVisit;
          }

          return {
            ...currentVisit,
            summary: {
              ...currentVisit.summary,
              syncStatus: "failed",
              syncError: message,
            },
            updatedAt: new Date().toISOString(),
          };
        });

        setErrorMessage(
          "Service was saved on this device, but could not be synced. Retry before leaving this visit.",
        );

        throw new Error(message);
      }
    },
    [commitVisitMutation, setErrorMessage],
  );

  const completeUnifiedSummary =
    useCallback(async (): Promise<MultiMachineServiceVisit> => {
      const completedVisit = await commitVisitMutation((visit) =>
        completeMultiMachineVisit(visit),
      );

      // Local persistence completes before the network request begins.
      return syncVisit(completedVisit);
    }, [commitVisitMutation, syncVisit]);

  const retryUnifiedSummarySync =
    useCallback(async (): Promise<MultiMachineServiceVisit> => {
      const visit = await commitVisitMutation((currentVisit) => {
        if (currentVisit.status !== "completed") {
          throw new Error(
            "Only a completed visit can retry synchronization.",
          );
        }

        if (currentVisit.summary.syncStatus === "synced") {
          throw new Error("This visit is already synchronized.");
        }

        return {
          ...currentVisit,
          summary: {
            ...currentVisit.summary,
            syncStatus: "pending_sync",
            syncError: null,
          },
          updatedAt: new Date().toISOString(),
        };
      });

      return syncVisit(visit);
    }, [commitVisitMutation, syncVisit]);

  return {
    completeUnifiedSummary,
    retryUnifiedSummarySync,
  };
}
