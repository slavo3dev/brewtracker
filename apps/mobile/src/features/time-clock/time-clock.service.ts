import type { Database, GeoPoint } from "@brewtracker/types";
import * as Location from "expo-location";

import { supabase } from "../../lib/supabase";
import type {
  ClockContext,
  ClockInResult,
  ClockOutResult,
  ClockTarget,
  TimeEntry,
} from "./time-clock.types";

type RouteRow = Pick<
  Database["public"]["Tables"]["routes"]["Row"],
  "id" | "warehouse_id" | "route_date" | "status"
>;

type WarehouseRow = Pick<
  Database["public"]["Tables"]["warehouses"]["Row"],
  | "id"
  | "name"
  | "address"
  | "latitude"
  | "longitude"
  | "geofence_radius_meters"
>;

type StopRow = Pick<
  Database["public"]["Tables"]["stops"]["Row"],
  "id" | "client_id" | "sequence_number"
>;

type ClientRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  | "id"
  | "name"
  | "address"
  | "latitude"
  | "longitude"
  | "geofence_radius_meters"
>;

function getLocalDateString(date = new Date()): string {
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
    throw new Error("You must be signed in to use the time clock.");
  }

  return user.id;
}

async function loadTodayRoute(userId: string): Promise<RouteRow | null> {
  const today = getLocalDateString();

  const { data, error } = await supabase
    .from("routes")
    .select("id, warehouse_id, route_date, status")
    .eq("driver_id", userId)
    .eq("route_date", today)
    .in("status", ["draft", "scheduled", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load today's route: ${error.message}`);
  }

  return data;
}

async function loadWarehouseTarget(
  route: RouteRow,
): Promise<ClockTarget | null> {
  if (!route.warehouse_id) {
    return null;
  }

  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, address, latitude, longitude, geofence_radius_meters")
    .eq("id", route.warehouse_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the assigned warehouse: ${error.message}`);
  }

  const warehouse = data as WarehouseRow | null;

  if (!warehouse || warehouse.latitude == null || warehouse.longitude == null) {
    return null;
  }

  return {
    id: warehouse.id,
    kind: "warehouse",
    label: warehouse.name,
    latitude: warehouse.latitude,
    longitude: warehouse.longitude,
    radiusMeters: warehouse.geofence_radius_meters,
    routeId: route.id,
    warehouseId: warehouse.id,
    stopId: null,
  };
}

async function loadFirstStopTarget(
  route: RouteRow,
): Promise<ClockTarget | null> {
  const { data: stopData, error: stopError } = await supabase
    .from("stops")
    .select("id, client_id, sequence_number")
    .eq("route_id", route.id)
    .in("status", ["pending", "in_progress"])
    .order("sequence_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stopError) {
    throw new Error(
      `Unable to load the first scheduled stop: ${stopError.message}`,
    );
  }

  const stop = stopData as StopRow | null;

  if (!stop) {
    return null;
  }

  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .select("id, name, address, latitude, longitude, geofence_radius_meters")
    .eq("id", stop.client_id)
    .maybeSingle();

  if (clientError) {
    throw new Error(
      `Unable to load the first stop location: ${clientError.message}`,
    );
  }

  const client = clientData as ClientRow | null;

  if (!client || client.latitude == null || client.longitude == null) {
    return null;
  }

  return {
    id: stop.id,
    kind: "scheduled_stop",
    label: client.name,
    latitude: client.latitude,
    longitude: client.longitude,
    radiusMeters: client.geofence_radius_meters,
    routeId: route.id,
    warehouseId: route.warehouse_id,
    stopId: stop.id,
  };
}

export async function getClockContext(): Promise<ClockContext> {
  const userId = await requireAuthenticatedUserId();
  const route = await loadTodayRoute(userId);

  if (!route) {
    return {
      routeId: null,
      routeDate: null,
      targets: [],
    };
  }

  const [warehouseTarget, firstStopTarget] = await Promise.all([
    loadWarehouseTarget(route),
    loadFirstStopTarget(route),
  ]);

  const targets = [warehouseTarget, firstStopTarget].filter(
    (target): target is ClockTarget => target !== null,
  );

  return {
    routeId: route.id,
    routeDate: route.route_date,
    targets,
  };
}

export async function getOpenTimeEntry(): Promise<TimeEntry | null> {
  const userId = await requireAuthenticatedUserId();

  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("driver_id", userId)
    .in("status", ["open", "manager_override"])
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load your current shift: ${error.message}`);
  }

  return data;
}

export async function createClockIn({
  position,
  target,
}: {
  position: GeoPoint;
  target: ClockTarget;
}): Promise<ClockInResult> {
  const userId = await requireAuthenticatedUserId();

  const existingEntry = await getOpenTimeEntry();

  if (existingEntry) {
    throw new Error("You already have an open shift.");
  }

  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      driver_id: userId,
      warehouse_id: target.warehouseId,
      route_id: target.routeId,
      stop_id: target.kind === "scheduled_stop" ? target.stopId : null,
      clock_in_at: new Date().toISOString(),
      clock_in_latitude: position.latitude,
      clock_in_longitude: position.longitude,
      status: "open",
      review_status: "pending",
      is_geofence_override: false,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("You already have an open shift.");
    }

    throw new Error(`Unable to clock in: ${error.message}`);
  }

  return {
    timeEntry: data,
  };
}

export async function requestCurrentPosition(): Promise<GeoPoint> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Location permission is required to use the time clock.");
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

export async function clockOut(timeEntryId: string): Promise<ClockOutResult> {
  const userId = await requireAuthenticatedUserId();
  const position = await requestCurrentPosition();

  const { data, error } = await supabase
    .from("time_entries")
    .update({
      clock_out_at: new Date().toISOString(),
      clock_out_latitude: position.latitude,
      clock_out_longitude: position.longitude,
      status: "closed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", timeEntryId)
    .eq("driver_id", userId)
    .eq("status", "open")
    .select("*")
    .single();

  if (error) {
    throw new Error(`Unable to clock out: ${error.message}`);
  }

  return {
    timeEntry: data,
  };
}
