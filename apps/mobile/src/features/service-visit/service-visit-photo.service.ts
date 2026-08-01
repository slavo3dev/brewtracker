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

  const { data, error } = await supabase
    .from("service_visit_photos")
    .upsert(
      {
        uploaded_by: input.userId,
        source_visit_id: input.visitId,
        stop_id: input.stopId,
        machine_id: input.machineId,
        stage: input.stage,
        kind: input.kind,
        storage_path: input.storagePath,
        captured_at: input.capturedAt,
      },
      {
        onConflict: "source_visit_id,stage,kind",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
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
