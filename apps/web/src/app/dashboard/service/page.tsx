import { requireAdmin } from "@/lib/auth/require-admin";

import { TechnicalTicketCard } from "./technical-ticket-card";
import {
  loadTechnicalTickets,
  loadTechnicalTicketTechnicians,
} from "./technical-ticket.service";

export default async function ServicePage() {
  await requireAdmin();

  const [tickets, technicians] = await Promise.all([
    loadTechnicalTickets(),
    loadTechnicalTicketTechnicians(),
  ]);

  const openCount = tickets.filter((ticket) => ticket.status === "open").length;

  const inProgressCount = tickets.filter(
    (ticket) => ticket.status === "in_progress",
  ).length;

  const resolvedCount = tickets.filter(
    (ticket) => ticket.status === "resolved",
  ).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div>
        <p className="text-sm font-medium text-copper-600">Service</p>

        <h1 className="mt-1 text-display text-3xl text-espresso-950">
          Technical Issues
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-steam-400">
          Review technical problems reported by drivers during service visits.
        </p>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <StatusCard label="Open" value={openCount} />

        <StatusCard label="In Progress" value={inProgressCount} />

        <StatusCard label="Resolved" value={resolvedCount} />
      </div>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-espresso-950">
              Reported issues
            </h2>

            <p className="mt-1 text-sm text-steam-400">
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </p>
          </div>
        </div>

        {tickets.length ? (
          <div className="mt-4 grid gap-4">
            {tickets.map((ticket) => (
              <TechnicalTicketCard
                key={ticket.id}
                ticket={ticket}
                technicians={technicians}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-latte-200 bg-crema-0 px-6 py-12 text-center">
            <p className="font-medium text-espresso-950">No technical issues</p>

            <p className="mt-1 text-sm text-steam-400">
              Technical issues reported by drivers will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-latte-200 bg-crema-0 p-4">
      <p className="text-sm text-steam-400">{label}</p>

      <p className="mt-1 text-2xl font-semibold text-espresso-950">{value}</p>
    </div>
  );
}
