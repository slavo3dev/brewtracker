import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";

type WarehouseUpdate = Database["public"]["Tables"]["warehouses"]["Update"];

export async function getWarehouses() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);

  return data;
}

export async function updateWarehouseGeofence(input: {
  warehouseId: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
}) {
  const supabase = createAdminClient();

  const payload: WarehouseUpdate = {
    latitude: input.latitude,
    longitude: input.longitude,
    geofence_radius_meters: input.geofenceRadiusMeters,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("warehouses")
    .update(payload)
    .eq("id", input.warehouseId);

  if (error) throw new Error(error.message);
}