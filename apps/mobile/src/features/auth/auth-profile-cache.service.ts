import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthUser } from "@brewtracker/types";

function getCacheKey(userId: string): string {
  return `brewtracker:auth-profile:v1:${userId}`;
}

export async function saveCachedProfile(profile: AuthUser): Promise<void> {
  try {
    await AsyncStorage.setItem(
      getCacheKey(profile.id),
      JSON.stringify(profile),
    );
  } catch (error) {
    console.warn("Unable to cache employee profile:", error);
  }
}

export async function loadCachedProfile(
  userId: string,
): Promise<AuthUser | null> {
  try {
    const stored = await AsyncStorage.getItem(getCacheKey(userId));

    if (!stored) {
      return null;
    }

    const profile = JSON.parse(stored) as AuthUser;

    if (
      !profile ||
      profile.id !== userId ||
      !["driver", "tech", "manager", "ceo"].includes(profile.role) ||
      typeof profile.is_active !== "boolean" ||
      (profile.region !== null && typeof profile.region !== "string")
    ) {
      return null;
    }

    return profile;
  } catch (error) {
    console.warn("Unable to restore employee profile:", error);
    return null;
  }
}

export async function removeCachedProfile(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(getCacheKey(userId));
  } catch (error) {
    console.warn("Unable to remove cached employee profile:", error);
  }
}