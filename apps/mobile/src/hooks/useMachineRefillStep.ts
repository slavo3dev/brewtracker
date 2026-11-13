import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import {
  saveMachineServiceConfirmation,
  syncLegacyMachineRefill,
} from "../features/service-visit/machine-refill.service";
import { saveServiceVisit } from "../features/service-visit/service-visit.storage";

import {
  isLegacyMachineRefill,
  type CompleteMachineRefillInput,
  type MachineServiceConfirmationRecord,
  type ServiceVisit,
} from "../features/service-visit/service-visit.types";

import { transitionToNextStep } from "../features/service-visit/state/service-visit.transitions";

type UseMachineRefillStepParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

export function useMachineRefillStep({
  activeVisit,
  setActiveVisit,
  setErrorMessage,
}: UseMachineRefillStepParams) {
  const legacyRetryInProgress = useRef(false);
  const confirmationInProgress = useRef(false);
  const completeMachineRefill = useCallback(
    async (input: CompleteMachineRefillInput): Promise<ServiceVisit> => {
      if (confirmationInProgress.current) {
        throw new Error(
          "Machine service confirmation is already being processed.",
        );
      }

      confirmationInProgress.current = true;

      try {
        if (!activeVisit) {
          throw new Error("There is no active service visit.");
        }

        if (activeVisit.currentStep !== "machine_refill") {
          throw new Error("Machine service cannot be completed yet.");
        }

        if (
          activeVisit.machineRefill &&
          isLegacyMachineRefill(activeVisit.machineRefill)
        ) {
          throw new Error(
            "This visit contains a legacy quantity-based machine refill. " +
              "Use the legacy recovery workflow to continue.",
          );
        }

        // A successful remote save may have been followed by
        // an interrupted local step transition.
        if (
          activeVisit.machineRefill?.syncStatus === "synced" &&
          activeVisit.machineRefill.databaseId
        ) {
          const transitionedVisit = transitionToNextStep(
            activeVisit,
            "machine_refill",
            new Date().toISOString(),
          );

          await saveServiceVisit(transitionedVisit);
          setActiveVisit(transitionedVisit);
          setErrorMessage(null);

          return transitionedVisit;
        }

        if (
          activeVisit.restockDrop?.syncStatus !== "synced" ||
          !activeVisit.restockDrop.databaseId
        ) {
          throw new Error(
            "Client delivery must be synced before machine service.",
          );
        }

        if (
          activeVisit.inventoryAudit?.syncStatus !== "synced" ||
          !activeVisit.inventoryAudit.databaseId
        ) {
          throw new Error("Client reserve before service must be synced.");
        }

        if (
          activeVisit.reserveAfter?.syncStatus !== "synced" ||
          !activeVisit.reserveAfter.databaseId
        ) {
          throw new Error("Client reserve after delivery must be synced.");
        }

        const validOutcomes = ["refilled", "not_needed", "unable_to_refill"];

        if (!validOutcomes.includes(input.outcome)) {
          throw new Error("Select a valid machine service outcome.");
        }

        const reason = input.reason?.trim() || null;

        if (input.outcome === "unable_to_refill" && !reason) {
          throw new Error(
            "Enter a reason why the machine could not be refilled.",
          );
        }

        if (input.outcome !== "unable_to_refill" && reason) {
          throw new Error(
            "A reason is only allowed when refill was not possible.",
          );
        }

        /*
         * Preserve an existing pending or failed confirmation.
         *
         * A retry must reuse the original timestamp, outcome,
         * and reason to satisfy database idempotency.
         */
        const existing = activeVisit.machineRefill;

        if (
          existing &&
          (existing.syncStatus === "pending_sync" ||
            existing.syncStatus === "failed")
        ) {
          if (
            existing.outcome !== input.outcome ||
            existing.reason !== reason
          ) {
            throw new Error(
              "This visit already has a pending machine service confirmation. Retry the original confirmation.",
            );
          }
        }

        const confirmedAt = existing?.confirmedAt ?? new Date().toISOString();

        const pendingRecord: MachineServiceConfirmationRecord = {
          recordType: "confirmation",
          databaseId: existing?.databaseId ?? null,
          sourceVisitId: activeVisit.id,
          confirmedAt,
          outcome: existing?.outcome ?? input.outcome,
          reason: existing?.reason ?? reason,
          syncStatus: "pending_sync",
          syncError: null,
        };

        const pendingVisit: ServiceVisit = {
          ...activeVisit,
          machineRefill: pendingRecord,
          updatedAt: new Date().toISOString(),
        };

        // Persist before making a network request.
        await saveServiceVisit(pendingVisit);
        setActiveVisit(pendingVisit);

        let databaseId: string;

        try {
          databaseId = await saveMachineServiceConfirmation({
            sourceVisitId: pendingRecord.sourceVisitId,
            clientId: activeVisit.clientId,
            stopId: activeVisit.stopId,
            machineId: activeVisit.machineId,
            confirmedAt: pendingRecord.confirmedAt,
            outcome: pendingRecord.outcome,
            reason: pendingRecord.reason,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to synchronize machine service confirmation.";

          const failedVisit: ServiceVisit = {
            ...pendingVisit,
            machineRefill: {
              ...pendingRecord,
              syncStatus: "failed",
              syncError: message,
            },
            updatedAt: new Date().toISOString(),
          };

          await saveServiceVisit(failedVisit);
          setActiveVisit(failedVisit);
          setErrorMessage(message);

          throw error;
        }

        const syncedVisit: ServiceVisit = {
          ...pendingVisit,
          machineRefill: {
            ...pendingRecord,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: new Date().toISOString(),
        };

        // Remote synchronization succeeded.
        // Keep local persistence errors separate from RPC failures.
        await saveServiceVisit(syncedVisit);
        setActiveVisit(syncedVisit);

        const transitionedVisit = transitionToNextStep(
          syncedVisit,
          "machine_refill",
          new Date().toISOString(),
        );

        await saveServiceVisit(transitionedVisit);
        setActiveVisit(transitionedVisit);
        setErrorMessage(null);

        return transitionedVisit;
      } finally {
        confirmationInProgress.current = false;
      }
    },
    [activeVisit, setActiveVisit, setErrorMessage],
  );

  const retryLegacyMachineRefill =
    useCallback(async (): Promise<ServiceVisit> => {
      if (legacyRetryInProgress.current) {
        throw new Error(
          "Legacy machine refill synchronization is already running.",
        );
      }

      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "machine_refill") {
        throw new Error(
          "Machine refill recovery is not available at this step.",
        );
      }

      const record = activeVisit.machineRefill;

      if (!record || !isLegacyMachineRefill(record)) {
        throw new Error("No legacy machine refill record was found.");
      }

      if (record.syncStatus === "synced" && record.databaseId) {
        const transitionedVisit = transitionToNextStep(
          activeVisit,
          "machine_refill",
          new Date().toISOString(),
        );

        await saveServiceVisit(transitionedVisit);
        setActiveVisit(transitionedVisit);
        setErrorMessage(null);

        return transitionedVisit;
      }

      if (
        activeVisit.restockDrop?.syncStatus !== "synced" ||
        !activeVisit.restockDrop.databaseId
      ) {
        throw new Error(
          "Client delivery must be synchronized before legacy refill recovery.",
        );
      }

      legacyRetryInProgress.current = true;

      try {
        const pendingVisit: ServiceVisit = {
          ...activeVisit,
          machineRefill: {
            ...record,
            syncStatus: "pending_sync",
            syncError: null,
          },
          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(pendingVisit);
        setActiveVisit(pendingVisit);

        let databaseId: string;

        try {
          databaseId = await syncLegacyMachineRefill({
            record,
            clientId: activeVisit.clientId,
            stopId: activeVisit.stopId,
            machineId: activeVisit.machineId,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to synchronize the legacy machine refill.";

          const failedVisit: ServiceVisit = {
            ...pendingVisit,
            machineRefill: {
              ...record,
              syncStatus: "failed",
              syncError: message,
            },
            updatedAt: new Date().toISOString(),
          };

          await saveServiceVisit(failedVisit);
          setActiveVisit(failedVisit);
          setErrorMessage(message);

          throw error;
        }

        const syncedVisit: ServiceVisit = {
          ...pendingVisit,
          machineRefill: {
            ...record,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: new Date().toISOString(),
        };

        // The RPC succeeded. Do not classify a subsequent
        // local storage failure as a remote synchronization failure.
        await saveServiceVisit(syncedVisit);
        setActiveVisit(syncedVisit);

        const transitionedVisit = transitionToNextStep(
          syncedVisit,
          "machine_refill",
          new Date().toISOString(),
        );

        await saveServiceVisit(transitionedVisit);
        setActiveVisit(transitionedVisit);
        setErrorMessage(null);

        return transitionedVisit;
      } finally {
        legacyRetryInProgress.current = false;
      }
    }, [activeVisit, setActiveVisit, setErrorMessage]);

  return {
    completeMachineRefill,
    retryLegacyMachineRefill,
  };
}
