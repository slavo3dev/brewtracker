"use client";

import { useActionState } from "react";
import type {
  RouteBuilderRoute,
  RouteBuilderStop,
} from "@/lib/routes/route-service";
import type { Database } from "@brewtracker/types";
import { deleteStopAction, updateStopSequenceAction } from "./actions";
import { AddStopForm } from "./add-stop-form";
import { initialRouteActionState } from "./action-state";
import { RouteMapPreview } from "./route-map-preview";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Machine = Database["public"]["Tables"]["machines"]["Row"];

type Props = {
  route: RouteBuilderRoute;
  clients: Client[];
  machines: Machine[];
};

const inputClass =
  "rounded-xl border border-latte-200 bg-crema-0 px-3 py-2 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function RouteCard({ route, clients, machines }: Props) {
  const sortedStops = [...route.stops].sort(
    (a, b) => a.sequence_number - b.sequence_number,
  );

  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-espresso-950">
            {route.driver?.full_name ?? "Unassigned route"}
          </h2>

          <p className="text-sm text-steam-400">
            {route.route_date} • {route.warehouse?.name ?? "No warehouse"}
          </p>

          {route.notes && (
            <p className="mt-1 text-sm text-steam-400">{route.notes}</p>
          )}
        </div>

        <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium capitalize text-espresso-800">
          {route.status}
        </span>
      </div>

      <div className="mt-5">
        <RouteMapPreview stops={sortedStops} />
      </div>

      <div className="mt-5 grid gap-3">
        {sortedStops.length === 0 ? (
          <div className="rounded-xl border border-dashed border-latte-200 p-4 text-sm text-steam-400">
            No stops yet.
          </div>
        ) : (
          sortedStops.map((stop) => <StopRow key={stop.id} stop={stop} />)
        )}
      </div>

      <AddStopForm routeId={route.id} clients={clients} machines={machines} />
    </article>
  );
}

function StopRow({ stop }: { stop: RouteBuilderStop }) {
  const [sequenceState, sequenceAction] = useActionState(
    updateStopSequenceAction,
    initialRouteActionState,
  );

  const [deleteState, deleteAction] = useActionState(
    deleteStopAction,
    initialRouteActionState,
  );

  const feedback =
    sequenceState.error ||
    sequenceState.success ||
    deleteState.error ||
    deleteState.success;

  const hasError = sequenceState.error || deleteState.error;

  return (
    <div className="rounded-xl border border-latte-200 bg-crema-0 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-medium text-espresso-950">
            Stop #{stop.sequence_number}:{" "}
            {stop.client?.name ?? "Unknown client"}
          </p>

          <p className="text-sm text-steam-400">
            {stop.client?.address ?? "No address"}
            {stop.client?.city ? `, ${stop.client.city}` : ""}
          </p>

          <p className="mt-1 text-sm text-steam-400">
            Machine: {stop.machine?.name ?? stop.machine?.serial_number ?? "—"}
          </p>

          <p className="mt-1 text-sm text-steam-400">
            Scheduled:{" "}
            {stop.scheduled_start_at
              ? new Date(stop.scheduled_start_at).toLocaleString()
              : "No start time"}
            {" → "}
            {stop.scheduled_end_at
              ? new Date(stop.scheduled_end_at).toLocaleString()
              : "No end time"}
          </p>
        </div>

        <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium capitalize text-espresso-800">
          {stop.status}
        </span>
      </div>

      {feedback && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            hasError
              ? "bg-copper-100 text-copper-600"
              : "bg-latte-100 text-espresso-800"
          }`}
        >
          {feedback}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <form action={sequenceAction} className="flex gap-2">
          <input type="hidden" name="stopId" value={stop.id} />

          <input
            name="sequenceNumber"
            type="number"
            min="1"
            defaultValue={stop.sequence_number}
            className={inputClass}
          />

          <button className="rounded-full bg-latte-100 px-3 py-2 text-sm font-medium text-espresso-800 hover:bg-copper-100">
            Update order
          </button>
        </form>

        <form action={deleteAction}>
          <input type="hidden" name="stopId" value={stop.id} />

          <button className="rounded-full bg-copper-100 px-3 py-2 text-sm font-medium text-copper-600 hover:bg-copper-100/70">
            Remove stop
          </button>
        </form>
      </div>
    </div>
  );
}
