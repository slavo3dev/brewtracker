import AsyncStorage from "@react-native-async-storage/async-storage";
import type * as Location from "expo-location";

import { supabase } from "../../lib/supabase";
import {
  LOCATION_PING_QUEUE_KEY,
  MAX_QUEUED_LOCATION_PINGS,
} from "./location-tracking.constants";
import type {
  LocationTrackingContext,
  QueuedLocationPing,
} from "./location-tracking.types";

function createPing(
  location: Location.LocationObject,
  context: LocationTrackingContext,
): QueuedLocationPing {
  return {
    driver_id: context.driverId,
    route_id: context.routeId,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy_meters: location.coords.accuracy,
    heading:
      location.coords.heading != null && location.coords.heading >= 0
        ? location.coords.heading
        : null,
    speed_meters_per_second:
      location.coords.speed != null && location.coords.speed >= 0
        ? location.coords.speed
        : null,
    recorded_at: new Date(location.timestamp).toISOString(),
  };
}

async function loadQueuedPings(): Promise<QueuedLocationPing[]> {
  const storedValue = await AsyncStorage.getItem(
    LOCATION_PING_QUEUE_KEY,
  );

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    return Array.isArray(parsedValue)
      ? (parsedValue as QueuedLocationPing[])
      : [];
  } catch {
    return [];
  }
}

async function saveQueuedPings(
  pings: QueuedLocationPing[],
): Promise<void> {
  if (pings.length === 0) {
    await AsyncStorage.removeItem(LOCATION_PING_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(
    LOCATION_PING_QUEUE_KEY,
    JSON.stringify(pings.slice(-MAX_QUEUED_LOCATION_PINGS)),
  );
}

async function insertPings(
  pings: QueuedLocationPing[],
): Promise<void> {
  if (pings.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("location_pings")
    .insert(pings);

  if (error) {
    throw new Error(
      `Unable to upload location pings: ${error.message}`,
    );
  }
}

export async function queueLocationPing(
  location: Location.LocationObject,
  context: LocationTrackingContext,
): Promise<void> {
  const existingPings = await loadQueuedPings();
  const nextPing = createPing(location, context);

  await saveQueuedPings([...existingPings, nextPing]);
}

export async function flushLocationPingQueue(): Promise<void> {
  const queuedPings = await loadQueuedPings();

  if (queuedPings.length === 0) {
    return;
  }

  await insertPings(queuedPings);
  await saveQueuedPings([]);
}

export async function uploadOrQueueLocationPing(
  location: Location.LocationObject,
  context: LocationTrackingContext,
): Promise<void> {
  try {
    await flushLocationPingQueue();
    await insertPings([createPing(location, context)]);
  } catch (error) {
    console.warn(
      "Location ping upload failed; preserving it locally:",
      error,
    );

    await queueLocationPing(location, context);
  }
}

export async function clearLocationPingQueue(): Promise<void> {
  await AsyncStorage.removeItem(LOCATION_PING_QUEUE_KEY);
}