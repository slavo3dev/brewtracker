import {
  getServiceVisitStepIndex,
  SERVICE_VISIT_STEPS,
  type ServiceVisit,
  type ServiceVisitStepId,
} from "../service-visit.types";

export function transitionToNextStep(
  visit: ServiceVisit,
  stepId: ServiceVisitStepId,
  timestamp: string,
): ServiceVisit {
  if (visit.status !== "in_progress") {
    throw new Error("Only an in-progress service visit can be updated.");
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

  const isFinalStep = currentIndex === SERVICE_VISIT_STEPS.length - 1;

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
