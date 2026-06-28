import type { AppRole, Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export type CreateUserInput = {
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  region?: string | null;
  role: AppRole;
};

export type UpdateUserInput = {
  userId: string;
  fullName?: string;
  phone?: string | null;
  address?: string | null;
  region?: string | null;
  role?: AppRole;
  isActive?: boolean;
};

export async function getAppUsers(): Promise<UserRow[]> {
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createAppUser(input: CreateUserInput) {
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    phone: input.phone ?? undefined,
    user_metadata: {
      full_name: input.fullName,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create auth user.");
  }

  const { error: profileError } = await adminSupabase.from("users").upsert({
    id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    address: input.address ?? null,
    region: input.region ?? null,
    role: input.role,
    is_active: true,
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  return data.user;
}

export async function updateAppUser(input: UpdateUserInput) {
  const adminSupabase = createAdminClient();

  const updatePayload: UserUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (input.fullName !== undefined) updatePayload.full_name = input.fullName;
  if (input.phone !== undefined) updatePayload.phone = input.phone;
  if (input.address !== undefined) updatePayload.address = input.address;
  if (input.region !== undefined) updatePayload.region = input.region;
  if (input.role !== undefined) updatePayload.role = input.role;
  if (input.isActive !== undefined) updatePayload.is_active = input.isActive;

  const { error } = await adminSupabase
    .from("users")
    .update(updatePayload)
    .eq("id", input.userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendAppUserPasswordReset(email: string, origin: string) {
  const adminSupabase = createAdminClient();

  const { error } = await adminSupabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password/update`,
  });

  if (error) {
    throw new Error(error.message);
  }
}
