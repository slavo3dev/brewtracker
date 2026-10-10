export type ServiceVisitStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";

export type ServiceVisitListItem = {
  id: string;
  status: ServiceVisitStatus;

  arrivedAt: string | null;
  completedAt: string | null;

  client: {
    id: string;
    name: string;
  };

  machine: {
    id: string;
    name: string | null;
    serialNumber: string | null;
  } | null;

  driver: {
    id: string;
    fullName: string;
  };
};
