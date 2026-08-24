"use client";

import { useState, useTransition } from "react";

import { assignTechnicalTicket, resolveTechnicalTicket } from "./actions";

import type {
  TechnicalTicketListItem,
  TechnicalTicketTechnician,
} from "./technical-ticket.types";

type Props = {
  ticket: TechnicalTicketListItem;
  technicians: TechnicalTicketTechnician[];
};

export function TechnicalTicketActions({ ticket, technicians }: Props) {
  const [technicianId, setTechnicianId] = useState(ticket.assignedTo?.id ?? "");

  const [message, setMessage] = useState<string | null>(null);

  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    null,
  );

  const [pending, startTransition] = useTransition();

  const isClosed =
    ticket.status === "resolved" || ticket.status === "cancelled";

  function handleAssign(): void {
    if (!technicianId) {
      setMessageType("error");
      setMessage("Select a technician.");
      return;
    }

    setMessage(null);
    setMessageType(null);

    startTransition(() => {
      void assignTechnicalTicket(ticket.id, technicianId).then((result) => {
        setMessage(result.message);
        setMessageType(result.success ? "success" : "error");
      });
    });
  }

  function handleResolve(): void {
    setMessage(null);
    setMessageType(null);

    startTransition(() => {
      void resolveTechnicalTicket(ticket.id).then((result) => {
        setMessage(result.message);
        setMessageType(result.success ? "success" : "error");
      });
    });
  }

  if (isClosed) {
    return null;
  }

  return (
    <div className="mt-5 border-t border-latte-200 pt-5">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-steam-400">Technician</span>

          <select
            value={technicianId}
            disabled={pending}
            onChange={(event) => {
              setTechnicianId(event.target.value);

              setMessage(null);
              setMessageType(null);
            }}
            className="min-h-11 rounded-xl border border-latte-200 bg-crema-0 px-3 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20 disabled:opacity-50"
          >
            <option value="">Select technician</option>

            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.fullName}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={pending || !technicianId}
          onClick={handleAssign}
          className="min-h-11 rounded-full border border-copper-500 px-5 text-sm font-medium text-copper-600 transition hover:bg-copper-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : ticket.assignedTo ? "Reassign" : "Assign"}
        </button>

        <button
          type="button"
          disabled={pending || ticket.status !== "in_progress"}
          onClick={handleResolve}
          className="min-h-11 rounded-full bg-espresso-950 px-5 text-sm font-medium text-crema-50 transition hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark as Resolved
        </button>
      </div>

      {ticket.status === "open" ? (
        <p className="mt-2 text-xs text-steam-400">
          Assigning a technician will move this issue to In Progress.
        </p>
      ) : null}

      {message ? (
        <p
          role={messageType === "error" ? "alert" : "status"}
          className={[
            "mt-3 rounded-lg px-3 py-2 text-sm",
            messageType === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700",
          ].join(" ")}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
