import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../auth/AuthProvider";
import {
  loadServiceVisit,
  removeServiceVisit,
  saveServiceVisit,
} from "./service-visit.storage";
import {
  createInitialStepStates,
  getServiceVisitStepIndex,
  SERVICE_VISIT_STEPS,
  type CompleteArrivalInput,
  type ServiceVisit,
  type ServiceVisitStepId,
  type StartServiceVisitInput,
} from "./service-visit.types";

type ServiceVisitContextValue = {
  activeVisit: ServiceVisit | null;
  restoringVisit: boolean;
  errorMessage: string | null;

  startVisit: (
    input: Omit<StartServiceVisitInput, "userId">,
  ) => Promise<ServiceVisit>;

  completeArrival: (
    input: CompleteArrivalInput,
  ) => Promise<ServiceVisit>;

  completeCurrentStep: (
    stepId: Exclude<ServiceVisitStepId, "arrival">,
  ) => Promise<ServiceVisit>;

  cancelVisit: () => Promise<void>;
  clearCompletedVisit: () => Promise<void>;

  isVisitForStop: (stopId: string) => boolean;
};

const ServiceVisitContext =
  createContext<ServiceVisitContextValue | null>(null);

function createVisitId(): string {
  return `visit-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function validateRestoredVisit(
  visit: ServiceVisit,
  userId: string,
): ServiceVisit | null {
  if (visit.userId !== userId) {
    return null;
  }

  if (!visit.id || !visit.routeId || !visit.stopId) {
    return null;
  }

  if (!visit.target) {
    return null;
  }

  if (
    typeof visit.target.clientName !== "string" ||
    typeof visit.target.geofenceRadiusMeters !== "number"
  ) {
    return null;
  }

  const currentStepExists = SERVICE_VISIT_STEPS.some(
    (step) => step.id === visit.currentStep,
  );

  if (!currentStepExists) {
    return null;
  }

  if (!Array.isArray(visit.steps)) {
    return null;
  }

  if (visit.steps.length !== SERVICE_VISIT_STEPS.length) {
    return null;
  }

  const hasExpectedSteps = SERVICE_VISIT_STEPS.every(
    (expectedStep, index) =>
      visit.steps[index]?.id === expectedStep.id,
  );

  if (!hasExpectedSteps) {
    return null;
  }

  return visit;
}

function transitionToNextStep(
  visit: ServiceVisit,
  stepId: ServiceVisitStepId,
  timestamp: string,
): ServiceVisit {
  if (visit.status !== "in_progress") {
    throw new Error(
      "Only an in-progress service visit can be updated.",
    );
  }

  if (visit.currentStep !== stepId) {
    throw new Error(
      `Step "${stepId}" cannot be completed yet. The current required step is "${visit.currentStep}".`,
    );
  }

  const currentIndex = getServiceVisitStepIndex(stepId);

  if (currentIndex < 0) {
    throw new Error("The requested service step is invalid.");
  }

  const isFinalStep =
    currentIndex === SERVICE_VISIT_STEPS.length - 1;

  const updatedSteps = visit.steps.map((step, index) => {
    if (index === currentIndex) {
      return {
        ...step,
        status: "completed" as const,
        completedAt: timestamp,
      };
    }

    if (!isFinalStep && index === currentIndex + 1) {
      return {
        ...step,
        status: "current" as const,
      };
    }

    return step;
  });

  return {
    ...visit,
    status: isFinalStep ? "completed" : "in_progress",
    currentStep: isFinalStep
      ? visit.currentStep
      : SERVICE_VISIT_STEPS[currentIndex + 1].id,
    steps: updatedSteps,
    updatedAt: timestamp,
    completedAt: isFinalStep ? timestamp : null,
  };
}

export function ServiceVisitProvider({
  children,
}: PropsWithChildren) {
  const { session, status: authStatus } = useAuth();

  const [activeVisit, setActiveVisit] =
    useState<ServiceVisit | null>(null);

  const [restoringVisit, setRestoringVisit] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  );

  const userId = session?.user.id ?? null;

  useEffect(() => {
    let mounted = true;

    async function restoreVisit(): Promise<void> {
      if (authStatus !== "authenticated" || !userId) {
        if (mounted) {
          setActiveVisit(null);
          setRestoringVisit(false);
          setErrorMessage(null);
        }

        return;
      }

      setRestoringVisit(true);
      setErrorMessage(null);

      try {
        const storedVisit = await loadServiceVisit(userId);

        if (!mounted) {
          return;
        }

        if (!storedVisit) {
          setActiveVisit(null);
          return;
        }

        const validVisit = validateRestoredVisit(
          storedVisit,
          userId,
        );

        if (!validVisit) {
          await removeServiceVisit(userId);

          if (mounted) {
            setActiveVisit(null);
          }

          return;
        }

        setActiveVisit(validVisit);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to restore the active service visit.",
        );
      } finally {
        if (mounted) {
          setRestoringVisit(false);
        }
      }
    }

    void restoreVisit();

    return () => {
      mounted = false;
    };
  }, [authStatus, userId]);

  const startVisit = useCallback(
    async (
      input: Omit<StartServiceVisitInput, "userId">,
    ): Promise<ServiceVisit> => {
      if (!userId) {
        throw new Error(
          "You must be signed in to start a service visit.",
        );
      }

      if (activeVisit?.status === "in_progress") {
        if (activeVisit.stopId === input.stopId) {
          return activeVisit;
        }

        throw new Error(
          "Complete or cancel the active service visit before starting another stop.",
        );
      }

      if (
        input.target.latitude == null ||
        input.target.longitude == null
      ) {
        throw new Error(
          "This client has no valid geofence coordinates. Ask a manager to update the client location.",
        );
      }

      if (input.target.geofenceRadiusMeters <= 0) {
        throw new Error(
          "This client has an invalid geofence radius.",
        );
      }

      const now = new Date().toISOString();

      const visit: ServiceVisit = {
        id: createVisitId(),
        userId,
        routeId: input.routeId,
        stopId: input.stopId,
        clientId: input.clientId,
        machineId: input.machineId,

        target: input.target,

        status: "in_progress",
        currentStep: SERVICE_VISIT_STEPS[0].id,

        steps: createInitialStepStates(),

        arrivalVerification: null,

        startedAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
      };

      await saveServiceVisit(visit);

      setActiveVisit(visit);
      setErrorMessage(null);

      return visit;
    },
    [activeVisit, userId],
  );

  const completeArrival = useCallback(
    async (
      input: CompleteArrivalInput,
    ): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "arrival") {
        throw new Error(
          "Arrival verification can only be completed during Step 1.",
        );
      }

      if (input.geofenceRadiusMeters <= 0) {
        throw new Error("The geofence radius is invalid.");
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

        if (input.distanceMeters > input.geofenceRadiusMeters) {
          throw new Error(
            "You are outside the client geofence.",
          );
        }
      }

      const normalizedOverrideReason =
        input.overrideReason?.trim() ?? "";

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
          geofenceRadiusMeters: input.geofenceRadiusMeters,
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
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

  const completeCurrentStep = useCallback(
    async (
      stepId: Exclude<ServiceVisitStepId, "arrival">,
    ): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      const now = new Date().toISOString();

      const updatedVisit = transitionToNextStep(
        activeVisit,
        stepId,
        now,
      );

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

  const cancelVisit = useCallback(async (): Promise<void> => {
    if (!activeVisit) {
      return;
    }

    const now = new Date().toISOString();

    const cancelledVisit: ServiceVisit = {
      ...activeVisit,
      status: "cancelled",
      updatedAt: now,
      cancelledAt: now,
    };

    await saveServiceVisit(cancelledVisit);
    setActiveVisit(cancelledVisit);
  }, [activeVisit]);

  const clearCompletedVisit =
    useCallback(async (): Promise<void> => {
      if (!userId) {
        setActiveVisit(null);
        return;
      }

      if (
        activeVisit &&
        activeVisit.status === "in_progress"
      ) {
        throw new Error(
          "An in-progress visit cannot be removed.",
        );
      }

      await removeServiceVisit(userId);
      setActiveVisit(null);
      setErrorMessage(null);
    }, [activeVisit, userId]);

  const isVisitForStop = useCallback(
    (stopId: string): boolean =>
      activeVisit?.status === "in_progress" &&
      activeVisit.stopId === stopId,
    [activeVisit],
  );

  const value = useMemo<ServiceVisitContextValue>(
    () => ({
      activeVisit,
      restoringVisit,
      errorMessage,
      startVisit,
      completeArrival,
      completeCurrentStep,
      cancelVisit,
      clearCompletedVisit,
      isVisitForStop,
    }),
    [
      activeVisit,
      restoringVisit,
      errorMessage,
      startVisit,
      completeArrival,
      completeCurrentStep,
      cancelVisit,
      clearCompletedVisit,
      isVisitForStop,
    ],
  );

  return (
    <ServiceVisitContext.Provider value={value}>
      {children}
    </ServiceVisitContext.Provider>
  );
}

export function useServiceVisit(): ServiceVisitContextValue {
  const context = useContext(ServiceVisitContext);

  if (!context) {
    throw new Error(
      "useServiceVisit must be used inside ServiceVisitProvider.",
    );
  }

  return context;
}