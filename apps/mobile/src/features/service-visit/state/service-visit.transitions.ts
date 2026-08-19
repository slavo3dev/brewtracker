import type {
  ServiceVisit,
  ServiceVisitStepId,
} from "../service-visit.types";

export function transitionToNextStep(
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

  const currentIndex = visit.steps.findIndex(
    (step) => step.id === stepId,
  );

  if (currentIndex < 0) {
    throw new Error(
      "The requested service step is not part of this visit.",
    );
  }

  const nextStep = visit.steps[currentIndex + 1] ?? null;

  const updatedSteps = visit.steps.map((step, index) => {
    if (index === currentIndex) {
      return {
        ...step,
        status: "completed" as const,
        completedAt: timestamp,
      };
    }

    if (nextStep && index === currentIndex + 1) {
      return {
        ...step,
        status: "current" as const,
      };
    }

    return step;
  });

  const isFinalStep = nextStep === null;

  return {
    ...visit,

    status: isFinalStep
      ? "completed"
      : "in_progress",

    currentStep: isFinalStep
      ? visit.currentStep
      : nextStep.id,

    steps: updatedSteps,

    updatedAt: timestamp,

    completedAt: isFinalStep
      ? timestamp
      : null,
  };
}