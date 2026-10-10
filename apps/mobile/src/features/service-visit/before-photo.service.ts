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

function getVisitBeforePhotoDirectory(visitId: string): string {
  const documentDirectory = requireDocumentDirectory();

  return `${documentDirectory}service-visits/` + `${visitId}/before`;
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
  kind,
  temporaryUri,
}: PersistBeforePhotoInput): Promise<string> {
  const preparedPhoto = await prepareServicePhoto(temporaryUri);

  const directoryUri = getVisitBeforePhotoDirectory(visitId);

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
  kind,
}: Pick<UploadBeforePhotoInput, "userId" | "visitId" | "kind">): string {
  return `${userId}/${visitId}/before/${kind}.jpg`;
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
}: UploadBeforePhotoInput): Promise<UploadBeforePhotoResult> {
  const imageArrayBuffer = await readPhotoAsArrayBuffer(localUri);

  const storagePath = createStoragePath({
    userId,
    visitId,
    kind,
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
  if (storagePath) {
    const { error } = await supabase.storage
      .from(SERVICE_VISIT_PHOTOS_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.warn("Unable to remove replaced service photo:", error.message);
    }
  }

  if (databaseId) {
    await deleteServiceVisitPhoto(databaseId);
  }
}
