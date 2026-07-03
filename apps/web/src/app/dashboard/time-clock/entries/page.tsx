import { requireAdmin } from "@/lib/auth/require-admin";
import { getTimeEntries } from "@/lib/time-clock/time-entry-service";

export default async function TimeEntriesPage() {
  await requireAdmin();

  const entries = await getTimeEntries();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-display text-3xl text-espresso-950">
          Time Entries
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          View employee clock-ins, clock-outs, flagged entries, and attendance history.
        </p>
      </header>

      {entries.length === 0 ? (
        <section className="rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
          No time entries yet.
        </section>
      ) : (
        <section className="grid gap-4">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-semibold text-espresso-950">
                    {entry.driver?.full_name ?? "Unknown driver"}
                  </h2>

                  <p className="text-sm text-steam-400">
                    {entry.driver?.email ?? "No email"}
                  </p>
                </div>

                <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium capitalize text-espresso-800">
                  {entry.status}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <dt className="text-steam-400">Clock in</dt>
                  <dd className="text-espresso-950">
                    {new Date(entry.clock_in_at).toLocaleString()}
                  </dd>
                </div>

                <div>
                  <dt className="text-steam-400">Clock out</dt>
                  <dd className="text-espresso-950">
                    {entry.clock_out_at
                      ? new Date(entry.clock_out_at).toLocaleString()
                      : "Still open"}
                  </dd>
                </div>

                <div>
                  <dt className="text-steam-400">Warehouse</dt>
                  <dd className="text-espresso-950">
                    {entry.warehouse?.name ?? "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-steam-400">Route date</dt>
                  <dd className="text-espresso-950">
                    {entry.route?.route_date ?? "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-steam-400">Stop</dt>
                  <dd className="text-espresso-950">
                    {entry.stop
                      ? `Stop #${entry.stop.sequence_number}`
                      : "Warehouse clock-in"}
                  </dd>
                </div>

                <div>
                  <dt className="text-steam-400">Review</dt>
                  <dd className="capitalize text-espresso-950">
                    {entry.review_status}
                  </dd>
                </div>

                <div>
                  <dt className="text-steam-400">Auto closed</dt>
                  <dd className="text-espresso-950">
                    {entry.auto_closed_at
                      ? new Date(entry.auto_closed_at).toLocaleString()
                      : "No"}
                  </dd>
                </div>

                <div>
                  <dt className="text-steam-400">Reason</dt>
                  <dd className="text-espresso-950">
                    {entry.review_reason ||
                      entry.override_reason ||
                      entry.auto_close_reason ||
                      "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}