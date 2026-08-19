import { useCallback, type Dispatch, type SetStateAction } from "react";

import { saveMachineMeterReading } from "../features/service-visit/meter-reading.service";
import { saveServiceVisit } from "../features/service-visit/service-visit.storage";
import {
  type CompleteDrinkCountInput,
  type ServiceVisit,
} from "../features/service-visit/service-visit.types";
import { transitionToNextStep } from "../features/service-visit/state/service-visit.transitions";

type UseDrinkCountStepParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;
  clearError: () => void;
};

export function useDrinkCountStep({
  activeVisit,
  setActiveVisit,
  clearError,
}: UseDrinkCountStepParams) {
  const completeDrinkCount = useCallback(
    async (input: CompleteDrinkCountInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      /*
       * FLOW-14:
       * Drink Count is an optional task configured
       * by the admin for this route stop.
       */
      if (!activeVisit.tasks.drinkCountRequired) {
        throw new Error("Drink Count is not required for this service visit.");
      }

      if (activeVisit.currentStep !== "drink_count") {
        throw new Error(
          "Drink Count can only be recorded during the Drink Count step.",
        );
      }

      if (!Number.isSafeInteger(input.runningTotal) || input.runningTotal < 0) {
        throw new Error(
          "Enter a valid non-negative whole-number Running Total.",
        );
      }

      /*
       * The driver enters only Running Total.
       * Archive Total is calculated automatically
       * inside the service layer.
       */
      const savedReading = await saveMachineMeterReading({
        machineId: activeVisit.machineId,
        stopId: activeVisit.stopId,
        recordedBy: activeVisit.userId,
        sourceVisitId: activeVisit.id,
        runningTotal: input.runningTotal,
      });

      const now = new Date().toISOString();

      const visitWithDrinkCount: ServiceVisit = {
        ...activeVisit,

        drinkCount: {
          databaseId: savedReading.id,
          sourceVisitId: savedReading.sourceVisitId,

          runningTotal: savedReading.runningTotal,

          archiveTotal: savedReading.archiveTotal,

          recordedAt: savedReading.recordedAt,
        },

        updatedAt: now,
      };

      const updatedVisit = transitionToNextStep(
        visitWithDrinkCount,
        "drink_count",
        now,
      );

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      clearError();

      return updatedVisit;
    },
    [activeVisit, clearError, setActiveVisit],
  );

  return {
    completeDrinkCount,
  };
}
