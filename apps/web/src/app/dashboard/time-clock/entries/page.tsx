import { requireAdmin } from "@/lib/auth/require-admin";

export default async function TimeEntriesPage() {
  await requireAdmin();

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

      <section className="rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
        Time entry search and filtering will be added in AUTH-7.
      </section>
    </main>
  );
}