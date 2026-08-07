export type LocationTrackingContext = {
  driverId: string;
  routeId: string | null;
  timeEntryId: string;
};

export type QueuedLocationPing = {
  driver_id: string;
  route_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  heading: number | null;
  speed_meters_per_second: number | null;
  recorded_at: string;
};

export type StartLocationTrackingInput = {
  driverId: string;
  routeId: string | null;
  timeEntryId: string;
};