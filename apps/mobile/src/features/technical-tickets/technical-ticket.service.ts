import { supabase } from "../../lib/supabase";

import type {
  CreateTechnicalTicketInput,
  TechnicalTicket,
} from "./technical-ticket.types";

const TICKET_SELECT = `
  id,
  reported_by,
  source_visit_id,
  stop_id,
  client_id,
  machine_id,
  description,
  status,
  assigned_to,
  photo_storage_path,
  created_at
`;

export async function createTechnicalTicket(
  input: CreateTechnicalTicketInput,
): Promise<TechnicalTicket> {
  const description = input.description.trim();

  if (!description) {
    throw new Error(
      "Describe the technical issue before submitting.",
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "You must be signed in to report an issue.",
    );
  }

  if (user.id !== input.reportedBy) {
    throw new Error(
      "The signed-in user does not match this service visit.",
    );
  }

  const { data, error } = await supabase
    .from("technical_tickets")
    .insert({
      reported_by: input.reportedBy,
      source_visit_id: input.sourceVisitId,
      stop_id: input.stopId,
      client_id: input.clientId,
      machine_id: input.machineId,
      description,
      status: "open",
    })
    .select(TICKET_SELECT)
    .single();

  if (error) {
    throw new Error(
      `Unable to report the technical issue: ${error.message}`,
    );
  }

  return {
    id: data.id,
    reportedBy: data.reported_by,
    sourceVisitId: data.source_visit_id,
    stopId: data.stop_id,
    clientId: data.client_id,
    machineId: data.machine_id,
    description: data.description,
    status: data.status,
    assignedTo: data.assigned_to,
    photoStoragePath: data.photo_storage_path,
    createdAt: data.created_at,
  };
}