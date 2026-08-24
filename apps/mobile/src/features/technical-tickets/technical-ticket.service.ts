import { supabase } from "../../lib/supabase";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";

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

const TECHNICAL_TICKET_BUCKET = "technical-ticket-photos";

export async function createTechnicalTicket(
  input: CreateTechnicalTicketInput,
): Promise<TechnicalTicket> {
  const description = input.description.trim();

  if (!description) {
    throw new Error("Describe the technical issue before submitting.");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in to report an issue.");
  }

  if (user.id !== input.reportedBy) {
    throw new Error("The signed-in user does not match this service visit.");
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
    throw new Error(`Unable to report the technical issue: ${error.message}`);
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

export async function uploadTechnicalTicketPhoto({
  ticketId,
  userId,
  visitId,
  localUri,
}: {
  ticketId: string;
  userId: string;
  visitId: string;
  localUri: string;
}): Promise<string> {
  const info = await FileSystem.getInfoAsync(localUri);

  if (!info.exists || info.isDirectory) {
    throw new Error("The technical issue photo could not be found.");
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    throw new Error("The technical issue photo is empty.");
  }

  const storagePath = `${userId}/${visitId}/${ticketId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(TECHNICAL_TICKET_BUCKET)
    .upload(storagePath, decode(base64), {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Unable to upload the issue photo: ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from("technical_tickets")
    .update({
      photo_storage_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId)
    .eq("reported_by", userId);

  if (updateError) {
    // Avoid leaving an orphaned file.
    await supabase.storage.from(TECHNICAL_TICKET_BUCKET).remove([storagePath]);

    throw new Error(`Unable to attach the issue photo: ${updateError.message}`);
  }

  return storagePath;
}
