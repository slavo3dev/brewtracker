"use server";

import type { AppRole } from "@brewtracker/types";
import type { UserActionResult } from "./action-state";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUserManager } from "@/lib/auth/require-user-manager";
import {
  createAppUser,
  sendAppUserPasswordReset,
  updateAppUser,
} from "@/lib/users/user-service";

function parseRole(value: FormDataEntryValue | null): AppRole {
  const role = String(value ?? "driver");

  if (
    role === "driver" ||
    role === "tech" ||
    role === "manager" ||
    role === "ceo"
  ) {
    return role;
  }

  return "driver";
}

function parseOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parsePhone(value: FormDataEntryValue | null): {
  value: string | null;
  error: string | null;
} {
  const phone = parseOptionalText(value);

  if (!phone) {
    return { value: null, error: null };
  }

  const isValid = /^\+?[1-9]\d{7,14}$/.test(phone);

  if (!isValid) {
    return {
      value: null,
      error:
        "Phone number must be in international format, for example +381641234567.",
    };
  }

  return { value: phone, error: null };
}

async function getOrigin() {
  const headersList = await headers();
  return headersList.get("origin") ?? "http://localhost:3000";
}

export async function createUser(
  _prevState: UserActionResult,
  formData: FormData,
): Promise<UserActionResult> {
  await requireUserManager();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = parsePhone(formData.get("phone"));
  const address = parseOptionalText(formData.get("address"));
  const region = parseOptionalText(formData.get("region"));
  const role = parseRole(formData.get("role"));

  if (!fullName || !email) {
    return {
      error: "Full name and email are required.",
      success: null,
    };
  }

  if (phone.error) {
    return {
      error: phone.error,
      success: null,
    };
  }

  try {
    await createAppUser({
      fullName,
      email,
      phone: phone.value,
      address,
      region,
      role,
    });

    await sendAppUserPasswordReset(email, await getOrigin());

    revalidatePath("/dashboard/users");

    return {
      error: null,
      success: "User created and password setup email sent.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to create user. Try again.",
      success: null,
    };
  }
}

export async function updateUser(
  _prevState: UserActionResult,
  formData: FormData,
): Promise<UserActionResult> {
  await requireUserManager();

  const userId = String(formData.get("userId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = parsePhone(formData.get("phone"));
  const address = parseOptionalText(formData.get("address"));
  const region = parseOptionalText(formData.get("region"));
  const role = parseRole(formData.get("role"));

  if (!userId) {
    return {
      error: "Missing user id.",
      success: null,
    };
  }

  if (!fullName) {
    return {
      error: "Full name is required.",
      success: null,
    };
  }

  if (phone.error) {
    return {
      error: phone.error,
      success: null,
    };
  }

  try {
    await updateAppUser({
      userId,
      fullName,
      phone: phone.value,
      address,
      region,
      role,
    });

    revalidatePath("/dashboard/users");

    return {
      error: null,
      success: "User updated.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update user. Try again.",
      success: null,
    };
  }
}

export async function updateUserStatus(
  _prevState: UserActionResult,
  formData: FormData,
): Promise<UserActionResult> {
  await requireUserManager();

  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive")) === "true";

  if (!userId) {
    return {
      error: "Missing user id.",
      success: null,
    };
  }

  try {
    await updateAppUser({
      userId,
      isActive,
    });

    revalidatePath("/dashboard/users");

    return {
      error: null,
      success: isActive ? "User activated." : "User deactivated.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update user status.",
      success: null,
    };
  }
}

export async function sendPasswordReset(
  _prevState: UserActionResult,
  formData: FormData,
): Promise<UserActionResult> {
  await requireUserManager();

  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return {
      error: "Missing email.",
      success: null,
    };
  }

  try {
    await sendAppUserPasswordReset(email, await getOrigin());

    revalidatePath("/dashboard/users");

    return {
      error: null,
      success: "Password reset email sent.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send password reset email.",
      success: null,
    };
  }
}
