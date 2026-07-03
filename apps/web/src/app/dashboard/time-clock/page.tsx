import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function TimeClockPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-display text-3xl text-espresso-950">
          Time Clock
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Manage employee attendance, clock-in reviews, and time-entry rules.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <TimeClockCard
          title="Review Queue"
          description="Review clock-ins that require manager approval, including selfies and geofence exceptions."
          href="/dashboard/time-clock/review"
        />

        <TimeClockCard
          title="Time Entries"
          description="View and search employee clock-ins, clock-outs, and flagged entries."
          href="/dashboard/time-clock/entries"
        />

        <TimeClockCard
          title="Clock Rules"
          description="Configure future geofence, override, and auto-close behavior."
          href="/dashboard/time-clock/settings"
        />
      </section>
    </main>
  );
}

type TimeClockCardProps = {
  title: string;
  description: string;
  href: string;
};

function TimeClockCard({ title, description, href }: TimeClockCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      <h2 className="text-lg font-semibold text-espresso-950 group-hover:text-copper-600">
        {title}
      </h2>

      <p className="mt-2 text-sm text-steam-400">{description}</p>
    </Link>
  );
}