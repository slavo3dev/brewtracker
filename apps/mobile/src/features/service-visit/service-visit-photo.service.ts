import { supabase } from "../../lib/supabase";
import type { BeforePhotoKind } from "./service-visit.types";

export type ServicePhotoStage = "before" | "after" | "signature";

export type CreateServiceVisitPhotoInput = {
  userId: string;

  visitId: string;

  stopId: string;

  machineId: string;

  stage: ServicePhotoStage;

  kind: BeforePhotoKind;

  storagePath: string;

  capturedAt: string;

  schemaVersion?: 1 | 2;
};

export async function createServiceVisitPhoto(
  input: CreateServiceVisitPhotoInput,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("AUTH USER IS NULL");
  }

  if (user.id !== input.userId) {
    throw new Error(`User mismatch: auth=${user.id} visit=${input.userId}`);
  }

  const { data, error } = await supabase.rpc(
    "upsert_service_visit_photo",
    {
      p_source_visit_id: input.visitId,
      p_stop_id: input.stopId,
      p_machine_id: input.machineId,
      p_stage: input.stage,
      p_kind: input.kind,
      p_storage_path: input.storagePath,
      p_captured_at: input.capturedAt,
    },
  );

  if (error) {
    throw error;
  }

  const result = data?.[0];

  if (!result) {
    throw new Error(
      "The photo metadata could not be saved. Check photo ownership and permissions.",
    );
  }

  if (!result.accepted) {
    throw new Error(
      "This photo was superseded by a newer capture.",
    );
  }

  return result.photo_id;
}

export async function deleteServiceVisitPhoto(id: string): Promise<void> {
  const { error } = await supabase
    .from("service_visit_photos")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
