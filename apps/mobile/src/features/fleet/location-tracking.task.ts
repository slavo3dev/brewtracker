import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import {
  LOCATION_TRACKING_CONTEXT_KEY,
  LOCATION_TRACKING_TASK,
} from "./location-tracking.constants";
import { uploadOrQueueLocationPing } from "./location-ping.service";
import type { LocationTrackingContext } from "./location-tracking.types";

type BackgroundLocationData = {
  locations: Location.LocationObject[];
};

async function loadTrackingContext(): Promise<LocationTrackingContext | null> {
  const storedValue = await AsyncStorage.getItem(
    LOCATION_TRACKING_CONTEXT_KEY,
  );

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as LocationTrackingContext;
  } catch {
    return null;
  }
}

TaskManager.defineTask<BackgroundLocationData>(
  LOCATION_TRACKING_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn(
        "Background location task reported an error:",
        error.message,
      );
      return;
    }

    if (!data?.locations?.length) {
      return;
    }

    const context = await loadTrackingContext();

    if (!context) {
      return;
    }

    for (const location of data.locations) {
      await uploadOrQueueLocationPing(location, context);
    }
  },
);