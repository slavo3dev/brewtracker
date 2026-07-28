import type { Database } from "@brewtracker/types";

export type RouteStatus = Database["public"]["Enums"]["route_status"];

export type StopStatus = Database["public"]["Enums"]["stop_status"];

export type TodayRouteStop = {
  id: string;
  clientId: string;
  machineId: string | null;
  sequenceNumber: number;
  status: StopStatus;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  skippedReason: string | null;
  notes: string | null;

  client: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    geofenceRadiusMeters: number;
  };

  machine: {
    id: string;
    name: string | null;
    model: string | null;
    serialNumber: string | null;
    qrCode: string | null;
    status: Database["public"]["Enums"]["machine_status"];
    installedAt: string | null;
    lastServiceAt: string | null;
  } | null;
};

export type TodayRoute = {
  id: string;
  routeDate: string;
  status: RouteStatus;
  notes: string | null;

  warehouse: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
  } | null;

  stops: TodayRouteStop[];
};

export type TodayRouteSnapshot = {
  userId: string;
  routeDate: string;
  route: TodayRoute | null;
  syncedAt: string;
};

export type RouteDataSource = "network" | "cache" | null;
