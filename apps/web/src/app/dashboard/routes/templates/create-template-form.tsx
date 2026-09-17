"use client";

import { useActionState, useEffect, useRef } from "react";

import type { Database } from "@brewtracker/types";

import { createRouteTemplateAction } from "../template-actions";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type WarehouseRow = Database["public"]["Tables"]["warehouses"]["Row"];

type Driver = Pick<UserRow, "id" | "full_name" | "email" | "region">;

type Warehouse = Pick<WarehouseRow, "id" | "name" | "city" | "region">;

type Props = {
  drivers: Driver[];
  warehouses: Warehouse[];
};

const initialState = {
  error: null,
  success: null,
};

const weekdays = [
  {
    name: "monday",
    label: "Mon",
  },
  {
    name: "tuesday",
    label: "Tue",
  },
  {
    name: "wednesday",
    label: "Wed",
  },
  {
    name: "thursday",
    label: "Thu",
  },
  {
    name: "friday",
    label: "Fri",
  },
  {
    name: "saturday",
    label: "Sat",
  },
  {
    name: "sunday",
    label: "Sun",
  },
] as const;

export function CreateTemplateForm({ drivers, warehouses }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    createRouteTemplateAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <div className="rounded-2xl border border-latte-200 bg-crema-0 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold text-espresso-950">
          Create route template
        </h2>

        <p className="mt-1 max-w-2xl text-sm leading-6 text-steam-400">
          Configure a recurring driver schedule. New templates remain inactive
          until at least one stop has been added.
        </p>
      </div>

      <form ref={formRef} action={formAction} className="mt-6 space-y-6">
        <div className="grid gap-5 lg:grid-cols-3">
          <div>
            <label
              htmlFor="template-name"
              className="text-sm font-medium text-espresso-800"
            >
              Template name
            </label>

            <input
              id="template-name"
              name="name"
              type="text"
              required
              disabled={pending}
              placeholder="Marko - Daily Route"
              className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition placeholder:text-steam-300 focus:border-copper-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="template-driver"
              className="text-sm font-medium text-espresso-800"
            >
              Driver
            </label>

            <select
              id="template-driver"
              name="driverId"
              required
              disabled={pending}
              defaultValue=""
              className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="" disabled>
                Select driver
              </option>

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
              htmlFor="template-warehouse"
              className="text-sm font-medium text-espresso-800"
            >
              Warehouse
            </label>

            <select
              id="template-warehouse"
              name="warehouseId"
              required
              disabled={pending}
              defaultValue=""
              className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="" disabled>
                Select warehouse
              </option>

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

          <p className="mt-1 text-sm text-steam-400">
            Select the weekdays when this recurring route should normally run.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {weekdays.map((day) => (
              <label key={day.name} className="cursor-pointer">
                <input
                  type="checkbox"
                  name={day.name}
                  disabled={pending}
                  className="peer sr-only"
                />

                <span className="inline-flex min-w-12 items-center justify-center rounded-xl border border-latte-200 bg-white px-3 py-2 text-sm font-medium text-steam-400 transition peer-checked:border-copper-500 peer-checked:bg-copper-50 peer-checked:text-copper-700 peer-focus-visible:ring-2 peer-focus-visible:ring-copper-500 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                  {day.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="template-notes"
            className="text-sm font-medium text-espresso-800"
          >
            Notes
          </label>

          <textarea
            id="template-notes"
            name="notes"
            rows={3}
            disabled={pending}
            placeholder="Optional route instructions..."
            className="mt-2 w-full resize-y rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition placeholder:text-steam-300 focus:border-copper-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        {state.error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {state.error}
          </div>
        ) : null}

        {state.success ? (
          <div
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
          >
            {state.success}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || !drivers.length || !warehouses.length}
            className="inline-flex items-center justify-center rounded-xl bg-copper-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-copper-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Creating..." : "Create Template"}
          </button>
        </div>
      </form>
    </div>
  );
}
