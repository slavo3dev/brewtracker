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
  stop_machines: Array<{
    id: string;
    machine_id: string;
    sequence_number: number;
    drink_count_required: boolean;
    machine: Pick<
      MachineRow,
      "id" | "name" | "serial_number"
    > | null;
  }>;
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
            stop_machines (
              id,
              machine_id,
              sequence_number,
              drink_count_required,
              machine:machines (
                id,
                name,
                serial_number
              )
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

export type RouteStopMachineInput = {
  machineId: string;
  drinkCountRequired: boolean;
};

export async function addRouteStop(input: {
  routeId: string;
  clientId: string;
  machines: RouteStopMachineInput[];
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  notes: string | null;
}) {
  if (input.machines.length === 0) {
    throw new Error("Select at least one machine.");
  }

  const machineIds = input.machines.map(
    (machine) => machine.machineId,
  );

  if (
    machineIds.some((machineId) => !machineId) ||
    new Set(machineIds).size !== machineIds.length
  ) {
    throw new Error("Machine assignments must be unique and valid.");
  }

  const supabase = createAdminClient();

  const { error } = await supabase.rpc(
    "create_multi_machine_route_stop",
    {
      p_route_id: input.routeId,
      p_client_id: input.clientId,
      p_machines: input.machines.map((machine) => ({
        machine_id: machine.machineId,
        drink_count_required: machine.drinkCountRequired,
      })),
      p_scheduled_start_at: input.scheduledStartAt ?? undefined,
      p_scheduled_end_at: input.scheduledEndAt ?? undefined,
      p_notes: input.notes ?? undefined,
    },
  );

  if (error) {
    throw new Error(
      `Unable to add route stop: ${error.message}`,
    );
  }
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

export async function cancelRoute(
  routeId: string,
): Promise<void> {
  const supabase = createAdminClient();

  const normalizedRouteId =
    routeId.trim();

  if (!normalizedRouteId) {
    throw new Error(
      "Route is required.",
    );
  }

  const { error } = await supabase.rpc(
    "cancel_operational_route",
    {
      p_route_id: normalizedRouteId,
    },
  );

  if (error) {
    throw new Error(
      `Unable to cancel route: ${error.message}`,
    );
  }
}
