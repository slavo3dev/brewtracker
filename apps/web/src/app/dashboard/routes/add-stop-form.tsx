"use client";

import { useActionState, useMemo, useState } from "react";
import type { Database } from "@brewtracker/types";

import { addStopAction } from "./actions";
import { initialRouteActionState } from "./action-state";
import { PlusIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Machine = Database["public"]["Tables"]["machines"]["Row"];

type Props = {
  routeId: string;
  clients: Client[];
  machines: Machine[];
};

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function AddStopForm({
  routeId,
  clients,
  machines,
}: Props) {
  const [state, formAction] = useActionState(
    addStopAction,
    initialRouteActionState,
  );

  const [clientId, setClientId] = useState("");
  const [selectedMachineIds, setSelectedMachineIds] =
    useState<string[]>([]);
  const [drinkCountMachineIds, setDrinkCountMachineIds] =
    useState<string[]>([]);

  const availableMachines = useMemo(
    () =>
      clientId
        ? machines.filter(
            (machine) => machine.client_id === clientId,
          )
        : [],
    [clientId, machines],
  );

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId);
    setSelectedMachineIds([]);
    setDrinkCountMachineIds([]);
  }

  function handleMachineSelection(
    machineId: string,
    checked: boolean,
  ) {
    setSelectedMachineIds((current) =>
      checked
        ? [...current, machineId]
        : current.filter((id) => id !== machineId),
    );

    if (!checked) {
      setDrinkCountMachineIds((current) =>
        current.filter((id) => id !== machineId),
      );
    }
  }

  function handleDrinkCountChange(
    machineId: string,
    checked: boolean,
  ) {
    setDrinkCountMachineIds((current) =>
      checked
        ? [...current, machineId]
        : current.filter((id) => id !== machineId),
    );
  }

  return (
    <form
      action={formAction}
      className="mb-5 grid gap-3 rounded-xl border border-latte-200 bg-crema-0 p-4 md:grid-cols-2"
    >
      <input type="hidden" name="routeId" value={routeId} />

      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">
        Client
        <select
          name="clientId"
          required
          value={clientId}
          onChange={(event) =>
            handleClientChange(event.target.value)
          }
          className={inputClass}
        >
          <option value="">Select client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 md:col-span-2">
        <p className="text-sm font-medium text-espresso-800">
          Machines to service
        </p>

        {!clientId ? (
          <p className="text-sm text-steam-400">
            Select a client first.
          </p>
        ) : availableMachines.length === 0 ? (
          <p className="text-sm text-steam-400">
            This client has no assigned machines.
          </p>
        ) : (
          <div className="grid gap-2">
            {availableMachines.map((machine) => {
              const selected = selectedMachineIds.includes(
                machine.id,
              );

              return (
                <div
                  key={machine.id}
                  className="rounded-xl border border-latte-200 p-3"
                >
                  <label className="flex items-center gap-3 text-sm font-medium text-espresso-800">
                    <input
                      type="checkbox"
                      name="machineIds"
                      value={machine.id}
                      checked={selected}
                      onChange={(event) =>
                        handleMachineSelection(
                          machine.id,
                          event.target.checked,
                        )
                      }
                      className="size-4 accent-copper-500"
                    />

                    {machine.name ??
                      machine.serial_number ??
                      machine.id}
                  </label>

                  {selected && (
                    <label className="ml-7 mt-3 flex items-center gap-2 text-sm text-steam-400">
                      <input
                        type="checkbox"
                        name={`drinkCountRequired:${machine.id}`}
                        checked={drinkCountMachineIds.includes(
                          machine.id,
                        )}
                        onChange={(event) =>
                          handleDrinkCountChange(
                            machine.id,
                            event.target.checked,
                          )
                        }
                        className="size-4 accent-copper-500"
                      />

                      Require Drink Count
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-steam-400">
          {selectedMachineIds.length} machine
          {selectedMachineIds.length === 1 ? "" : "s"} selected
        </p>
      </div>

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

      <label className="grid gap-1.5 text-sm font-medium text-espresso-800 md:col-span-2">
        Notes
        <input
          name="notes"
          placeholder="Optional instructions for the driver"
          className={inputClass}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-copper-100 px-3 py-2 text-sm text-copper-600 md:col-span-2"
        >
          {state.error}
        </p>
      )}

      {state.success && (
        <p
          role="status"
          className="rounded-lg bg-latte-100 px-3 py-2 text-sm text-espresso-800 md:col-span-2"
        >
          {state.success}
        </p>
      )}

      <div className="md:col-span-2 md:flex md:justify-end">
        <SubmitButton
          disabled={selectedMachineIds.length === 0}
          pendingLabel="Adding stop…"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 hover:bg-copper-600 disabled:opacity-50 md:w-auto"
        >
          <PlusIcon className="size-4" />
          Add stop
        </SubmitButton>
      </div>
    </form>
  );
}