import { requireAdmin } from "@/lib/auth/require-admin";

export default async function TimeClockSettingsPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-display text-3xl text-espresso-950">
          Clock Rules
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Configure geofence, override, forgotten clock-out, and auto-close behavior.
        </p>
      </header>

      <section className="rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
        Clock rule configuration will be added in AUTH-7.
      </section>
    </main>
  );
}