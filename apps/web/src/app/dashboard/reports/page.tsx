import { requireAdmin } from "@/lib/auth/require-admin";

export default async function ReportsPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-display text-3xl text-espresso-950">Reports</h1>
      <p className="mt-2 text-sm text-steam-400">
        Reports placeholder. Later this page will show operational KPIs,
        route completion, service quality, and inventory loss.
      </p>
    </main>
  );
}