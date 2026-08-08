import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "../../lib/supabase";
import { prepareServicePhoto } from "./photos/prepare-service-photo";
import { createServiceVisitPhoto } from "./service-visit-photo.service";

const SERVICE_VISIT_BUCKET = "service-visit-photos";

function requireDocumentDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("Local document storage is unavailable.");
  }

  return FileSystem.documentDirectory;
}

async function ensureDirectory(directoryUri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(directoryUri);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, {
      intermediates: true,
    });
  }
}

async function requireLocalFile(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);

  if (!info.exists || info.isDirectory) {
    throw new Error("The locally saved media file could not be found.");
  }
}

async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  await requireLocalFile(uri);

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    throw new Error("The locally saved media file is empty.");
  }

  return decode(base64);
}

export async function persistAfterPhotoLocally(
  visitId: string,
  temporaryUri: string,
): Promise<string> {
  const preparedPhoto = await prepareServicePhoto(temporaryUri);

  const directory =
    `${requireDocumentDirectory()}` + `service-visits/${visitId}/after/`;

  await ensureDirectory(directory);

  const destination = `${directory}completed-machine-` + `${Date.now()}.jpg`;

  await FileSystem.copyAsync({
    from: preparedPhoto.uri,
    to: destination,
  });

  await requireLocalFile(destination);

  return destination;
}

export async function persistSignatureLocally(
  visitId: string,
  dataUrl: string,
): Promise<string> {
  const marker = "base64,";
  const markerIndex = dataUrl.indexOf(marker);

  if (!dataUrl.startsWith("data:image/png;") || markerIndex < 0) {
    throw new Error("The signature canvas returned invalid image data.");
  }

  const base64 = dataUrl.slice(markerIndex + marker.length);

  if (!base64) {
    throw new Error("The signature image is empty.");
  }

  const directory =
    `${requireDocumentDirectory()}` + `service-visits/${visitId}/signature/`;

  await ensureDirectory(directory);

  const destination = `${directory}client-signature-` + `${Date.now()}.png`;

  await FileSystem.writeAsStringAsync(destination, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await requireLocalFile(destination);

  return destination;
}

export async function uploadAfterPhoto(input: {
  userId: string;
  visitId: string;
  stopId: string;
  machineId: string;
  localUri: string;
  capturedAt: string;
}): Promise<{
  storagePath: string;
  databaseId: string;
}> {
  const storagePath =
    `${input.userId}/${input.visitId}` + "/after/exterior.jpg";

  const bytes = await readFileAsArrayBuffer(input.localUri);

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_VISIT_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const databaseId = await createServiceVisitPhoto({
    userId: input.userId,
    visitId: input.visitId,
    stopId: input.stopId,
    machineId: input.machineId,
    stage: "after",
    kind: "exterior",
    storagePath,
    capturedAt: input.capturedAt,
  });

  return {
    storagePath,
    databaseId,
  };
}

export async function uploadSignature(input: {
  userId: string;
  visitId: string;
  stopId: string;
  clientId: string;
  machineId: string;
  localUri: string;
  signedAt: string;
}): Promise<{
  storagePath: string;
  databaseId: string;
}> {
  const storagePath =
    `${input.userId}/${input.visitId}` + "/signature/client.png";

  const bytes = await readFileAsArrayBuffer(input.localUri);

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_VISIT_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data, error } = await supabase
    .from("service_visit_signatures")
    .upsert(
      {
        signed_by: input.userId,
        source_visit_id: input.visitId,
        stop_id: input.stopId,
        client_id: input.clientId,
        machine_id: input.machineId,
        storage_path: storagePath,
        signed_at: input.signedAt,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "source_visit_id",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return {
    storagePath,
    databaseId: data.id,
  };
}

export async function deleteLocalMedia(uri: string | null): Promise<void> {
  if (!uri) {
    return;
  }

  await FileSystem.deleteAsync(uri, {
    idempotent: true,
  });
}
