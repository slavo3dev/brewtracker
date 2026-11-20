import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";
import type { BeforePhotoKind } from "./service-visit.types";
import { prepareServicePhoto } from "./photos/prepare-service-photo";
import {
  createServiceVisitPhoto,
  deleteServiceVisitPhoto,
  type ServicePhotoStage,
} from "./service-visit-photo.service";

const SERVICE_VISIT_PHOTOS_BUCKET = "service-visit-photos";

type PersistBeforePhotoInput = {
  visitId: string;
  machineId?: string;
  kind: BeforePhotoKind;
  temporaryUri: string;
};

type UploadBeforePhotoInput = {
  userId: string;

  visitId: string;

  stopId: string;

  machineId: string;

  capturedAt: string;

  stage: ServicePhotoStage;

  kind: BeforePhotoKind;

  localUri: string;

  schemaVersion?: 1 | 2;
};

export type UploadBeforePhotoResult = {
  storagePath: string;
  databaseId: string;
};

function requireDocumentDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("Local document storage is unavailable on this device.");
  }

  return FileSystem.documentDirectory;
}

function getVisitBeforePhotoDirectory(
  visitId: string,
  machineId?: string,
): string {
  const documentDirectory = requireDocumentDirectory();

  if (machineId) {
    return `${documentDirectory}service-visits/${visitId}/machines/${machineId}/before`;
  }

  return `${documentDirectory}service-visits/${visitId}/before`;
}

function createLocalFileName(kind: BeforePhotoKind): string {
  return `${kind}-${Date.now()}.jpg`;
}

async function ensureDirectoryExists(directoryUri: string): Promise<void> {
  const directoryInfo = await FileSystem.getInfoAsync(directoryUri);

  if (directoryInfo.exists) {
    return;
  }

  await FileSystem.makeDirectoryAsync(directoryUri, {
    intermediates: true,
  });
}

async function assertFileExists(fileUri: string): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);

  if (!fileInfo.exists) {
    throw new Error("The captured service photo could not be found.");
  }
}

/**
 * Copies the temporary camera file into durable application storage.
 *
 * CameraView photos can live in a temporary cache that the OS may
 * remove. FLOW-5 persists the photo into documentDirectory before
 * updating the service-visit state.
 */
export async function persistBeforePhotoLocally({
  visitId,
  machineId,
  kind,
  temporaryUri,
}: PersistBeforePhotoInput): Promise<string> {
  const preparedPhoto = await prepareServicePhoto(temporaryUri);

  const directoryUri = getVisitBeforePhotoDirectory(visitId, machineId);

  await ensureDirectoryExists(directoryUri);

  const localUri = `${directoryUri}/${createLocalFileName(kind)}`;

  await FileSystem.copyAsync({
    from: preparedPhoto.uri,
    to: localUri,
  });

  await assertFileExists(localUri);

  return localUri;
}

async function readPhotoAsArrayBuffer(localUri: string): Promise<ArrayBuffer> {
  await assertFileExists(localUri);

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    throw new Error("The locally stored service photo is empty.");
  }

  return decode(base64);
}

function createStoragePath({
  userId,
  visitId,
  machineId,
  kind,
  schemaVersion,
  capturedAt,
}: Pick<
  UploadBeforePhotoInput,
  "userId" | "visitId" | "machineId" | "kind" | "schemaVersion" | "capturedAt"
>): string {
  if (schemaVersion !== 2) {
    return `${userId}/${visitId}/before/${kind}.jpg`;
  }

  const captureId = encodeURIComponent(capturedAt);
  return `${userId}/${visitId}/machines/${machineId}/before/${kind}-${captureId}.jpg`;
}

/**
 * Best-effort immediate upload.
 *
 * The local file remains the source of truth. If this upload fails,
 * the photo stays in the persisted visit with status "failed" so a
 * manual retry or the future SYNC photo worker can upload it later.
 */
export async function uploadBeforePhoto({
  userId,
  visitId,
  stopId,
  machineId,
  capturedAt,
  stage,
  kind,
  localUri,
  schemaVersion,
}: UploadBeforePhotoInput): Promise<UploadBeforePhotoResult> {
  const imageArrayBuffer = await readPhotoAsArrayBuffer(localUri);

  const storagePath = createStoragePath({
    userId,
    visitId,
    machineId,
    kind,
    schemaVersion,
    capturedAt,
  });

  const { error } = await supabase.storage
    .from(SERVICE_VISIT_PHOTOS_BUCKET)
    .upload(storagePath, imageArrayBuffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  try {
    const databaseId = await createServiceVisitPhoto({
      userId,
      visitId,
      stopId,
      machineId,
      stage,
      kind,
      storagePath,
      capturedAt,
      schemaVersion,
    });

    return {
      storagePath,
      databaseId,
    };
  } catch (error) {
    await supabase.storage
      .from(SERVICE_VISIT_PHOTOS_BUCKET)
      .remove([storagePath]);

    throw error;
  }
}

export async function deleteLocalBeforePhoto(
  localUri: string | null | undefined,
): Promise<void> {
  if (!localUri) {
    return;
  }

  const fileInfo = await FileSystem.getInfoAsync(localUri);

  if (!fileInfo.exists) {
    return;
  }

  await FileSystem.deleteAsync(localUri, {
    idempotent: true,
  });
}

export async function deleteUploadedBeforePhoto(
  storagePath: string | null | undefined,
  databaseId: string | null | undefined,
): Promise<void> {
  if (!storagePath) {
    return;
  }

  if (databaseId) {
    const { data, error } = await supabase
      .from("service_visit_photos")
      .delete()
      .eq("id", databaseId)
      .eq("storage_path", storagePath)
      .select("id");

    if (error) {
      throw error;
    }

    if (!data?.length) {
      // The row no longer references this photo, or deletion was denied.
      // Do not remove its Storage object without confirming ownership.
      return;
    }
  }

  const { error: storageError } = await supabase.storage
    .from(SERVICE_VISIT_PHOTOS_BUCKET)
    .remove([storagePath]);

  if (storageError) {
    console.warn(
      "Unable to remove service photo from storage:",
      storageError.message,
    );
  }
}
