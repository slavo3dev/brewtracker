export const SERVICE_VISIT_STEPS = [
  {
    id: "arrival",
    number: 1,
    title: "Arrive and verify location",
    description: "Confirm arrival inside the client geofence.",
  },
  {
    id: "machine_scan",
    number: 2,
    title: "Scan machine QR code",
    description: "Scan and verify the machine assigned to this stop.",
  },
  {
    id: "before_photos",
    number: 3,
    title: "Take before photos",
    description: "Capture the required machine photos before service.",
  },
  {
    id: "meter_reading",
    number: 4,
    title: "Enter meter reading",
    description: "Record and validate the machine cup count.",
  },
  {
    id: "inventory_audit",
    number: 5,
    title: "Audit current inventory",
    description: "Count the stock currently available at the client.",
  },
  {
    id: "restock",
    number: 6,
    title: "Confirm restock and drop",
    description: "Confirm the products left at the client.",
  },
  {
    id: "after_service",
    number: 7,
    title: "After photos and signature",
    description: "Capture final photos and the client signature.",
  },
  {
    id: "summary",
    number: 8,
    title: "Review and complete",
    description: "Review the visit summary and complete the service.",
  },
] as const;

export type ServiceVisitStepId =
  (typeof SERVICE_VISIT_STEPS)[number]["id"];

export type ServiceVisitStatus =
  | "in_progress"
  | "completed"
  | "cancelled";

export type ServiceVisitStepStatus =
  | "locked"
  | "current"
  | "completed";

export type ServiceVisitStepState = {
  id: ServiceVisitStepId;
  status: ServiceVisitStepStatus;
  completedAt: string | null;
};

export type ServiceVisit = {
  id: string;
  userId: string;
  routeId: string;
  stopId: string;
  clientId: string;
  machineId: string | null;

  status: ServiceVisitStatus;
  currentStep: ServiceVisitStepId;

  steps: ServiceVisitStepState[];

  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type StartServiceVisitInput = {
  userId: string;
  routeId: string;
  stopId: string;
  clientId: string;
  machineId: string | null;
};

export function getServiceVisitStepIndex(
  stepId: ServiceVisitStepId,
): number {
  return SERVICE_VISIT_STEPS.findIndex((step) => step.id === stepId);
}

export function getServiceVisitStep(
  stepId: ServiceVisitStepId,
) {
  return SERVICE_VISIT_STEPS.find((step) => step.id === stepId);
}

export function createInitialStepStates(): ServiceVisitStepState[] {
  return SERVICE_VISIT_STEPS.map((step, index) => ({
    id: step.id,
    status: index === 0 ? "current" : "locked",
    completedAt: null,
  }));
}