import type { Database } from "@brewtracker/types";
import { createClient } from "@/lib/supabase/server";

export type CurrentUserProfile =
  Database["public"]["Tables"]["users"]["Row"];

export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, full_name, email, phone, role, region, is_active")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile;
}