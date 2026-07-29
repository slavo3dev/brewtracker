import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { prepareSelfie } from "./prepare-selfie";
import { supabase } from "../../lib/supabase";

const SELFIE_BUCKET = "time-entry-selfies";

export type SelfieUploadPhase = "preparing" | "uploading" | "attaching";

export type UploadClockInSelfieInput = {
  timeEntryId: string;
  photoUri: string;
  onPhaseChange?: (phase: SelfieUploadPhase) => void;
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
    .select("id, driver_id, status, selfie_status")
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

  if (data.selfie_status === "uploaded") {
    throw new Error(
      "A clock-in selfie has already been uploaded for this shift.",
    );
  }

  if (data.selfie_status === "waived") {
    throw new Error(
      "The selfie requirement has already been waived by a manager.",
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

async function uploadSelfieObject(
  storagePath: string,
  imageArrayBuffer: ArrayBuffer,
): Promise<void> {
  const { error } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(storagePath, imageArrayBuffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Unable to upload selfie: ${error.message}`);
  }
}

/**
 * Updates the active time entry after a successful upload.
 *
 * TODO(Admin Review):
 * Managers will eventually be able to waive the selfie requirement
 * from the Time Entry Review screen by setting:
 *
 *   selfie_status = "waived"
 *
 * together with:
 * - reviewed_by
 * - reviewed_at
 * - review_note (required)
 *
 * Drivers must never be able to set this state.
 */

async function attachSelfiePathToTimeEntry(
  timeEntryId: string,
  userId: string,
  storagePath: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("time_entries")
    .update({
      // This stores a private Supabase Storage object path.
      clock_in_selfie_url: storagePath,
      selfie_status: "uploaded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", timeEntryId)
    .eq("driver_id", userId)
    .in("status", ["open", "manager_override"])
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `The selfie was uploaded, but the clock-in record could not be updated: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "The selfie was uploaded, but the clock-in record is no longer active.",
    );
  }
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
  onPhaseChange,
}: UploadClockInSelfieInput): Promise<UploadClockInSelfieResult> {
  const userId = await requireAuthenticatedUserId();

  await verifyTimeEntryOwnership(timeEntryId, userId);

  onPhaseChange?.("preparing");

  const preparedSelfie = await prepareSelfie(photoUri);
  const base64Photo = await readPhotoAsBase64(preparedSelfie.uri);
  const imageArrayBuffer = decode(base64Photo);
  const storagePath = createStoragePath(userId, timeEntryId);

  onPhaseChange?.("uploading");

  await uploadSelfieObject(storagePath, imageArrayBuffer);

  try {
    onPhaseChange?.("attaching");

    await attachSelfiePathToTimeEntry(timeEntryId, userId, storagePath);
  } catch (error) {
    await removeUploadedFile(storagePath);
    throw error;
  }

  return {
    storagePath,
  };
}
