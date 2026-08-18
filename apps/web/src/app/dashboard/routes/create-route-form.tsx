"use client";

import { useActionState } from "react";
import type { Database } from "@brewtracker/types";
import { createRouteAction } from "./actions";
import { initialRouteActionState } from "./action-state";
import { PlusIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

type Driver = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "full_name" | "email" | "region"
>;

type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];

type Props = {
  drivers: Driver[];
  warehouses: Warehouse[];
};

const inputClass =
  "rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function CreateRouteForm({ drivers, warehouses }: Props) {
  const [state, formAction] = useActionState(
    createRouteAction,
    initialRouteActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <select name="driverId" required className={inputClass}>
        <option value="">Select driver</option>
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.full_name}
          </option>
        ))}
      </select>

      <select name="warehouseId" required className={inputClass}>
        <option value="">Select warehouse</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>

      <input name="routeDate" type="date" required className={inputClass} />

      <input name="notes" placeholder="Notes" className={inputClass} />

      {state.error && (
        <p className="rounded-lg bg-copper-100 px-3 py-2 text-sm text-copper-600 md:col-span-2">
          {state.error}
        </p>
      )}

      {state.success && (
        <p className="rounded-lg bg-latte-100 px-3 py-2 text-sm text-espresso-800 md:col-span-2">
          {state.success}
        </p>
      )}

      <div className="md:col-span-2 md:flex md:justify-end">
        <SubmitButton pendingLabel="Creating route…" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600 disabled:opacity-50 md:w-auto">
          <PlusIcon className="size-4" />
          Create route
        </SubmitButton>
      </div>
    </form>
  );
}