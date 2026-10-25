import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { DASHBOARD_NAVIGATION } from "@/components/layout/navigation.config";

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

      <div className="space-y-10">
        {DASHBOARD_NAVIGATION.map((group) => (
          <section key={group.label}>
            <h2 className="mb-5 text-xl font-semibold text-espresso-950">
              {group.label}
            </h2>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {group.links.map((link) => (
                <DashboardCard
                  key={link.href}
                  title={link.label}
                  description={link.description}
                  href={link.href}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
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
      <h3 className="text-lg font-semibold text-espresso-950 group-hover:text-copper-600">
        {title}
      </h3>

      <p className="mt-2 text-sm text-steam-400">{description}</p>
    </Link>
  );
}
