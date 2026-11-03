import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TimeEntry } from "./time-clock.types";

type ShiftSnapshot = {
  entry: TimeEntry | null;
};

function getCacheKey(userId: string): string {
  return `brewtracker:open-shift:v1:${userId}`;
}

export async function saveShiftSnapshot(
  userId: string,
  entry: TimeEntry | null,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      getCacheKey(userId),
      JSON.stringify({ entry }),
    );
  } catch (error) {
    console.warn("Unable to cache shift state:", error);
  }
}

export async function loadShiftSnapshot(
  userId: string,
): Promise<ShiftSnapshot | null> {
  try {
    const stored = await AsyncStorage.getItem(getCacheKey(userId));

    if (!stored) {
      return null;
    }

    const snapshot = JSON.parse(stored) as ShiftSnapshot;

    if (
      !snapshot ||
      !Object.prototype.hasOwnProperty.call(snapshot, "entry")
    ) {
      return null;
    }

    if (snapshot.entry !== null) {
      const entry = snapshot.entry;

      if (
        entry.driver_id !== userId ||
        typeof entry.id !== "string" ||
        typeof entry.clock_in_at !== "string" ||
        !["open", "manager_override"].includes(entry.status) ||
        !["required", "missing", "uploaded", "waived"].includes(
          entry.selfie_status,
        )
      ) {
        return null;
      }
    }

    return snapshot;
  } catch (error) {
    console.warn("Unable to restore cached shift:", error);
    return null;
  }
}