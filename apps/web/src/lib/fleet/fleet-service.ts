import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";

type LocationPingRow = Database["public"]["Tables"]["location_pings"]["Row"];
type UserRow = Database["public"]["Tables"]["users"]["Row"];
type RouteRow = Database["public"]["Tables"]["routes"]["Row"];

export type FleetLocation = LocationPingRow & {
  driver: Pick<UserRow, "id" | "full_name" | "email" | "region"> | null;
  route: Pick<RouteRow, "id" | "route_date" | "status"> | null;
};

export async function getLatestFleetLocations(): Promise<FleetLocation[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("location_pings")
    .select(
      `
      *,
      driver:users!location_pings_driver_id_fkey (
        id,
        full_name,
        email,
        region
      ),
      route:routes (
        id,
        route_date,
        status
      )
    `,
    )
    .order("recorded_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const latestByDriver = new Map<string, FleetLocation>();

  for (const ping of data as FleetLocation[]) {
    if (!latestByDriver.has(ping.driver_id)) {
      latestByDriver.set(ping.driver_id, ping);
    }
  }

  return Array.from(latestByDriver.values());
}
