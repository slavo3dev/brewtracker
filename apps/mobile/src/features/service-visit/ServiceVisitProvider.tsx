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

  completeCurrentStep: (
    stepId: ServiceVisitStepId,
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

      const now = new Date().toISOString();

      const visit: ServiceVisit = {
        id: createVisitId(),
        userId,
        routeId: input.routeId,
        stopId: input.stopId,
        clientId: input.clientId,
        machineId: input.machineId,

        status: "in_progress",
        currentStep: SERVICE_VISIT_STEPS[0].id,

        steps: createInitialStepStates(),

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

  const completeCurrentStep = useCallback(
    async (
      stepId: ServiceVisitStepId,
    ): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.status !== "in_progress") {
        throw new Error(
          "Only an in-progress service visit can be updated.",
        );
      }

      if (activeVisit.currentStep !== stepId) {
        throw new Error(
          `Step "${stepId}" cannot be completed yet. The current required step is "${activeVisit.currentStep}".`,
        );
      }

      const currentIndex = getServiceVisitStepIndex(stepId);

      if (currentIndex < 0) {
        throw new Error("The requested service step is invalid.");
      }

      const now = new Date().toISOString();
      const isFinalStep =
        currentIndex === SERVICE_VISIT_STEPS.length - 1;

      const updatedSteps = activeVisit.steps.map(
        (step, index) => {
          if (index === currentIndex) {
            return {
              ...step,
              status: "completed" as const,
              completedAt: now,
            };
          }

          if (!isFinalStep && index === currentIndex + 1) {
            return {
              ...step,
              status: "current" as const,
            };
          }

          return step;
        },
      );

      const updatedVisit: ServiceVisit = {
        ...activeVisit,
        status: isFinalStep ? "completed" : "in_progress",
        currentStep: isFinalStep
          ? activeVisit.currentStep
          : SERVICE_VISIT_STEPS[currentIndex + 1].id,
        steps: updatedSteps,
        updatedAt: now,
        completedAt: isFinalStep ? now : null,
      };

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