import type { Database } from "@brewtracker/types";
import { createClient } from "@/lib/supabase/server";

type ActiveFleetLocationRow =
  Database["public"]["Views"]["active_fleet_locations"]["Row"];

export type FleetLocation = ActiveFleetLocationRow;

export async function getLatestFleetLocations(): Promise<FleetLocation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("active_fleet_locations")
    .select("*")
    .order("recorded_at", { ascending: false });

  if (error) {
    throw new Error(
      `Unable to load active fleet locations: ${error.message}`,
    );
  }

  return data ?? [];
}