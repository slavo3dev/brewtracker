"use server";

import { revalidatePath } from "next/cache";

import { requireInventoryManager } from "@/lib/auth/require-inventory-manager";
import {
  createClient as createClientRecord,
  getClientById,
  updateClient as updateClientRecord,
  type CreateClientInput,
} from "@/lib/clients/client-service";
import { normalizeClientInput } from "@/lib/clients/client-validation";
import { notFound } from "next/navigation";

export async function createClientAction(
  input: CreateClientInput,
): Promise<{ id: string }> {
  const profile = await requireInventoryManager();

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid client data.");
  }

  if (typeof input.name !== "string") {
    throw new Error("Client name must be text.");
  }

  const name = input.name.trim();

  if (!name) {
    throw new Error("Client name is required.");
  }

  if (name.length > 200) {
    throw new Error("Client name must be 200 characters or fewer.");
  }

  if (input.business_type !== "ocs" && input.business_type !== "horeca") {
    throw new Error("Select a valid business type.");
  }

  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;

  if (
    (latitude !== null && typeof latitude !== "number") ||
    (longitude !== null && typeof longitude !== "number")
  ) {
    throw new Error("Latitude and longitude must be numbers.");
  }

  if ((latitude === null) !== (longitude === null)) {
    throw new Error(
      "Latitude and longitude must both be provided or both left empty.",
    );
  }

  if (
    latitude !== null &&
    (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
  ) {
    throw new Error("Latitude must be between -90 and 90.");
  }

  if (
    longitude !== null &&
    (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
  ) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  const radius = input.geofence_radius_meters ?? 100;

  if (typeof radius !== "number") {
    throw new Error("Geofence radius must be a number.");
  }

  if (!Number.isSafeInteger(radius) || radius <= 0) {
    throw new Error("Geofence radius must be a positive integer.");
  }

  const normalizedInput = normalizeClientInput({
    ...input,
    name,
    latitude,
    longitude,
    geofence_radius_meters: radius,
  });

  if (profile.role === "manager") {
    const managerRegion = profile.region?.trim();
    const clientRegion = normalizedInput.region?.trim();

    if (!managerRegion) {
      throw new Error(
        "Your account has no assigned region. Contact an administrator.",
      );
    }

    if (
      !clientRegion ||
      clientRegion.toLowerCase() !== managerRegion.toLowerCase()
    ) {
      throw new Error(
        `You can only create clients in your assigned region: ${managerRegion}.`,
      );
    }

    // Use the canonical region from the manager's profile.
    normalizedInput.region = managerRegion;
  }

  const client = await createClientRecord(normalizedInput);

  revalidatePath("/dashboard/clients");

  return { id: client.id };
}

export async function updateClientAction(
  clientId: string,
  input: CreateClientInput,
): Promise<{ id: string }> {
  const profile = await requireInventoryManager();

  if (typeof clientId !== "string" || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw new Error("Invalid client ID.");
  }

  const existingClient = await getClientById(clientId);

  if (!existingClient) {
    notFound();
  }

  if (profile.role === "manager") {
    const managerRegion = profile.region?.trim().toLowerCase();
    const existingRegion = existingClient.region?.trim().toLowerCase();

    if (!managerRegion || existingRegion !== managerRegion) {
      notFound();
    }
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid client data.");
  }

  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("Client name is required.");
  }

  if (input.name.trim().length > 200) {
    throw new Error("Client name must be 200 characters or fewer.");
  }

  if (input.business_type !== "ocs" && input.business_type !== "horeca") {
    throw new Error("Select a valid business type.");
  }

  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;

  if (
    (latitude !== null && typeof latitude !== "number") ||
    (longitude !== null && typeof longitude !== "number")
  ) {
    throw new Error("Latitude and longitude must be numbers.");
  }

  if ((latitude === null) !== (longitude === null)) {
    throw new Error(
      "Latitude and longitude must both be provided or both left empty.",
    );
  }

  if (
    latitude !== null &&
    (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
  ) {
    throw new Error("Latitude must be between -90 and 90.");
  }

  if (
    longitude !== null &&
    (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
  ) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  const radius = input.geofence_radius_meters ?? 100;

  if (
    typeof radius !== "number" ||
    !Number.isSafeInteger(radius) ||
    radius <= 0
  ) {
    throw new Error("Geofence radius must be a positive integer.");
  }

  const normalizedInput = normalizeClientInput({
    ...input,
    name: input.name.trim(),
    latitude,
    longitude,
    geofence_radius_meters: radius,
  });

  if (profile.role === "manager") {
    const managerRegion = profile.region!.trim();
    const requestedRegion = normalizedInput.region?.trim();

    if (
      !requestedRegion ||
      requestedRegion.toLowerCase() !== managerRegion.toLowerCase()
    ) {
      throw new Error(
        `You can only edit clients in your assigned region: ${managerRegion}.`,
      );
    }

    normalizedInput.region = managerRegion;
  }

  const updatedClient = await updateClientRecord(clientId, normalizedInput);

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/edit`);

  return { id: updatedClient.id };
}
