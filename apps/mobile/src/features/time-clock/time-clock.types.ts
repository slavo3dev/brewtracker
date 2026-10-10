import type { Database, GeofenceTarget, GeoPoint } from "@brewtracker/types";

export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export type ClockTargetKind = "warehouse" | "scheduled_stop";

export type ClockTarget = GeofenceTarget & {
  kind: ClockTargetKind;
  routeId: string;
  warehouseId: string | null;
  stopId: string | null;
};

export type ClockContext = {
  routeId: string | null;
  routeDate: string | null;
  targets: ClockTarget[];
};

export type CreateClockInInput = {
  position: GeoPoint;
  target: ClockTarget;
};

export type ClockInResult = {
  timeEntry: TimeEntry;
};

export type ClockOutResult = {
  timeEntry: TimeEntry;
};

export function requiresClockInSelfie(entry: TimeEntry): boolean {
  return (
    entry.selfie_status === "required" || entry.selfie_status === "missing"
  );
}

export function hasCompletedClockInSelfie(entry: TimeEntry): boolean {
  return entry.selfie_status === "uploaded" || entry.selfie_status === "waived";
}
