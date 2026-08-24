import { TechnicalTicketActions } from "./technical-ticket-actions";

import type {
  TechnicalTicketListItem,
  TechnicalTicketTechnician,
} from "./technical-ticket.types";

type Props = {
  ticket: TechnicalTicketListItem;
  technicians: TechnicalTicketTechnician[];
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(status: TechnicalTicketListItem["status"]): string {
  switch (status) {
    case "open":
      return "Open";

    case "in_progress":
      return "In Progress";

    case "resolved":
      return "Resolved";

    case "cancelled":
      return "Cancelled";
  }
}

function getStatusClass(status: TechnicalTicketListItem["status"]): string {
  switch (status) {
    case "open":
      return "bg-copper-100 text-copper-600";

    case "in_progress":
      return "bg-latte-100 text-espresso-800";

    case "resolved":
      return "bg-emerald-50 text-emerald-700";

    case "cancelled":
      return "bg-steam-100 text-steam-400";
  }
}

export function TechnicalTicketCard({ ticket, technicians }: Props) {
  const machineLabel =
    ticket.machine.name ?? ticket.machine.serialNumber ?? "Machine";

  return (
    <article className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      <div className="grid md:grid-cols-[1fr_220px]">
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-copper-600">
                Technical issue
              </p>

              <h2 className="mt-1 text-lg font-semibold text-espresso-950">
                {ticket.client.name}
              </h2>

              <p className="mt-1 text-sm text-steam-400">
                {machineLabel}

                {ticket.machine.serialNumber && ticket.machine.name
                  ? ` · ${ticket.machine.serialNumber}`
                  : ""}
              </p>
            </div>

            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold",
                getStatusClass(ticket.status),
              ].join(" ")}
            >
              {getStatusLabel(ticket.status)}
            </span>
          </div>

          <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-espresso-800">
            {ticket.description}
          </p>

          <dl className="mt-5 grid gap-3 border-t border-latte-200 pt-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-steam-400">Reported by</dt>

              <dd className="mt-1 font-medium text-espresso-800">
                {ticket.reporter.fullName}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-steam-400">Reported</dt>

              <dd className="mt-1 font-medium text-espresso-800">
                {formatDate(ticket.createdAt)}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-steam-400">Assigned to</dt>

              <dd className="mt-1 font-medium text-espresso-800">
                {ticket.assignedTo?.fullName ?? "Unassigned"}
              </dd>
            </div>
          </dl>
          <TechnicalTicketActions ticket={ticket} technicians={technicians} />
        </div>

        {ticket.photoUrl ? (
          <div className="border-t border-latte-200 bg-latte-100 p-3 md:border-l md:border-t-0">
            <img
              src={ticket.photoUrl}
              alt={`Technical issue at ${ticket.client.name}`}
              className="h-48 w-full rounded-xl object-cover md:h-full"
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
