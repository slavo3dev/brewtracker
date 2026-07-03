import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type WarehouseRow = Database["public"]["Tables"]["warehouses"]["Row"];
type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type MachineRow = Database["public"]["Tables"]["machines"]["Row"];
type RouteRow = Database["public"]["Tables"]["routes"]["Row"];
type StopRow = Database["public"]["Tables"]["stops"]["Row"];

export type RouteBuilderStop = StopRow & {
  client: Pick<
    ClientRow,
    "id" | "name" | "address" | "city" | "latitude" | "longitude"
  > | null;
  machine: Pick<MachineRow, "id" | "name" | "serial_number"> | null;
};

export type RouteBuilderRoute = RouteRow & {
  driver: Pick<UserRow, "id" | "full_name" | "email" | "region"> | null;
  warehouse: Pick<WarehouseRow, "id" | "name" | "city" | "region"> | null;
  stops: RouteBuilderStop[];
};

export async function getRouteBuilderData() {
  const supabase = createAdminClient();

  const [
    routesResult,
    driversResult,
    warehousesResult,
    clientsResult,
    machinesResult,
  ] = await Promise.all([
    supabase
      .from("routes")
      .select(
        `
          *,
          driver:users!routes_driver_id_fkey (
            id,
            full_name,
            email,
            region
          ),
          warehouse:warehouses (
            id,
            name,
            city,
            region
          ),
          stops (
            *,
            client:clients (
              id,
              name,
              address,
              city,
              latitude,
              longitude
            ),
            machine:machines (
              id,
              name,
              serial_number
            )
          )
        `,
      )
      .order("route_date", { ascending: false }),

    supabase
      .from("users")
      .select("id, full_name, email, region")
      .in("role", ["driver", "tech"])
      .eq("is_active", true)
      .order("full_name"),

    supabase.from("warehouses").select("*").order("name"),

    supabase.from("clients").select("*").order("name"),

    supabase.from("machines").select("*").order("name"),
  ]);

  if (routesResult.error) throw new Error(routesResult.error.message);
  if (driversResult.error) throw new Error(driversResult.error.message);
  if (warehousesResult.error) throw new Error(warehousesResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);
  if (machinesResult.error) throw new Error(machinesResult.error.message);

  return {
    routes: routesResult.data as RouteBuilderRoute[],
    drivers: driversResult.data,
    warehouses: warehousesResult.data,
    clients: clientsResult.data,
    machines: machinesResult.data,
  };
}

export async function createRoute(input: {
  driverId: string;
  warehouseId: string;
  routeDate: string;
  createdBy: string;
  notes: string | null;
}) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("routes").insert({
    driver_id: input.driverId,
    warehouse_id: input.warehouseId,
    route_date: input.routeDate,
    created_by: input.createdBy,
    notes: input.notes,
    status: "scheduled",
  });

  if (error) throw new Error(error.message);
}

export async function addRouteStop(input: {
  routeId: string;
  clientId: string;
  machineId: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  notes: string | null;
}) {
  const supabase = createAdminClient();

  const { data: existingStops, error: stopsError } = await supabase
    .from("stops")
    .select("sequence_number")
    .eq("route_id", input.routeId)
    .order("sequence_number", { ascending: false })
    .limit(1);

  if (stopsError) throw new Error(stopsError.message);

  const nextSequence = existingStops?.[0]?.sequence_number
    ? existingStops[0].sequence_number + 1
    : 1;

  const { error } = await supabase.from("stops").insert({
    route_id: input.routeId,
    client_id: input.clientId,
    machine_id: input.machineId,
    scheduled_start_at: input.scheduledStartAt,
    scheduled_end_at: input.scheduledEndAt,
    notes: input.notes,
    sequence_number: nextSequence,
    status: "pending",
  });

  if (error) throw new Error(error.message);
}

export async function updateStopSequence(input: {
  stopId: string;
  sequenceNumber: number;
}) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("stops")
    .update({
      sequence_number: input.sequenceNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.stopId);

  if (error) throw new Error(error.message);
}

export async function deleteRouteStop(stopId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("stops").delete().eq("id", stopId);

  if (error) throw new Error(error.message);
}
