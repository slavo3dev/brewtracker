"use server";

import { revalidatePath } from "next/cache";

import { requireRouteManager } from "@/lib/auth/require-route-manager";

import {
  deleteRouteTemplateException,
  saveRouteTemplateException,
} from "@/lib/routes/route-template-exception-service";

export type RouteExceptionActionResult = {
  ok: boolean;
  message?: string;
};

function readRequiredString(formData: FormData, name: string): string {
  const value = formData.get(name);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

export async function saveRouteTemplateExceptionAction(
  _previousState: RouteExceptionActionResult,
  formData: FormData,
): Promise<RouteExceptionActionResult> {
  try {
    const profile = await requireRouteManager();

    const routeTemplateId = readRequiredString(formData, "routeTemplateId");

    const exceptionDate = readRequiredString(formData, "exceptionDate");

    const mode = readRequiredString(formData, "mode");

    if (mode !== "skip" && mode !== "driver") {
      throw new Error("Invalid route exception type.");
    }

    const overrideDriverValue = formData.get("overrideDriverId");

    const notesValue = formData.get("notes");

    const overrideDriverId =
      typeof overrideDriverValue === "string" && overrideDriverValue
        ? overrideDriverValue
        : null;

    const notes = typeof notesValue === "string" ? notesValue : null;

    if (mode === "driver" && !overrideDriverId) {
      throw new Error("Select the replacement driver.");
    }

    await saveRouteTemplateException({
      routeTemplateId,
      exceptionDate,
      isSkipped: mode === "skip",
      overrideDriverId,
      notes,
      createdBy: profile.id,
    });

    revalidatePath("/dashboard/routes");

    revalidatePath("/dashboard/routes/templates");

    return {
      ok: true,
      message: "Route exception saved.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save route exception.",
    };
  }
}

export async function deleteRouteTemplateExceptionAction(
  formData: FormData,
): Promise<void> {
  await requireRouteManager();

  const exceptionId = readRequiredString(formData, "exceptionId");

  await deleteRouteTemplateException(exceptionId);

  revalidatePath("/dashboard/routes");

  revalidatePath("/dashboard/routes/templates");
}
