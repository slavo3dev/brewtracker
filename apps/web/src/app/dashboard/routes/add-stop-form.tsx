"use client";

import { useActionState, useMemo, useState } from "react";
import type { Database } from "@brewtracker/types";
import { addStopAction } from "./actions";
import { initialRouteActionState } from "./action-state";
import { PlusIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Machine = Database["public"]["Tables"]["machines"]["Row"];
type Props = { routeId: string; clients: Client[]; machines: Machine[] };
const inputClass = "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function AddStopForm({ routeId, clients, machines }: Props) {
  const [state, formAction] = useActionState(addStopAction, initialRouteActionState);
  const [clientId, setClientId] = useState("");
  const availableMachines = useMemo(() => clientId ? machines.filter((machine) => machine.client_id === clientId) : [], [clientId, machines]);

  return (
    <form action={formAction} className="mb-5 grid gap-3 rounded-xl border border-latte-200 bg-crema-0 p-4 md:grid-cols-2">
      <input type="hidden" name="routeId" value={routeId} />
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Client<select name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)} className={inputClass}><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Machine<select name="machineId" disabled={!clientId} className={inputClass}><option value="">{clientId ? "No machine selected" : "Select a client first"}</option>{availableMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name ?? machine.serial_number ?? machine.id}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Scheduled start<input name="scheduledStartAt" type="datetime-local" className={inputClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Scheduled end<input name="scheduledEndAt" type="datetime-local" className={inputClass} /></label>
      <label className="flex items-center gap-3 rounded-xl border border-latte-200 bg-latte-100/50 px-4 py-3 text-sm font-medium text-espresso-800 md:col-span-2">
      <input
        type="checkbox"
        name="drinkCountRequired"
        className="size-4 accent-copper-500"
      />

      <span>
        Add Drink Count task for this stop
      </span>
    </label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800 md:col-span-2">Notes<input name="notes" placeholder="Optional instructions for the driver" className={inputClass} /></label>
      {state.error && <p role="alert" className="rounded-lg bg-copper-100 px-3 py-2 text-sm text-copper-600 md:col-span-2">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg bg-latte-100 px-3 py-2 text-sm text-espresso-800 md:col-span-2">{state.success}</p>}
      <div className="md:col-span-2 md:flex md:justify-end"><SubmitButton pendingLabel="Adding stop…" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 hover:bg-copper-600 disabled:opacity-50 md:w-auto"><PlusIcon className="size-4" />Add stop</SubmitButton></div>
    </form>
  );
}