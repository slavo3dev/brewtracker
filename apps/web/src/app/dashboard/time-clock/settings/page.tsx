import { requireAdmin } from "@/lib/auth/require-admin";
import { autoCloseForgottenClockOutsAction } from "./actions";

export default async function TimeClockSettingsPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-display text-3xl text-espresso-950">
          Clock Rules
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Configure and run time-clock edge case handling.
        </p>
      </header>

      <section className="rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-espresso-950">
          Forgotten clock-out handling
        </h2>

        <p className="mt-2 text-sm text-steam-400">
          Auto-close open time entries whose shift end time has passed, flag them
          for manager review, and keep the reason visible in the review queue.
        </p>

        <form action={autoCloseForgottenClockOutsAction} className="mt-5">
          <button className="rounded-full bg-espresso-950 px-4 py-2 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600">
            Run auto-close check
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-espresso-950">
          Multi-stop days
        </h2>

        <p className="mt-2 text-sm text-steam-400">
          Time entries can now be connected to a route and stop, so managers can
          distinguish warehouse clock-ins from scheduled first-stop clock-ins.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-espresso-950">
          Outside geofence override
        </h2>

        <p className="mt-2 text-sm text-steam-400">
          Outside-geofence clock-ins use manager override status and are routed
          through the manual review queue with an override reason.
        </p>
      </section>
    </main>
  );
}