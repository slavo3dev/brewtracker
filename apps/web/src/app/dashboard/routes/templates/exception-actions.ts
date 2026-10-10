"use server";

import { revalidatePath } from "next/cache";

import { requireRouteManager } from "@/lib/auth/require-route-manager";

import {
  addRouteStopException,
  deleteRouteTemplateException,
  removeRouteStopException,
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

function readOptionalString(
  formData: FormData,
  name: string,
): string | null {
  const value = formData.get(name);

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue || null;
}

function revalidateRouteManagement(): void {
  revalidatePath("/dashboard/routes");
  revalidatePath("/dashboard/routes/templates");
}

export async function saveRouteTemplateExceptionAction(
  _previousState: RouteExceptionActionResult,
  formData: FormData,
): Promise<RouteExceptionActionResult> {
  try {
    const profile = await requireRouteManager();

    const routeTemplateId = readRequiredString(
      formData,
      "routeTemplateId",
    );

    const exceptionDate = readRequiredString(
      formData,
      "exceptionDate",
    );

    const mode = readRequiredString(formData, "mode");

    if (mode !== "skip" && mode !== "driver") {
      throw new Error("Invalid route exception type.");
    }

    const overrideDriverId = readOptionalString(
      formData,
      "overrideDriverId",
    );

    const notes = readOptionalString(formData, "notes");

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

    revalidateRouteManagement();

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

export async function addRouteStopExceptionAction(
  _previousState: RouteExceptionActionResult,
  formData: FormData,
): Promise<RouteExceptionActionResult> {
  try {
    const profile = await requireRouteManager();

    const routeTemplateId = readRequiredString(
      formData,
      "routeTemplateId",
    );

    const exceptionDate = readRequiredString(
      formData,
      "exceptionDate",
    );

    const clientId = readRequiredString(formData, "clientId");

    const machineId = readOptionalString(formData, "machineId");

    const scheduledStartTime = readOptionalString(
      formData,
      "scheduledStartTime",
    );

    const scheduledEndTime = readOptionalString(
      formData,
      "scheduledEndTime",
    );

    const notes = readOptionalString(formData, "notes");

    const drinkCountRequired =
      formData.get("drinkCountRequired") === "on";

    if (
      scheduledStartTime &&
      scheduledEndTime &&
      scheduledEndTime <= scheduledStartTime
    ) {
      throw new Error(
        "Scheduled end time must be later than scheduled start time.",
      );
    }

    await addRouteStopException({
      routeTemplateId,
      exceptionDate,
      clientId,
      machineId,
      scheduledStartTime,
      scheduledEndTime,
      drinkCountRequired,
      notes,
      createdBy: profile.id,
    });

    revalidateRouteManagement();

    return {
      ok: true,
      message: "One-off stop added.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to add one-off stop.",
    };
  }
}

export async function removeRouteStopExceptionAction(
  _previousState: RouteExceptionActionResult,
  formData: FormData,
): Promise<RouteExceptionActionResult> {
  try {
    const profile = await requireRouteManager();

    const routeTemplateId = readRequiredString(
      formData,
      "routeTemplateId",
    );

    const exceptionDate = readRequiredString(
      formData,
      "exceptionDate",
    );

    const routeTemplateStopId = readRequiredString(
      formData,
      "routeTemplateStopId",
    );

    const notes = readOptionalString(formData, "notes");

    await removeRouteStopException({
      routeTemplateId,
      exceptionDate,
      routeTemplateStopId,
      notes,
      createdBy: profile.id,
    });

    revalidateRouteManagement();

    return {
      ok: true,
      message: "Recurring stop removed for this date.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to remove recurring stop.",
    };
  }
}

export async function deleteRouteTemplateExceptionAction(
  formData: FormData,
): Promise<void> {
  await requireRouteManager();

  const exceptionId = readRequiredString(formData, "exceptionId");

  await deleteRouteTemplateException(exceptionId);

  revalidateRouteManagement();
}