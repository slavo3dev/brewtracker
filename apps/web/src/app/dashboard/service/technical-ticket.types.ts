import type { Database } from "@brewtracker/types";

export type TechnicalTicketStatus =
  Database["public"]["Tables"]["technical_tickets"]["Row"]["status"];

export type TechnicalTicketTechnician = {
  id: string;
  fullName: string;
};

export type TechnicalTicketListItem = {
  id: string;
  description: string;
  status: TechnicalTicketStatus;

  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;

  photoStoragePath: string | null;
  photoUrl: string | null;

  client: {
    id: string;
    name: string;
  };

  machine: {
    id: string;
    name: string | null;
    serialNumber: string | null;
  };

  reporter: {
    id: string;
    fullName: string;
  };

  assignedTo: {
    id: string;
    fullName: string;
  } | null;
};
