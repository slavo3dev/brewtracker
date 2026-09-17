"use client";

import { useActionState } from "react";

import type { Database } from "@brewtracker/types";

import type { RouteTemplate } from "@/lib/routes/route-template-service";

import { updateRouteTemplateAction } from "../template-actions";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type WarehouseRow = Database["public"]["Tables"]["warehouses"]["Row"];

type Driver = Pick<UserRow, "id" | "full_name" | "email" | "region">;

type Warehouse = Pick<WarehouseRow, "id" | "name" | "city" | "region">;

type Props = {
  template: RouteTemplate;
  drivers: Driver[];
  warehouses: Warehouse[];
};

const initialState = {
  error: null,
  success: null,
};

const weekdays = [
  { name: "monday", label: "Mon" },
  { name: "tuesday", label: "Tue" },
  { name: "wednesday", label: "Wed" },
  { name: "thursday", label: "Thu" },
  { name: "friday", label: "Fri" },
  { name: "saturday", label: "Sat" },
  { name: "sunday", label: "Sun" },
] as const;

export function EditTemplateForm({ template, drivers, warehouses }: Props) {
  const [state, formAction, pending] = useActionState(
    updateRouteTemplateAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="templateId" value={template.id} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <label
            htmlFor={`name-${template.id}`}
            className="text-sm font-medium text-espresso-800"
          >
            Template name
          </label>

          <input
            id={`name-${template.id}`}
            name="name"
            type="text"
            required
            disabled={pending}
            defaultValue={template.name}
            className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor={`driver-${template.id}`}
            className="text-sm font-medium text-espresso-800"
          >
            Driver
          </label>

          <select
            id={`driver-${template.id}`}
            name="driverId"
            required
            disabled={pending}
            defaultValue={template.driver_id}
            className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
          >
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.full_name}
                {driver.region ? ` · ${driver.region}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`warehouse-${template.id}`}
            className="text-sm font-medium text-espresso-800"
          >
            Warehouse
          </label>

          <select
            id={`warehouse-${template.id}`}
            name="warehouseId"
            required
            disabled={pending}
            defaultValue={template.warehouse_id}
            className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
                {warehouse.city ? ` · ${warehouse.city}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-espresso-800">
          Service days
        </legend>

        <div className="mt-3 flex flex-wrap gap-2">
          {weekdays.map((day) => (
            <label key={day.name} className="cursor-pointer">
              <input
                type="checkbox"
                name={day.name}
                defaultChecked={template[day.name]}
                disabled={pending}
                className="peer sr-only"
              />

              <span className="inline-flex min-w-12 items-center justify-center rounded-xl border border-latte-200 bg-white px-3 py-2 text-sm font-medium text-steam-400 transition peer-checked:border-copper-500 peer-checked:bg-copper-50 peer-checked:text-copper-700 peer-disabled:opacity-60">
                {day.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor={`notes-${template.id}`}
          className="text-sm font-medium text-espresso-800"
        >
          Notes
        </label>

        <textarea
          id={`notes-${template.id}`}
          name="notes"
          rows={2}
          disabled={pending}
          defaultValue={template.notes ?? ""}
          className="mt-2 w-full resize-y rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p role="status" className="text-sm text-green-700">
          {state.success}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-latte-200 bg-white px-4 py-2 text-sm font-medium text-espresso-800 transition hover:bg-latte-50 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
