"use client";

import { useActionState, useState } from "react";
import type { Database } from "@brewtracker/types";
import type { RouteBuilderRoute, RouteBuilderStop } from "@/lib/routes/route-service";
import { deleteStopAction, updateStopSequenceAction } from "./actions";
import { AddStopForm } from "./add-stop-form";
import { initialRouteActionState } from "./action-state";
import { CalendarIcon, ChevronDownIcon, PlusIcon, TrashIcon, UsersIcon } from "./icons";
import { RouteMapPreview } from "./route-map-preview";
import { SubmitButton } from "./submit-button";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Machine = Database["public"]["Tables"]["machines"]["Row"];
type Props = { route: RouteBuilderRoute; clients: Client[]; machines: Machine[] };

const orderInputClass = "w-20 rounded-xl border border-latte-200 bg-crema-0 px-3 py-2 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function RouteCard({ route, clients, machines }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddStop, setShowAddStop] = useState(false);
  const sortedStops = [...route.stops].sort((a, b) => a.sequence_number - b.sequence_number);

  return (
    <article className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <button type="button" onClick={() => setIsExpanded((value) => !value)} aria-expanded={isExpanded} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-latte-100 text-espresso-800"><UsersIcon className="size-5" /></span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold text-espresso-950">{route.driver?.full_name ?? "Unassigned route"}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-steam-400">
              <span className="inline-flex items-center gap-1.5"><CalendarIcon className="size-4" />{route.route_date}</span>
              <span>{route.warehouse?.name ?? "No warehouse"}</span>
              <span>{sortedStops.length} {sortedStops.length === 1 ? "stop" : "stops"}</span>
            </span>
            {route.notes && <span className="mt-1 block truncate text-sm text-steam-400">{route.notes}</span>}
          </span>
        </button>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium capitalize text-espresso-800">{route.status}</span>
          <button type="button" onClick={() => setIsExpanded((value) => !value)} className="inline-flex items-center gap-2 rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 transition-colors hover:bg-latte-100">
            {isExpanded ? "Hide details" : "View / manage"}
            <ChevronDownIcon className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-latte-200 bg-latte-100/40 p-5">
          <RouteMapPreview stops={sortedStops} />
          <div className="mb-3 mt-5 flex items-center justify-between gap-3">
            <div><h3 className="font-semibold text-espresso-950">Stops</h3><p className="text-sm text-steam-400">Manage route order and scheduled visits.</p></div>
            <button type="button" onClick={() => setShowAddStop((value) => !value)} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-espresso-950 px-4 py-2 text-sm font-medium text-crema-50 hover:bg-copper-600"><PlusIcon className="size-4" />{showAddStop ? "Close form" : "Add stop"}</button>
          </div>
          {showAddStop && <AddStopForm routeId={route.id} clients={clients} machines={machines} />}
          <div className="mt-4 grid gap-3">
            {sortedStops.length === 0 ? <div className="rounded-xl border border-dashed border-latte-200 bg-crema-0 p-5 text-sm text-steam-400">No stops yet. Add the first stop to this route.</div> : sortedStops.map((stop) => <StopRow key={stop.id} stop={stop} />)}
          </div>
        </div>
      )}
    </article>
  );
}

function StopRow({ stop }: { stop: RouteBuilderStop }) {
  const [sequenceState, sequenceAction] = useActionState(updateStopSequenceAction, initialRouteActionState);
  const [deleteState, deleteAction] = useActionState(deleteStopAction, initialRouteActionState);
  const feedback = sequenceState.error || sequenceState.success || deleteState.error || deleteState.success;
  const hasError = Boolean(sequenceState.error || deleteState.error);
  const address = [stop.client?.address, stop.client?.city].filter(Boolean).join(", ") || "No address";

  return (
    <div className="rounded-xl border border-latte-200 bg-crema-0 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-espresso-950 text-xs font-semibold text-crema-50">{stop.sequence_number}</span><p className="font-medium text-espresso-950">{stop.client?.name ?? "Unknown client"}</p><span className="rounded-full bg-latte-100 px-2.5 py-1 text-xs font-medium capitalize text-espresso-800">{stop.status}</span></div>
          <p className="mt-2 text-sm text-steam-400">{address}</p>
          <p className="mt-1 text-sm text-steam-400">Machine: {stop.machine?.name ?? stop.machine?.serial_number ?? "—"}</p>
          <p className="mt-1 text-sm text-steam-400">Scheduled: {formatDate(stop.scheduled_start_at)} → {formatDate(stop.scheduled_end_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <form action={sequenceAction} className="flex items-center gap-2">
            <input type="hidden" name="stopId" value={stop.id} />
            <input aria-label={`Order for ${stop.client?.name ?? "stop"}`} name="sequenceNumber" type="number" min="1" defaultValue={stop.sequence_number} className={orderInputClass} />
            <SubmitButton pendingLabel="Saving…" className="rounded-full border border-latte-200 px-3 py-2 text-sm font-medium text-espresso-800 hover:bg-latte-100 disabled:opacity-50">Update order</SubmitButton>
          </form>
          <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Remove ${stop.client?.name ?? "this stop"} from the route?`)) event.preventDefault(); }}>
            <input type="hidden" name="stopId" value={stop.id} />
            <SubmitButton pendingLabel="Removing…" aria-label={`Remove ${stop.client?.name ?? "stop"}`} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-copper-600 hover:bg-copper-100 disabled:opacity-50"><TrashIcon className="size-4" />Remove</SubmitButton>
          </form>
        </div>
      </div>
      {feedback && <p role={hasError ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2 text-sm ${hasError ? "bg-copper-100 text-copper-600" : "bg-latte-100 text-espresso-800"}`}>{feedback}</p>}
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "No time";
}