"use server";

import { revalidatePath } from "next/cache";
import { requireRouteManager } from "@/lib/auth/require-route-manager";
import {
  addRouteStop,
  createRoute,
  deleteRouteStop,
  updateStopSequence,
} from "@/lib/routes/route-service";
import type { RouteActionResult } from "./action-state";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function createRouteAction(
  _prevState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  const profile = await requireRouteManager();

  const driverId = String(formData.get("driverId") ?? "");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const routeDate = String(formData.get("routeDate") ?? "");
  const notes = optionalText(formData.get("notes"));

  if (!driverId || !warehouseId || !routeDate) {
    return {
      error: "Driver, warehouse and route date are required.",
      success: null,
    };
  }

  try {
    await createRoute({
      driverId,
      warehouseId,
      routeDate,
      createdBy: profile.id,
      notes,
    });

    revalidatePath("/dashboard/routes");

    return {
      error: null,
      success: "Route created.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create route.",
      success: null,
    };
  }
}

export async function addStopAction(
  _prevState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const routeId = String(formData.get("routeId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const machineId = optionalText(formData.get("machineId"));
  const scheduledStartAt = optionalText(formData.get("scheduledStartAt"));
  const scheduledEndAt = optionalText(formData.get("scheduledEndAt"));
  const notes = optionalText(formData.get("notes"));
  const drinkCountRequired = formData.get("drinkCountRequired") === "on";
  
  if (!routeId || !clientId) {
    return {
      error: "Route and client are required.",
      success: null,
    };
  }

  try {
    await addRouteStop({
      routeId,
      clientId,
      machineId,
      scheduledStartAt,
      scheduledEndAt,
      notes,
      drinkCountRequired,
    });

    revalidatePath("/dashboard/routes");

    return {
      error: null,
      success: "Stop added.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to add stop.",
      success: null,
    };
  }
}

export async function updateStopSequenceAction(
  _prevState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const stopId = String(formData.get("stopId") ?? "");
  const sequenceNumber = Number(formData.get("sequenceNumber"));

  if (!stopId || !Number.isFinite(sequenceNumber) || sequenceNumber < 1) {
    return {
      error: "Valid stop sequence is required.",
      success: null,
    };
  }

  try {
    await updateStopSequence({
      stopId,
      sequenceNumber,
    });

    revalidatePath("/dashboard/routes");

    return {
      error: null,
      success: "Stop order updated.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update stop order.",
      success: null,
    };
  }
}

export async function deleteStopAction(
  _prevState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const stopId = String(formData.get("stopId") ?? "");

  if (!stopId) {
    return {
      error: "Missing stop id.",
      success: null,
    };
  }

  try {
    await deleteRouteStop(stopId);

    revalidatePath("/dashboard/routes");

    return {
      error: null,
      success: "Stop removed.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to remove stop.",
      success: null,
    };
  }
}
