"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminApp } from "@brewtracker/types";

export type SignInResult = {
  error: string | null;
};

export async function signIn(
  _prevState: SignInResult,
  formData: FormData
): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "That email or password isn't right. Try again." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signOut();
    return { error: "Unable to load your session. Try again." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role, region, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();

    return {
      error: "Your user profile is missing. Contact your manager.",
    };
  }

  if (!canAccessAdminApp(profile)) {
    await supabase.auth.signOut();

    return {
      error: "This dashboard is only for managers and CEOs.",
    };
  }

  redirect(redirectTo || "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
