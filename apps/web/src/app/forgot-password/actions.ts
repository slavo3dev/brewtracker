"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordResult = {
  error: string | null;
  success: string | null;
};

export async function requestPasswordReset(
  _prevState: ForgotPasswordResult,
  formData: FormData,
): Promise<ForgotPasswordResult> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return {
      error: "Enter your email address.",
      success: null,
    };
  }

  const headersList = await headers();
  const origin = headersList.get("origin") ?? "http://localhost:3000";

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password/update`,
  });

  if (error) {
    return {
      error: "Unable to send reset email. Try again.",
      success: null,
    };
  }

  return {
    error: null,
    success: "Check your email for a password reset link.",
  };
}