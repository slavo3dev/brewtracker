import { useCallback, type Dispatch, type SetStateAction } from "react";

import { saveMachineServiceConfirmation } from "../features/service-visit/machine-refill.service";
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
  const completeMachineRefill = useCallback(
    async (input: CompleteMachineRefillInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "machine_refill") {
        throw new Error("Machine service cannot be completed yet.");
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

      if (existing && isLegacyMachineRefill(existing)) {
        throw new Error(
          "This visit contains a legacy quantity-based machine refill. " +
            "Its original inventory data must be synchronized through " +
            "the legacy recovery workflow before continuing.",
        );
      }

      if (
        existing &&
        (existing.syncStatus === "pending_sync" ||
          existing.syncStatus === "failed")
      ) {
        if (existing.outcome !== input.outcome || existing.reason !== reason) {
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

      let syncedVisit: ServiceVisit;

      try {
        const databaseId = await saveMachineServiceConfirmation({
          sourceVisitId: pendingRecord.sourceVisitId,
          clientId: activeVisit.clientId,
          stopId: activeVisit.stopId,
          machineId: activeVisit.machineId,
          confirmedAt: pendingRecord.confirmedAt,
          outcome: pendingRecord.outcome,
          reason: pendingRecord.reason,
        });

        syncedVisit = {
          ...pendingVisit,
          machineRefill: {
            ...pendingRecord,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(syncedVisit);
        setActiveVisit(syncedVisit);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync machine service confirmation.";

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

      const transitionedVisit = transitionToNextStep(
        syncedVisit,
        "machine_refill",
        new Date().toISOString(),
      );

      await saveServiceVisit(transitionedVisit);
      setActiveVisit(transitionedVisit);
      setErrorMessage(null);

      return transitionedVisit;
    },
    [activeVisit, setActiveVisit, setErrorMessage],
  );

  return {
    completeMachineRefill,
  };
}
