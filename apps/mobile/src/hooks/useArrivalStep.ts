import { useCallback } from "react";

import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import {
  type CompleteArrivalInput,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../features/service-visit/state/service-visit.transitions";

type UseArrivalStepParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: (visit: ServiceVisit) => void;
  clearError: () => void;
};

export function useArrivalStep({
  activeVisit,
  setActiveVisit,
  clearError,
}: UseArrivalStepParams) {
  const completeArrival = useCallback(
    async (input: CompleteArrivalInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "arrival") {
        throw new Error(
          "Arrival verification can only be completed during Step 1.",
        );
      }

      const expectedRadius = activeVisit.target.geofenceRadiusMeters;

      if (expectedRadius <= 0) {
        throw new Error("The client geofence radius is invalid.");
      }

      if (input.method === "geofence") {
        if (!input.driverPosition || !input.targetPosition) {
          throw new Error(
            "A valid GPS position is required to confirm arrival.",
          );
        }

        if (input.distanceMeters == null) {
          throw new Error(
            "The distance from the client could not be calculated.",
          );
        }

        if (input.distanceMeters > expectedRadius) {
          throw new Error("You are outside the client geofence.");
        }
      }

      const normalizedOverrideReason = input.overrideReason?.trim() ?? "";

      if (
        input.method === "manual_override" &&
        normalizedOverrideReason.length < 10
      ) {
        throw new Error(
          "Enter a clear override reason of at least 10 characters.",
        );
      }

      const now = new Date().toISOString();

      const visitWithArrival: ServiceVisit = {
        ...activeVisit,
        arrivalVerification: {
          method: input.method,
          driverPosition: input.driverPosition,
          targetPosition: input.targetPosition,
          distanceMeters: input.distanceMeters,
          geofenceRadiusMeters: expectedRadius,
          overrideReason:
            input.method === "manual_override"
              ? normalizedOverrideReason
              : null,
          verifiedAt: now,
        },
      };

      const updatedVisit = transitionToNextStep(
        visitWithArrival,
        "arrival",
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
    completeArrival,
  };
}
