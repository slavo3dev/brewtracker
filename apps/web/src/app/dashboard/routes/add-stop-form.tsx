"use client";

import { useActionState } from "react";
import type { Database } from "@brewtracker/types";
import { addStopAction } from "./actions";
import { initialRouteActionState } from "./action-state";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Machine = Database["public"]["Tables"]["machines"]["Row"];

type Props = {
  routeId: string;
  clients: Client[];
  machines: Machine[];
};

const inputClass =
  "rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function AddStopForm({ routeId, clients, machines }: Props) {
  const [state, formAction] = useActionState(
    addStopAction,
    initialRouteActionState,
  );

  return (
    <form action={formAction} className="mt-5 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="routeId" value={routeId} />

      <select name="clientId" required className={inputClass}>
        <option value="">Select client</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>

      <select name="machineId" className={inputClass}>
        <option value="">No machine selected</option>
        {machines.map((machine) => (
          <option key={machine.id} value={machine.id}>
            {machine.name ?? machine.serial_number ?? machine.id}
          </option>
        ))}
      </select>

      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">
        Scheduled start
        <input
          name="scheduledStartAt"
          type="datetime-local"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">
        Scheduled end
        <input
          name="scheduledEndAt"
          type="datetime-local"
          className={inputClass}
        />
      </label>

      <input
        name="notes"
        placeholder="Stop notes"
        className={`${inputClass} md:col-span-2`}
      />

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

      <button className="rounded-full bg-latte-100 px-4 py-2 text-sm font-medium text-espresso-800 transition-colors hover:bg-copper-100 md:col-span-2">
        Add stop
      </button>
    </form>
  );
}
