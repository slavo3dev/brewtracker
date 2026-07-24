import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ServiceVisit } from "./service-visit.types";

const STORAGE_KEY_PREFIX = "brewtracker:service-visit:v1";

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export async function saveServiceVisit(
  visit: ServiceVisit,
): Promise<void> {
  await AsyncStorage.setItem(
    getStorageKey(visit.userId),
    JSON.stringify(visit),
  );
}

export async function loadServiceVisit(
  userId: string,
): Promise<ServiceVisit | null> {
  const storedValue = await AsyncStorage.getItem(
    getStorageKey(userId),
  );

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as ServiceVisit;
  } catch {
    await AsyncStorage.removeItem(getStorageKey(userId));
    return null;
  }
}

export async function removeServiceVisit(
  userId: string,
): Promise<void> {
  await AsyncStorage.removeItem(getStorageKey(userId));
}