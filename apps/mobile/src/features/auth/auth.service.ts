import type { AuthUser } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";

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
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function getCurrentUserProfile(userId: string): Promise<AuthUser> {
  const { data, error } = await supabase
    .from("users")
    .select("id, role, region, is_active")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(`Unable to load user profile: ${error.message}`);
  }

  return data;
}
