"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: "Unable to update password. Try the reset link again." };
  }

  await supabase.auth.signOut();

  redirect("/login");
}