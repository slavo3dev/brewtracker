import type { Database } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";
import {
  readTodayRouteSnapshot,
  saveTodayRouteSnapshot,
} from "./route-cache.service";
import type {
  RouteDataSource,
  TodayRoute,
  TodayRouteSnapshot,
  TodayRouteStop,
} from "./route.types";

type RouteRow = Pick<
  Database["public"]["Tables"]["routes"]["Row"],
  "id" | "warehouse_id" | "route_date" | "status" | "notes" | "created_at"
>;

type WarehouseRow = Pick<
  Database["public"]["Tables"]["warehouses"]["Row"],
  "id" | "name" | "address" | "city"
>;

type StopRow = Pick<
  Database["public"]["Tables"]["stops"]["Row"],
  | "id"
  | "client_id"
  | "machine_id"
  | "sequence_number"
  | "status"
  | "scheduled_start_at"
  | "scheduled_end_at"
  | "arrived_at"
  | "completed_at"
  | "skipped_reason"
  | "notes"
  | "drink_count_required"
>;

type ClientRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  | "id"
  | "name"
  | "address"
  | "city"
  | "latitude"
  | "longitude"
  | "geofence_radius_meters"
>;

type MachineRow = Pick<
  Database["public"]["Tables"]["machines"]["Row"],
  | "id"
  | "name"
  | "model"
  | "serial_number"
  | "qr_code"
  | "status"
  | "installed_at"
  | "last_service_at"
>;

export type LoadTodayRouteResult = {
  route: TodayRoute | null;
  source: RouteDataSource;
  syncedAt: string | null;
  warningMessage: string | null;
};

export function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function requireAuthenticatedUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Unable to verify your session: ${error.message}`);
  }

  if (!user) {
    throw new Error("You must be signed in to load today's route.");
  }

  return user.id;
}

async function fetchTodayRouteRows(
  userId: string,
  routeDate: string,
): Promise<RouteRow[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("id, warehouse_id, route_date, status, notes, created_at")
    .eq("driver_id", userId)
    .eq("route_date", routeDate)
    .in("status", ["draft", "scheduled", "in_progress"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load today's routes: ${error.message}`);
  }

  return data ?? [];
}

async function fetchWarehouse(
  warehouseId: string | null,
): Promise<WarehouseRow | null> {
  if (!warehouseId) {
    return null;
  }

  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, address, city")
    .eq("id", warehouseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the route warehouse: ${error.message}`);
  }

  return data;
}

async function fetchRouteStops(routeId: string): Promise<StopRow[]> {
  const { data, error } = await supabase
    .from("stops")
    .select(
      `
      id,
      client_id,
      machine_id,
      sequence_number,
      status,
      scheduled_start_at,
      scheduled_end_at,
      arrived_at,
      completed_at,
      skipped_reason,
      notes,
      drink_count_required
    `,
    )
    .eq("route_id", routeId)
    .order("sequence_number", { ascending: true });

  if (error) {
    throw new Error(`Unable to load route stops: ${error.message}`);
  }

  return data;
}

function hasRemainingWork(stops: StopRow[]): boolean {
  return stops.some(
    (stop) => stop.status !== "completed" && stop.status !== "skipped",
  );
}

async function selectTodayRoute(
  userId: string,
  routeDate: string,
): Promise<{
  routeRow: RouteRow;
  stops: StopRow[];
} | null> {
  const routeRows = await fetchTodayRouteRows(userId, routeDate);

  if (routeRows.length === 0) {
    return null;
  }

  let fallback: {
    routeRow: RouteRow;
    stops: StopRow[];
  } | null = null;

  for (const routeRow of routeRows) {
    const stops = await fetchRouteStops(routeRow.id);

    if (!fallback && stops.length > 0) {
      fallback = {
        routeRow,
        stops,
      };
    }

    if (hasRemainingWork(stops)) {
      return {
        routeRow,
        stops,
      };
    }
  }

  if (fallback) {
    return fallback;
  }

  // All today's candidate routes are empty.
  // Keep the existing newest-route behavior as the final fallback.
  return {
    routeRow: routeRows[0],
    stops: [],
  };
}

async function fetchClients(clientIds: string[]): Promise<ClientRow[]> {
  if (clientIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("clients")
    .select(
      `
      id,
      name,
      address,
      city,
      latitude,
      longitude,
      geofence_radius_meters
    `,
    )
    .in("id", clientIds);

  if (error) {
    throw new Error(`Unable to load route clients: ${error.message}`);
  }

  return data;
}

async function fetchMachines(machineIds: string[]): Promise<MachineRow[]> {
  if (machineIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("machines")
    .select(
      "id, name, model, serial_number, qr_code, status, installed_at, last_service_at",
    )
    .in("id", machineIds);

  if (error) {
    throw new Error(`Unable to load route machines: ${error.message}`);
  }

  return data;
}

function removeDuplicates(values: string[]): string[] {
  return [...new Set(values)];
}

function buildTodayRouteStops(
  stops: StopRow[],
  clients: ClientRow[],
  machines: MachineRow[],
): TodayRouteStop[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  const machinesById = new Map(
    machines.map((machine) => [machine.id, machine]),
  );

  return stops.flatMap((stop) => {
    const client = clientsById.get(stop.client_id);

    if (!client) {
      console.warn("Skipping route stop with inaccessible client:", {
        stopId: stop.id,
        clientId: stop.client_id,
      });

      return [];
    }

    const machine = stop.machine_id
      ? (machinesById.get(stop.machine_id) ?? null)
      : null;

    const routeStop: TodayRouteStop = {
      id: stop.id,
      clientId: stop.client_id,
      machineId: stop.machine_id,
      sequenceNumber: stop.sequence_number,
      status: stop.status,
      scheduledStartAt: stop.scheduled_start_at,
      scheduledEndAt: stop.scheduled_end_at,
      arrivedAt: stop.arrived_at,
      completedAt: stop.completed_at,
      skippedReason: stop.skipped_reason,
      notes: stop.notes,
      drinkCountRequired: stop.drink_count_required,

      client: {
        id: client.id,
        name: client.name,
        address: client.address,
        city: client.city,
        latitude: client.latitude,
        longitude: client.longitude,
        geofenceRadiusMeters: client.geofence_radius_meters,
      },

      machine: machine
        ? {
            id: machine.id,
            name: machine.name,
            model: machine.model,
            serialNumber: machine.serial_number,
            qrCode: machine.qr_code,
            status: machine.status,
            installedAt: machine.installed_at,
            lastServiceAt: machine.last_service_at,
          }
        : null,
    };

    return [routeStop];
  });
}

async function fetchTodayRouteFromNetwork(
  userId: string,
  routeDate: string,
): Promise<TodayRouteSnapshot> {
  const selectedRoute = await selectTodayRoute(userId, routeDate);

  if (!selectedRoute) {
    const emptySnapshot: TodayRouteSnapshot = {
      userId,
      routeDate,
      route: null,
      syncedAt: new Date().toISOString(),
    };

    await saveTodayRouteSnapshot(emptySnapshot);

    return emptySnapshot;
  }

  const { routeRow, stops } = selectedRoute;

  const warehouse = await fetchWarehouse(routeRow.warehouse_id);

  const clientIds = removeDuplicates(stops.map((stop) => stop.client_id));

  const machineIds = removeDuplicates(
    stops.flatMap((stop) => (stop.machine_id ? [stop.machine_id] : [])),
  );

  const [clients, machines] = await Promise.all([
    fetchClients(clientIds),
    fetchMachines(machineIds),
  ]);

  const route: TodayRoute = {
    id: routeRow.id,
    routeDate: routeRow.route_date,
    status: routeRow.status,
    notes: routeRow.notes,
    warehouse,
    stops: buildTodayRouteStops(stops, clients, machines),
  };

  const snapshot: TodayRouteSnapshot = {
    userId,
    routeDate,
    route,
    syncedAt: new Date().toISOString(),
  };

  await saveTodayRouteSnapshot(snapshot);

  return snapshot;
}

async function loadRouteWithCacheFallback(
  userId: string,
  routeDate: string,
): Promise<LoadTodayRouteResult> {
  try {
    const snapshot = await fetchTodayRouteFromNetwork(userId, routeDate);

    return {
      route: snapshot.route,
      source: "network",
      syncedAt: snapshot.syncedAt,
      warningMessage: null,
    };
  } catch (networkError) {
    console.warn(
      "Unable to fetch today's route; attempting cached fallback:",
      networkError,
    );

    const cachedSnapshot = await readTodayRouteSnapshot(userId, routeDate);

    if (!cachedSnapshot) {
      throw networkError;
    }

    return {
      route: cachedSnapshot.route,
      source: "cache",
      syncedAt: cachedSnapshot.syncedAt,
      warningMessage:
        "You're offline. Showing the last saved version of today's route.",
    };
  }
}

export async function loadTodayRoute(): Promise<LoadTodayRouteResult> {
  const userId = await requireAuthenticatedUserId();
  const routeDate = getLocalDateString();

  return loadRouteWithCacheFallback(userId, routeDate);
}

export async function refreshTodayRoute(): Promise<LoadTodayRouteResult> {
  const userId = await requireAuthenticatedUserId();
  const routeDate = getLocalDateString();

  return loadRouteWithCacheFallback(userId, routeDate);
}
