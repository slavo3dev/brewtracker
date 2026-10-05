"use server";

import { feetToMeters } from "@brewtracker/types";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateWarehouseGeofence } from "@/lib/warehouses/warehouse-service";

export async function updateWarehouseGeofenceAction(formData: FormData) {
  await requireAdmin();

  const warehouseId = String(formData.get("warehouseId") ?? "");
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));

  const radiusInput = formData.get("radiusFeet");
  const radiusFeet =
    typeof radiusInput === "string" && radiusInput.trim() !== ""
      ? Number(radiusInput)
      : NaN;

  if (!warehouseId) {
    throw new Error("Missing warehouse id.");
  }

  if (!Number.isFinite(radiusFeet) || radiusFeet <= 0) {
    throw new Error("Enter a valid geofence radius in feet.");
  }

  await updateWarehouseGeofence({
    warehouseId,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    geofenceRadiusMeters: feetToMeters(radiusFeet),
  });

  revalidatePath("/dashboard/inventory/warehouses");
}