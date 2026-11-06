import type { AuthUser } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";
import {
  beginProfileCacheRequest,
  isCurrentProfileCacheRequest,
  loadCachedProfile,
  removeCachedProfile,
  saveCachedProfile,
} from "./auth-profile-cache.service";

export type SignInCredentials = {
  email: string;
  password: string;
};

export async function signInWithEmailAndPassword({
  email,
  password,
}: SignInCredentials): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    console.error("Supabase login failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });

    throw error;
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export function isAuthNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error !== null &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "";

  const normalized = message.toLowerCase();

  return (
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network error") ||
    normalized.includes("unable to connect.")
  );
}

export async function getCurrentUserProfile(
  userId: string,
  { allowCached = true }: { allowCached?: boolean } = {},
): Promise<AuthUser> {
  const request = beginProfileCacheRequest(userId);

  function assertCurrentRequest(): void {
    if (!isCurrentProfileCacheRequest(request)) {
      throw new Error("The employee profile request was superseded.");
    }
  }

  let profile: AuthUser;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, role, region, is_active")
      .eq("id", userId)
      .single();

    if (error) {
      throw error;
    }

    if (!data || data.id !== userId) {
      throw new Error("Your employee profile could not be found.");
    }

    profile = data;
  } catch (error) {
    assertCurrentRequest();

    if (isAuthNetworkError(error)) {
      if (allowCached) {
        const cachedProfile = await loadCachedProfile(request);

        assertCurrentRequest();

        if (cachedProfile) {
          return cachedProfile;
        }
      }

      throw new Error(
        "Unable to connect. Check your internet connection and try again.",
      );
    }

    // Only this request may remove its user's cached profile.
    await removeCachedProfile(userId, request);

    assertCurrentRequest();

    throw new Error(
      "Unable to verify your employee profile. Try again or contact your manager.",
    );
  }

  assertCurrentRequest();

  await saveCachedProfile(profile, request);

  assertCurrentRequest();

  return profile;
}
