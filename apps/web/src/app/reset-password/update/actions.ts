"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export type UpdatePasswordResult = {
  error: string | null;
};

export async function updatePassword(
  _prevState: UpdatePasswordResult,
  formData: FormData,
): Promise<UpdatePasswordResult> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const cookieStore = await cookies();
  const tokenHash = cookieStore.get("password-recovery-token")?.value;

  if (!tokenHash) {
    return {
      error: "Open a fresh password setup or reset link from your email.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return { error: "Password setup is unavailable. Contact your manager." };
  }

  // Isolated client: never reads the browser's admin session.
  const recoverySupabase = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: recovery, error: recoveryError } =
    await recoverySupabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

  cookieStore.delete("password-recovery-token");

  if (recoveryError || !recovery.user || !recovery.session) {
    return {
      error: "This link is invalid or expired. Request a fresh reset link.",
    };
  }

  // This client now holds only the session returned by verification.
  const { error: updateError } = await recoverySupabase.auth.updateUser({
    password,
  });

  // End the temporary recovery session, preserving other sessions.
  await recoverySupabase.auth.signOut({ scope: "local" });

  if (updateError) {
    return {
      error:
        "Password could not be updated. Request a fresh link and try again.",
    };
  }

  redirect("/reset-password/success");
}
