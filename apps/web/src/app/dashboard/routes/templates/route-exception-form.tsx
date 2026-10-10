"use client";

import type { Database } from "@brewtracker/types";
import { useActionState, useState } from "react";

import {
  saveRouteTemplateExceptionAction,
  type RouteExceptionActionResult,
} from "./exception-actions";

type Driver = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "full_name" | "email"
>;

type Props = {
  routeTemplateId: string;
  drivers: Driver[];
};

const initialState: RouteExceptionActionResult = {
  ok: false,
};

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function RouteExceptionForm({ routeTemplateId, drivers }: Props) {
  const [mode, setMode] = useState<"skip" | "driver">("skip");

  const [state, formAction, pending] = useActionState(
    saveRouteTemplateExceptionAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="routeTemplateId" value={routeTemplateId} />

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-sm font-medium text-espresso-800">
            Date
          </span>

          <input
            type="date"
            name="exceptionDate"
            required
            className={inputClass}
          />
        </label>

        <label>
          <span className="mb-1.5 block text-sm font-medium text-espresso-800">
            Exception
          </span>

          <select
            name="mode"
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as "skip" | "driver")
            }
            className={inputClass}
          >
            <option value="skip">Skip route</option>

            <option value="driver">Replace driver</option>
          </select>
        </label>
      </div>

      {mode === "driver" && (
        <label>
          <span className="mb-1.5 block text-sm font-medium text-espresso-800">
            Replacement driver
          </span>

          <select name="overrideDriverId" required className={inputClass}>
            <option value="">Select driver</option>

            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.full_name || driver.email}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        <span className="mb-1.5 block text-sm font-medium text-espresso-800">
          Notes
        </span>

        <textarea
          name="notes"
          rows={3}
          placeholder="Optional reason or instructions"
          className={inputClass}
        />
      </label>

      {state.message && (
        <p
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-espresso-950 px-4 py-2.5 text-sm font-medium text-crema-50 transition hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : "Add exception"}
        </button>
      </div>
    </form>
  );
}
