"use client";

import { useActionState, useState } from "react";

import type { Database } from "@brewtracker/types";

import type { RouteTemplate } from "@/lib/routes/route-template-service";

import {
  deleteRouteTemplateStopAction,
  setRouteTemplateActiveAction,
} from "../template-actions";

import { AddTemplateStopForm } from "./add-template-stop-form";
import { EditTemplateForm } from "./edit-template-form";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type WarehouseRow = Database["public"]["Tables"]["warehouses"]["Row"];

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

type Driver = Pick<UserRow, "id" | "full_name" | "email" | "region">;

type Warehouse = Pick<WarehouseRow, "id" | "name" | "city" | "region">;

type Client = Pick<ClientRow, "id" | "name" | "address" | "city">;

type Machine = Pick<MachineRow, "id" | "client_id" | "name" | "serial_number">;

type Props = {
  template: RouteTemplate;

  drivers: Driver[];
  warehouses: Warehouse[];

  clients: Client[];
  machines: Machine[];
};

const initialState = {
  error: null,
  success: null,
};

const weekdayLabels = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
] as const;

function formatTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.slice(0, 5);
}

export function RouteTemplateCard({
  template,
  drivers,
  warehouses,
  clients,
  machines,
}: Props) {
  const [editing, setEditing] = useState(false);

  const [addingStop, setAddingStop] = useState(false);

  const [statusState, statusAction, statusPending] = useActionState(
    setRouteTemplateActiveAction,
    initialState,
  );

  const activeDays = weekdayLabels.filter(([name]) => template[name]);

  const existingMachineIds = template.stops.flatMap((stop) =>
    stop.machine_id ? [stop.machine_id] : [],
  );

  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-espresso-950">
                {template.name}
              </h3>

              <span
                className={[
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  template.is_active
                    ? "bg-green-50 text-green-700"
                    : "bg-latte-100 text-steam-500",
                ].join(" ")}
              >
                {template.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            <p className="mt-2 text-sm text-steam-400">
              {template.driver?.full_name ?? "Unknown driver"}
              {" · "}
              {template.warehouse?.name ?? "Unknown warehouse"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing((current) => !current)}
              className="rounded-xl border border-latte-200 bg-white px-3 py-2 text-sm font-medium text-espresso-800 transition hover:bg-latte-50"
            >
              {editing ? "Close Edit" : "Edit"}
            </button>

            <form action={statusAction}>
              <input type="hidden" name="templateId" value={template.id} />

              <input
                type="hidden"
                name="isActive"
                value={template.is_active ? "false" : "true"}
              />

              <button
                type="submit"
                disabled={statusPending}
                className={[
                  "rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                  template.is_active
                    ? "border border-latte-200 bg-white text-espresso-800 hover:bg-latte-50"
                    : "bg-copper-600 text-white hover:bg-copper-700",
                ].join(" ")}
              >
                {statusPending
                  ? "Updating..."
                  : template.is_active
                    ? "Deactivate"
                    : "Activate"}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {activeDays.length ? (
            activeDays.map(([name, label]) => (
              <span
                key={name}
                className="rounded-lg bg-copper-50 px-2.5 py-1 text-xs font-medium text-copper-700"
              >
                {label}
              </span>
            ))
          ) : (
            <span className="text-sm text-steam-400">
              No service days selected
            </span>
          )}
        </div>

        {template.notes ? (
          <p className="mt-4 text-sm leading-6 text-steam-400">
            {template.notes}
          </p>
        ) : null}

        {statusState.error ? (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {statusState.error}
          </p>
        ) : null}

        {statusState.success ? (
          <p role="status" className="mt-4 text-sm text-green-700">
            {statusState.success}
          </p>
        ) : null}

        {editing ? (
          <div className="mt-6 border-t border-latte-200 pt-6">
            <EditTemplateForm
              template={template}
              drivers={drivers}
              warehouses={warehouses}
            />
          </div>
        ) : null}
      </div>

      <div className="border-t border-latte-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-espresso-950">Stops</h4>

            <p className="mt-1 text-sm text-steam-400">
              {template.stops.length}{" "}
              {template.stops.length === 1 ? "stop" : "stops"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAddingStop((current) => !current)}
            className="rounded-xl border border-latte-200 bg-white px-3 py-2 text-sm font-medium text-espresso-800 transition hover:bg-latte-50"
          >
            {addingStop ? "Cancel" : "+ Add Stop"}
          </button>
        </div>

        {addingStop ? (
          <div className="mt-4">
            <AddTemplateStopForm
              templateId={template.id}
              clients={clients}
              machines={machines}
              existingMachineIds={existingMachineIds}
            />
          </div>
        ) : null}

        {template.stops.length ? (
          <div className="mt-4 divide-y divide-latte-200 rounded-xl border border-latte-200">
            {template.stops.map((stop) => (
              <TemplateStopRow
                key={stop.id}
                stop={stop}
                isLastActiveStop={
                  template.is_active && template.stops.length === 1
                }
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-latte-200 px-5 py-8 text-center">
            <p className="text-sm font-medium text-espresso-950">
              No stops configured
            </p>

            <p className="mt-1 text-sm text-steam-400">
              Add at least one stop before activating this template.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function TemplateStopRow({
  stop,
  isLastActiveStop,
}: {
  stop: RouteTemplate["stops"][number];
  isLastActiveStop: boolean;
}) {
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteRouteTemplateStopAction,
    initialState,
  );

  const startTime = formatTime(stop.scheduled_start_time);

  const endTime = formatTime(stop.scheduled_end_time);

  return (
    <div className="p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copper-50 text-sm font-semibold text-copper-700">
          {stop.sequence_number}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-espresso-950">
            {stop.client?.name ?? "Unknown client"}
          </p>

          <p className="mt-1 text-sm text-steam-400">
            {stop.machine
              ? `${stop.machine.name ?? "Machine"}${
                  stop.machine.serial_number
                    ? ` · ${stop.machine.serial_number}`
                    : ""
                }`
              : "No machine"}
          </p>

          {startTime || endTime ? (
            <p className="mt-1 text-xs text-steam-400">
              Planned: {startTime ?? "—"}
              {" – "}
              {endTime ?? "—"}
            </p>
          ) : null}

          {stop.drink_count_required ? (
            <p className="mt-1 text-xs font-medium text-copper-700">
              Drink Count required
            </p>
          ) : null}

          {stop.notes ? (
            <p className="mt-2 text-sm text-steam-400">{stop.notes}</p>
          ) : null}

          {deleteState.error ? (
            <p className="mt-2 text-sm text-red-700">{deleteState.error}</p>
          ) : null}
        </div>

        <form action={deleteAction}>
          <input type="hidden" name="stopId" value={stop.id} />

          <button
            type="submit"
            disabled={deletePending || isLastActiveStop}
            title={
              isLastActiveStop
                ? "Deactivate the template before removing its last stop."
                : undefined
            }
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deletePending ? "Removing..." : "Remove"}
          </button>
          {isLastActiveStop ? (
            <p className="mt-1 max-w-44 text-right text-xs text-steam-400">
              Deactivate before removing the final stop.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
