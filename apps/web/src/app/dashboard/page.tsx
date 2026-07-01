import Link from "next/link";
import { canManageUsers } from "@brewtracker/types";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function DashboardPage() {
   const profile = await requireAdmin();

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-display text-3xl text-espresso-950">Dashboard</h1>

        <p className="mt-2 text-sm text-steam-400">
          Welcome back, {profile.full_name}.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {canManageUsers(profile) && (
          <DashboardCard
            title="User management"
            description="Manage drivers, managers and administrators."
            href="/dashboard/users"
          />
        )}

        <DashboardCard
          title="Routes"
          description="Manage daily routes and assignments."
          href="/dashboard/routes"
        />

        <DashboardCard
          title="Warehouses"
          description="Manage warehouse locations."
          href="dashboard/inventory/warehouses"
        />

        <DashboardCard
          title="Machines"
          description="Manage customer machines."
          href="/dashboard/inventory/machines"
        />

        <DashboardCard
          title="Reports"
          description="View operational reports."
          href="/dashboard/reports"
        />
      </section>
    </main>
  );
}

type DashboardCardProps = {
  title: string;
  description: string;
  href: string;
};

function DashboardCard({ title, description, href }: DashboardCardProps) {
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
