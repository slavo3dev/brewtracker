import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "../../lib/supabase";

const SELFIE_BUCKET = "time-entry-selfies";

export type UploadClockInSelfieInput = {
  timeEntryId: string;
  photoUri: string;
};

export type UploadClockInSelfieResult = {
  storagePath: string;
};

async function requireAuthenticatedUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Unable to verify your session: ${error.message}`);
  }

  if (!user) {
    throw new Error("You must be signed in to upload a clock-in selfie.");
  }

  return user.id;
}

async function verifyTimeEntryOwnership(
  timeEntryId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, driver_id, status")
    .eq("id", timeEntryId)
    .eq("driver_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify time entry: ${error.message}`);
  }

  if (!data) {
    throw new Error("The clock-in record could not be found.");
  }

  if (data.status !== "open" && data.status !== "manager_override") {
    throw new Error(
      "A selfie can only be attached to an active clock-in record.",
    );
  }
}

async function readPhotoAsBase64(photoUri: string): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(photoUri);

  if (!fileInfo.exists) {
    throw new Error("The captured selfie file could not be found.");
  }

  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    throw new Error("The captured selfie file is empty.");
  }

  return base64;
}

function createStoragePath(userId: string, timeEntryId: string): string {
  return `${userId}/${timeEntryId}/clock-in-${Date.now()}.jpg`;
}

async function removeUploadedFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(SELFIE_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.warn(
      "Unable to clean up uploaded selfie after database failure:",
      error.message,
    );
  }
}

export async function uploadClockInSelfie({
  timeEntryId,
  photoUri,
}: UploadClockInSelfieInput): Promise<UploadClockInSelfieResult> {
  const userId = await requireAuthenticatedUserId();

  await verifyTimeEntryOwnership(timeEntryId, userId);

  const base64Photo = await readPhotoAsBase64(photoUri);
  const imageArrayBuffer = decode(base64Photo);
  const storagePath = createStoragePath(userId, timeEntryId);

  const { error: uploadError } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(storagePath, imageArrayBuffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Unable to upload selfie: ${uploadError.message}`);
  }

  const { data: updatedEntry, error: updateError } = await supabase
    .from("time_entries")
    .update({
      clock_in_selfie_url: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", timeEntryId)
    .eq("driver_id", userId)
    .in("status", ["open", "manager_override"])
    .select("id")
    .maybeSingle();

  if (updateError || !updatedEntry) {
    await removeUploadedFile(storagePath);

    throw new Error(
      updateError
        ? `Selfie uploaded, but the clock-in record could not be updated: ${updateError.message}`
        : "Selfie uploaded, but the clock-in record is no longer active.",
    );
  }

  return {
    storagePath,
  };
}
