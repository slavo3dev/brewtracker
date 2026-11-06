import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthUser } from "@brewtracker/types";

export type ProfileCacheRequest = {
  userId: string;
  token: symbol;
};

const currentRequests = new Map<string, symbol>();
const storageQueues = new Map<string, Promise<void>>();

function getCacheKey(userId: string): string {
  return `brewtracker:auth-profile:v1:${userId}`;
}

export function beginProfileCacheRequest(userId: string): ProfileCacheRequest {
  const token = Symbol(userId);

  currentRequests.set(userId, token);

  return { userId, token };
}

export function isCurrentProfileCacheRequest(
  request: ProfileCacheRequest,
): boolean {
  return currentRequests.get(request.userId) === request.token;
}

function enqueueStorage<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = storageQueues.get(userId) ?? Promise.resolve();

  const result = previous.then(operation);

  // A failed operation must not block subsequent saves/removals.
  const tail = result.then(
    () => undefined,
    () => undefined,
  );

  storageQueues.set(userId, tail);

  void tail.then(() => {
    if (storageQueues.get(userId) === tail) {
      storageQueues.delete(userId);
    }
  });

  return result;
}

export async function saveCachedProfile(
  profile: AuthUser,
  request: ProfileCacheRequest,
): Promise<void> {
  if (profile.id !== request.userId) {
    throw new Error("Profile cache user mismatch.");
  }

  try {
    await enqueueStorage(request.userId, async () => {
      if (!isCurrentProfileCacheRequest(request)) {
        return;
      }

      await AsyncStorage.setItem(
        getCacheKey(request.userId),
        JSON.stringify(profile),
      );
    });
  } catch (error) {
    console.warn("Unable to cache employee profile:", error);
  }
}

export async function loadCachedProfile(
  request: ProfileCacheRequest,
): Promise<AuthUser | null> {
  try {
    return await enqueueStorage(request.userId, async () => {
      if (!isCurrentProfileCacheRequest(request)) {
        return null;
      }

      const stored = await AsyncStorage.getItem(getCacheKey(request.userId));

      if (!stored || !isCurrentProfileCacheRequest(request)) {
        return null;
      }

      const profile = JSON.parse(stored) as AuthUser;

      if (
        !profile ||
        profile.id !== request.userId ||
        !["driver", "tech", "manager", "ceo"].includes(profile.role) ||
        typeof profile.is_active !== "boolean" ||
        (profile.region !== null && typeof profile.region !== "string")
      ) {
        return null;
      }

      return profile;
    });
  } catch (error) {
    console.warn("Unable to restore employee profile:", error);
    return null;
  }
}

export async function removeCachedProfile(
  userId: string,
  request?: ProfileCacheRequest,
): Promise<void> {
  // Without a request, invalidate older requests immediately.
  // Explicit sign-out uses this path.
  const owner = request ?? beginProfileCacheRequest(userId);

  if (owner.userId !== userId) {
    throw new Error("Profile cache user mismatch.");
  }

  await enqueueStorage(userId, async () => {
    if (!isCurrentProfileCacheRequest(owner)) {
      return;
    }

    await AsyncStorage.removeItem(getCacheKey(userId));
  });
}
