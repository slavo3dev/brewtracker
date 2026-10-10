import { requireAdmin } from "@/lib/auth/require-admin";

import { ServiceNavigation } from "../service-navigation";
import { ServiceVisitCard } from "../service-visit-card";
import { loadServiceVisits } from "../service-visit.service";

export default async function ServiceVisitsPage() {
  await requireAdmin();

  const visits = await loadServiceVisits();

  const inProgressCount = visits.filter(
    (visit) => visit.status === "in_progress",
  ).length;

  const completedCount = visits.filter(
    (visit) => visit.status === "completed",
  ).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div>
        <p className="text-sm font-medium text-copper-600">Service</p>

        <h1 className="mt-1 text-display text-3xl text-espresso-950">
          Service Visits
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-steam-400">
          Review recent client visits, service completion, and time spent at
          each location.
        </p>
      </div>

      <ServiceNavigation />

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <StatusCard label="Recent Visits" value={visits.length} />

        <StatusCard label="In Progress" value={inProgressCount} />

        <StatusCard label="Completed" value={completedCount} />
      </div>

      <section className="mt-8">
        <div>
          <h2 className="text-xl font-semibold text-espresso-950">
            Recent visits
          </h2>

          <p className="mt-1 text-sm text-steam-400">
            Showing the latest {visits.length}{" "}
            {visits.length === 1 ? "visit" : "visits"}.
          </p>
        </div>

        {visits.length ? (
          <div className="mt-4 grid gap-4">
            {visits.map((visit) => (
              <ServiceVisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-latte-200 bg-crema-0 px-6 py-12 text-center">
            <p className="font-medium text-espresso-950">No service visits</p>

            <p className="mt-1 text-sm text-steam-400">
              Visits will appear here after a driver confirms arrival.
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
