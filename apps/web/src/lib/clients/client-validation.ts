import type { CreateClientInput } from "./client-service";

function optionalText(
  value: unknown,
  field: string,
  maxLength = 255,
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${field} must be text.`);
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }

  return normalized || null;
}

function optionalEmail(value: unknown, field: string): string | null {
  const email = optionalText(value, field, 254);

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${field} must be a valid email address.`);
  }

  return email;
}

export function normalizeClientInput(
  input: CreateClientInput,
): CreateClientInput {
  return {
    name: input.name.trim(),
    business_type: input.business_type,
    latitude: input.latitude,
    longitude: input.longitude,
    geofence_radius_meters: input.geofence_radius_meters,
    address: optionalText(input.address, "Address"),
    city: optionalText(input.city, "City", 100),
    region: optionalText(input.region, "Region", 100),
    contact_name: optionalText(input.contact_name, "Contact name"),
    contact_email: optionalEmail(input.contact_email, "Contact email"),
    contact_phone: optionalText(input.contact_phone, "Contact phone", 50),
    service_email: optionalEmail(input.service_email, "Service email"),
  };
}
