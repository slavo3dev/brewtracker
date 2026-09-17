"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import type { Database } from "@brewtracker/types";

import { addRouteTemplateStopAction } from "../template-actions";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

type Client = Pick<ClientRow, "id" | "name" | "address" | "city">;

type Machine = Pick<MachineRow, "id" | "client_id" | "name" | "serial_number">;

type Props = {
  templateId: string;
  clients: Client[];
  machines: Machine[];
  existingMachineIds: string[];
};

const initialState = {
  error: null,
  success: null,
};

export function AddTemplateStopForm({
  templateId,
  clients,
  machines,
  existingMachineIds,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const [selectedClientId, setSelectedClientId] = useState("");

  const [state, formAction, pending] = useActionState(
    addRouteTemplateStopAction,
    initialState,
  );

  const availableMachines = useMemo(
    () =>
      machines.filter(
        (machine) =>
          machine.client_id === selectedClientId &&
          !existingMachineIds.includes(machine.id),
      ),
    [machines, selectedClientId, existingMachineIds],
  );

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setSelectedClientId("");
    }
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-latte-200 bg-latte-50/40 p-4"
    >
      <input type="hidden" name="templateId" value={templateId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label
            htmlFor={`stop-client-${templateId}`}
            className="text-sm font-medium text-espresso-800"
          >
            Client
          </label>

          <select
            id={`stop-client-${templateId}`}
            name="clientId"
            required
            disabled={pending}
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
          >
            <option value="">Select client</option>

            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.city ? ` · ${client.city}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`stop-machine-${templateId}`}
            className="text-sm font-medium text-espresso-800"
          >
            Machine
          </label>

          <select
            id={`stop-machine-${templateId}`}
            name="machineId"
            disabled={pending || !selectedClientId}
            defaultValue=""
            className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
          >
            <option value="">No machine</option>

            {availableMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name ?? machine.serial_number ?? "Machine"}

                {machine.serial_number && machine.name
                  ? ` · ${machine.serial_number}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`start-${templateId}`}
            className="text-sm font-medium text-espresso-800"
          >
            Planned start
          </label>

          <input
            id={`start-${templateId}`}
            name="scheduledStartTime"
            type="time"
            disabled={pending}
            className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor={`end-${templateId}`}
            className="text-sm font-medium text-espresso-800"
          >
            Planned end
          </label>

          <input
            id={`end-${templateId}`}
            name="scheduledEndTime"
            type="time"
            disabled={pending}
            className="mt-2 w-full rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-sm text-espresso-800">
          <input
            type="checkbox"
            name="drinkCountRequired"
            disabled={pending}
            className="h-4 w-4 rounded border-latte-300"
          />
          Drink Count required
        </label>
      </div>

      <div className="mt-4">
        <label
          htmlFor={`stop-notes-${templateId}`}
          className="text-sm font-medium text-espresso-800"
        >
          Stop notes
        </label>

        <textarea
          id={`stop-notes-${templateId}`}
          name="notes"
          rows={2}
          disabled={pending}
          placeholder="Optional service instructions..."
          className="mt-2 w-full resize-y rounded-xl border border-latte-200 bg-white px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 disabled:opacity-60"
        />
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p role="status" className="mt-3 text-sm text-green-700">
          {state.success}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending || !selectedClientId}
          className="rounded-xl bg-copper-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-copper-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add Stop"}
        </button>
      </div>
    </form>
  );
}
