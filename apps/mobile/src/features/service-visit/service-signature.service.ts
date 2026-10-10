import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "../../lib/supabase";

const SIGNATURE_BUCKET = "service-visit-signatures";

type UploadSignatureInput = {
  userId: string;
  visitId: string;
  stopId: string;
  clientId: string;
  machineId: string;
  localUri: string;
  signedAt: string;
};

export type UploadSignatureResult = {
  storagePath: string;
  databaseId: string;
};

function requireDocumentDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("Local document storage is unavailable.");
  }

  return FileSystem.documentDirectory;
}

async function ensureDirectoryExists(directoryUri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(directoryUri);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, {
      intermediates: true,
    });
  }
}

async function requireFile(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);

  if (!info.exists || info.isDirectory) {
    throw new Error("The saved signature could not be found.");
  }
}

function extractBase64(dataUrl: string): string {
  const separatorIndex = dataUrl.indexOf(",");

  if (separatorIndex < 0) {
    throw new Error("The signature image has an invalid format.");
  }

  const base64 = dataUrl.slice(separatorIndex + 1);

  if (!base64) {
    throw new Error("The signature image is empty.");
  }

  return base64;
}

export async function persistSignatureLocally(
  visitId: string,
  dataUrl: string,
): Promise<string> {
  const directoryUri =
    `${requireDocumentDirectory()}` + `service-visits/${visitId}/signature`;

  await ensureDirectoryExists(directoryUri);

  const localUri = `${directoryUri}/client-${Date.now()}.png`;

  await FileSystem.writeAsStringAsync(localUri, extractBase64(dataUrl), {
    encoding: FileSystem.EncodingType.Base64,
  });

  await requireFile(localUri);

  return localUri;
}

export async function uploadSignature({
  userId,
  visitId,
  stopId,
  clientId,
  machineId,
  localUri,
  signedAt,
}: UploadSignatureInput): Promise<UploadSignatureResult> {
  await requireFile(localUri);

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    throw new Error("The locally saved signature is empty.");
  }

  const storagePath = `${userId}/${visitId}/client-signature.png`;

  const { error: uploadError } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(storagePath, decode(base64), {
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
        signed_by: userId,
        source_visit_id: visitId,
        stop_id: stopId,
        client_id: clientId,
        machine_id: machineId,
        storage_path: storagePath,
        signed_at: signedAt,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "source_visit_id",
      },
    )
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from(SIGNATURE_BUCKET).remove([storagePath]);

    throw error;
  }

  return {
    storagePath,
    databaseId: data.id,
  };
}

export async function deleteLocalSignature(
  uri: string | null | undefined,
): Promise<void> {
  if (!uri) {
    return;
  }

  await FileSystem.deleteAsync(uri, {
    idempotent: true,
  });
}
