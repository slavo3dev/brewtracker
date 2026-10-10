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
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Unable to upload the issue photo: ${uploadError.message}`);
  }

  const { data: attachedPath, error: attachError } = await supabase.rpc(
    "attach_technical_ticket_photo",
    {
      p_ticket_id: ticketId,
      p_storage_path: storagePath,
    },
  );

  if (!attachError && attachedPath === storagePath) {
    return storagePath;
  }

  // The RPC may have committed even if its response failed.
  // Verify the saved path before removing the uploaded file.
  const { data: ticket, error: verificationError } = await supabase
    .from("technical_tickets")
    .select("photo_storage_path")
    .eq("id", ticketId)
    .eq("reported_by", userId)
    .single();

  if (verificationError || !ticket) {
    throw new Error(
      "The issue ticket was created, but its photo attachment could not " +
        "be verified. Contact your manager before submitting again.",
    );
  }

  if (ticket.photo_storage_path === storagePath) {
    return storagePath;
  }

  const { error: cleanupError } = await supabase.storage
    .from(TECHNICAL_TICKET_BUCKET)
    .remove([storagePath]);

  const reason =
    attachError?.message ?? "The saved photo path could not be confirmed.";

  if (cleanupError) {
    console.warn("Unable to remove unattached issue photo:", cleanupError);

    throw new Error(
      `The issue ticket was created, but its photo could not be attached: ` +
        `${reason} The uploaded file could not be removed.`,
    );
  }

  throw new Error(
    `The issue ticket was created, but its photo could not be attached: ` +
      `${reason} The uploaded photo was removed.`,
  );
}
