import { useCallback, type Dispatch, type SetStateAction } from "react";

import { saveMachineMeterReading } from "../../src/features/service-visit/meter-reading.service";
import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import {
  type CompleteMeterReadingInput,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../../src/features/service-visit/state/service-visit.transitions";

type UseMeterReadingStepParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;
  clearError: () => void;
};

export function useMeterReadingStep({
  activeVisit,
  setActiveVisit,
  clearError,
}: UseMeterReadingStepParams) {
  const completeMeterReading = useCallback(
    async (input: CompleteMeterReadingInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "meter_reading") {
        throw new Error(
          "The meter reading can only be completed during Step 4.",
        );
      }

      if (!Number.isSafeInteger(input.reading) || input.reading < 0) {
        throw new Error(
          "Enter a valid non-negative whole-number meter reading.",
        );
      }

      const savedReading = await saveMachineMeterReading({
        machineId: activeVisit.machineId,
        stopId: activeVisit.stopId,
        recordedBy: activeVisit.userId,
        sourceVisitId: activeVisit.id,
        reading: input.reading,
      });

      const now = new Date().toISOString();

      const visitWithMeterReading: ServiceVisit = {
        ...activeVisit,
        meterReading: {
          databaseId: savedReading.id,
          sourceVisitId: savedReading.sourceVisitId,
          reading: savedReading.reading,
          previousReading: savedReading.previousReading,
          delta: savedReading.delta,
          recordedAt: savedReading.recordedAt,
        },
        updatedAt: now,
      };

      const updatedVisit = transitionToNextStep(
        visitWithMeterReading,
        "meter_reading",
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
    completeMeterReading,
  };
}
