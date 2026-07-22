import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TodayRouteSnapshot } from "./route.types";

const ROUTE_CACHE_PREFIX = "@brewtracker/today-route";

function createCacheKey(userId: string, routeDate: string): string {
  return `${ROUTE_CACHE_PREFIX}:${userId}:${routeDate}`;
}

export async function saveTodayRouteSnapshot(
  snapshot: TodayRouteSnapshot,
): Promise<void> {
  const key = createCacheKey(snapshot.userId, snapshot.routeDate);

  await AsyncStorage.setItem(key, JSON.stringify(snapshot));
}

export async function readTodayRouteSnapshot(
  userId: string,
  routeDate: string,
): Promise<TodayRouteSnapshot | null> {
  const key = createCacheKey(userId, routeDate);
  const storedValue = await AsyncStorage.getItem(key);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as TodayRouteSnapshot;

    if (parsedValue.userId !== userId || parsedValue.routeDate !== routeDate) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    return parsedValue;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function clearTodayRouteSnapshot(
  userId: string,
  routeDate: string,
): Promise<void> {
  const key = createCacheKey(userId, routeDate);

  await AsyncStorage.removeItem(key);
}
