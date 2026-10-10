"use client";

import { useActionState, useMemo, useState } from "react";

import type { Database } from "@brewtracker/types";

import type { RouteTemplate } from "@/lib/routes/route-template-service";

import {
  addRouteStopExceptionAction,
  removeRouteStopExceptionAction,
  type RouteExceptionActionResult,
} from "./exception-actions";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

type Client = Pick<ClientRow, "id" | "name" | "address" | "city">;

type Machine = Pick<
  MachineRow,
  "id" | "client_id" | "name" | "serial_number"
>;

type Props = {
  routeTemplateId: string;
  templateStops: RouteTemplate["stops"];
  clients: Client[];
  machines: Machine[];
};

const initialState: RouteExceptionActionResult = {
  ok: false,
};

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function RouteStopExceptionForm({
  routeTemplateId,
  templateStops,
  clients,
  machines,
}: Props) {
  const [mode, setMode] = useState<"add" | "remove">("add");

  const [selectedClientId, setSelectedClientId] = useState("");

  const [addState, addAction, addPending] = useActionState(
    addRouteStopExceptionAction,
    initialState,
  );

  const [removeState, removeAction, removePending] = useActionState(
    removeRouteStopExceptionAction,
    initialState,
  );

  const availableMachines = useMemo(
    () =>
      machines.filter(
        (machine) => machine.client_id === selectedClientId,
      ),
    [machines, selectedClientId],
  );

  const pending = mode === "add" ? addPending : removePending;

  return (
    <div className="grid gap-4">
      <label>
        <span className="mb-1.5 block text-sm font-medium text-espresso-800">
          Stop exception
        </span>

        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as "add" | "remove");
          }}
          className={inputClass}
        >
          <option value="add">Add one-off stop</option>

          <option value="remove">Remove recurring stop</option>
        </select>
      </label>

      {mode === "add" ? (
        <form action={addAction} className="grid gap-4">
          <input
            type="hidden"
            name="routeTemplateId"
            value={routeTemplateId}
          />

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
              Client
            </span>

            <select
              name="clientId"
              value={selectedClientId}
              onChange={(event) => {
                setSelectedClientId(event.target.value);
              }}
              required
              className={inputClass}
            >
              <option value="">Select client</option>

              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.city ? ` · ${client.city}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-espresso-800">
              Machine
            </span>

            <select
              name="machineId"
              disabled={!selectedClientId}
              className={inputClass}
            >
              <option value="">
                {selectedClientId
                  ? "No machine"
                  : "Select a client first"}
              </option>

              {availableMachines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name ?? "Machine"}
                  {machine.serial_number
                    ? ` · ${machine.serial_number}`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-medium text-espresso-800">
                Planned start
              </span>

              <input
                type="time"
                name="scheduledStartTime"
                className={inputClass}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-medium text-espresso-800">
                Planned end
              </span>

              <input
                type="time"
                name="scheduledEndTime"
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-latte-200 bg-crema-0 p-4">
            <input
              type="checkbox"
              name="drinkCountRequired"
              className="mt-1 h-4 w-4 rounded border-latte-300"
            />

            <span>
              <span className="block text-sm font-medium text-espresso-800">
                Drink Count required
              </span>

              <span className="mt-1 block text-xs leading-5 text-steam-400">
                Require the driver to record the Drink Count at this
                one-off stop.
              </span>
            </span>
          </label>

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

          {addState.message ? (
            <p
              className={
                addState.ok
                  ? "text-sm text-emerald-700"
                  : "text-sm text-red-600"
              }
            >
              {addState.message}
            </p>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={addPending}
              className="rounded-xl bg-espresso-950 px-4 py-2.5 text-sm font-medium text-crema-50 transition hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addPending ? "Adding..." : "Add one-off stop"}
            </button>
          </div>
        </form>
      ) : (
        <form action={removeAction} className="grid gap-4">
          <input
            type="hidden"
            name="routeTemplateId"
            value={routeTemplateId}
          />

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
              Recurring stop
            </span>

            <select
              name="routeTemplateStopId"
              required
              className={inputClass}
            >
              <option value="">Select stop to remove</option>

              {templateStops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.sequence_number}.{" "}
                  {stop.client?.name ?? "Unknown client"}
                  {stop.machine?.serial_number
                    ? ` · ${stop.machine.serial_number}`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          {templateStops.length === 0 ? (
            <p className="text-sm text-steam-400">
              This template has no recurring stops to remove.
            </p>
          ) : null}

          <label>
            <span className="mb-1.5 block text-sm font-medium text-espresso-800">
              Notes
            </span>

            <textarea
              name="notes"
              rows={3}
              placeholder="Optional reason for removing this stop"
              className={inputClass}
            />
          </label>

          {removeState.message ? (
            <p
              className={
                removeState.ok
                  ? "text-sm text-emerald-700"
                  : "text-sm text-red-600"
              }
            >
              {removeState.message}
            </p>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={removePending || templateStops.length === 0}
              className="rounded-xl bg-espresso-950 px-4 py-2.5 text-sm font-medium text-crema-50 transition hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removePending ? "Removing..." : "Remove stop for date"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}