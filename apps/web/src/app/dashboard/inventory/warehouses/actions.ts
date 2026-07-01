"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateWarehouseGeofence } from "@/lib/warehouses/warehouse-service";

export async function updateWarehouseGeofenceAction(formData: FormData) {
  await requireAdmin();

  const warehouseId = String(formData.get("warehouseId") ?? "");
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const radius = Number(formData.get("radius"));

  if (!warehouseId) {
    throw new Error("Missing warehouse id.");
  }

  await updateWarehouseGeofence({
    warehouseId,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    geofenceRadiusMeters: Number.isFinite(radius) ? radius : 150,
  });

  revalidatePath("/dashboard/inventory/warehouses");
}