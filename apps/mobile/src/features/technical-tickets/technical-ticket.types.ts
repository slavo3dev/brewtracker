export type TechnicalTicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "cancelled";

export type CreateTechnicalTicketInput = {
  reportedBy: string;
  sourceVisitId: string;
  stopId: string;
  clientId: string;
  machineId: string;
  description: string;
};

export type TechnicalTicket = {
  id: string;
  reportedBy: string;
  sourceVisitId: string;
  stopId: string;
  clientId: string;
  machineId: string;
  description: string;
  status: TechnicalTicketStatus;
  assignedTo: string | null;
  photoStoragePath: string | null;
  createdAt: string;
};