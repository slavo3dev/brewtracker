import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { supabase } from "../../lib/supabase";
import {
  LOCATION_TRACKING_CONTEXT_KEY,
  LOCATION_TRACKING_TASK,
  LOCATION_UPDATE_DISTANCE_METERS,
  LOCATION_UPDATE_INTERVAL_MS,
} from "./location-tracking.constants";
import { flushLocationPingQueue } from "./location-ping.service";
import type {
  LocationTrackingContext,
  StartLocationTrackingInput,
} from "./location-tracking.types";

async function saveTrackingContext(
  context: LocationTrackingContext,
): Promise<void> {
  await AsyncStorage.setItem(
    LOCATION_TRACKING_CONTEXT_KEY,
    JSON.stringify(context),
  );
}

async function requestTrackingPermissions(): Promise<void> {
  const foregroundPermission =
    await Location.requestForegroundPermissionsAsync();

  if (foregroundPermission.status !== "granted") {
    throw new Error(
      "Location permission is required for live route tracking.",
    );
  }

  const backgroundPermission =
    await Location.requestBackgroundPermissionsAsync();

  if (backgroundPermission.status !== "granted") {
    throw new Error(
      "Background location permission is required while you are clocked in.",
    );
  }
}

export async function startLocationTracking({
  driverId,
  routeId,
  timeEntryId,
}: StartLocationTrackingInput): Promise<void> {
  await requestTrackingPermissions();

  const context: LocationTrackingContext = {
    driverId,
    routeId,
    timeEntryId,
  };

  await saveTrackingContext(context);

  const isRegistered =
    await TaskManager.isTaskRegisteredAsync(
      LOCATION_TRACKING_TASK,
    );

  if (isRegistered) {
    return;
  }

  await Location.startLocationUpdatesAsync(
    LOCATION_TRACKING_TASK,
    {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_UPDATE_INTERVAL_MS,
      distanceInterval: LOCATION_UPDATE_DISTANCE_METERS,
      deferredUpdatesInterval: LOCATION_UPDATE_INTERVAL_MS,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: "BrewTracker route tracking",
        notificationBody:
          "Your live location is being shared while you are clocked in.",
        notificationColor: "#7a3f2c",
      },
    },
  );
}

export async function stopLocationTracking(): Promise<void> {
  const isRegistered =
    await TaskManager.isTaskRegisteredAsync(
      LOCATION_TRACKING_TASK,
    );

  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(
      LOCATION_TRACKING_TASK,
    );
  }

  await AsyncStorage.removeItem(
    LOCATION_TRACKING_CONTEXT_KEY,
  );

  try {
    await flushLocationPingQueue();
  } catch (error) {
    console.warn(
      "Unable to flush pending location pings:",
      error,
    );
  }
}

export async function restoreLocationTracking(): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await stopLocationTracking();
    return;
  }

  const { data: openEntry, error: entryError } = await supabase
    .from("time_entries")
    .select("id, driver_id, route_id")
    .eq("driver_id", user.id)
    .in("status", ["open", "manager_override"])
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (entryError) {
    throw new Error(
      `Unable to restore route tracking: ${entryError.message}`,
    );
  }

  if (!openEntry) {
    await stopLocationTracking();
    return;
  }

  await startLocationTracking({
    driverId: openEntry.driver_id,
    routeId: openEntry.route_id,
    timeEntryId: openEntry.id,
  });

  try {
    await flushLocationPingQueue();
  } catch (error) {
    console.warn(
      "Pending location pings remain queued:",
      error,
    );
  }
}