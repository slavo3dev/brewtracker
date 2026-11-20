import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";
import { validateRestoredMultiMachineVisit } from "./state/multi-machine-visit.validation";

const STORAGE_KEY_PREFIX = "brewtracker:service-visit:v2";

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export async function saveMultiMachineServiceVisit(
  visit: MultiMachineServiceVisit,
): Promise<void> {
  await AsyncStorage.setItem(
    getStorageKey(visit.userId),
    JSON.stringify(visit),
  );
}

export async function loadMultiMachineServiceVisit(
  userId: string,
): Promise<MultiMachineServiceVisit | null> {
  const stored = await AsyncStorage.getItem(getStorageKey(userId));

  if (stored === null) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(stored);
  } catch {
    throw new Error(
      "Unable to read the saved service visit. Local data was preserved.",
    );
  }

  const visit = validateRestoredMultiMachineVisit(parsed, userId);

  if (!visit) {
    throw new Error(
      "Saved service visit is invalid. Local data was preserved.",
    );
  }

  return visit;
}

export async function removeMultiMachineServiceVisit(
  userId: string,
): Promise<void> {
  await AsyncStorage.removeItem(getStorageKey(userId));
}
