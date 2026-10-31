"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClientAction, updateClientAction } from "./client-actions";
import type { Client } from "@/lib/clients/client-service";

type Props = {
  client?: Client;
};

export function CreateClientForm({ client }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    const latitude = String(formData.get("latitude") ?? "").trim();
    const longitude = String(formData.get("longitude") ?? "").trim();

    startTransition(async () => {
      try {
        const payload = {
          name: String(formData.get("name") ?? ""),
          business_type: String(formData.get("business_type") ?? "ocs") as
            | "ocs"
            | "horeca",
          address: String(formData.get("address") ?? "").trim() || null,
          city: String(formData.get("city") ?? "").trim() || null,
          region: String(formData.get("region") ?? "").trim() || null,
          contact_name:
            String(formData.get("contact_name") ?? "").trim() || null,
          contact_email:
            String(formData.get("contact_email") ?? "").trim() || null,
          contact_phone:
            String(formData.get("contact_phone") ?? "").trim() || null,
          service_email:
            String(formData.get("service_email") ?? "").trim() || null,
          latitude: latitude === "" ? null : Number(latitude),
          longitude: longitude === "" ? null : Number(longitude),
          geofence_radius_meters: Number(
            formData.get("geofence_radius_meters") ?? 100,
          ),
        } as const;

        const result = client
          ? await updateClientAction(client.id, payload)
          : await createClientAction(payload);

        router.push(`/dashboard/clients/${result.id}`);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : client
              ? "Unable to update client."
              : "Unable to create client.",
        );
      }
    });
  }

  const inputClass =
    "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Client name *</span>
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={client?.name ?? ""}
            className={inputClass}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span>Business type *</span>
          <select
            name="business_type"
            defaultValue={client?.business_type ?? "ocs"}
            className={inputClass}
          >
            <option value="ocs">OCS</option>
            <option value="horeca">HORECA</option>
          </select>
        </label>

        {[
          ["address", "Address"],
          ["city", "City"],
          ["region", "Region"],
          ["contact_name", "Contact name"],
          ["contact_email", "Contact email"],
          ["contact_phone", "Contact phone"],
          ["service_email", "Service email"],
        ].map(([name, label]) => (
          <label key={name} className="space-y-1 text-sm">
            <span>{label}</span>
            <input
              name={name}
              type={name.includes("email") ? "email" : "text"}
              defaultValue={
                client ? String(client[name as keyof Client] ?? "") : ""
              }
              className={inputClass}
            />
          </label>
        ))}
      </div>

      <fieldset className="space-y-4 rounded-xl border border-latte-200 p-4">
        <legend className="px-2 font-semibold text-espresso-950">
          GPS location and geofence
        </legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span>Latitude</span>
            <input
              name="latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              className={inputClass}
              defaultValue={client?.latitude ?? ""}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span>Longitude</span>
            <input
              name="longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              className={inputClass}
              defaultValue={client?.longitude ?? ""}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span>Geofence radius (meters)</span>
            <input
              name="geofence_radius_meters"
              type="number"
              min={1}
              step={1}
              defaultValue={client?.geofence_radius_meters ?? 100}
              required
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-espresso-950 px-6 py-3 text-sm font-medium text-crema-50 transition hover:bg-copper-600 disabled:opacity-50"
      >
        {isPending
          ? client
            ? "Saving changes..."
            : "Creating client..."
          : client
            ? "Save Changes"
            : "Create Client"}
      </button>
    </form>
  );
}
