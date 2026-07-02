import { requireAdmin } from "@/lib/auth/require-admin";

export default async function RoutesPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-display text-3xl text-espresso-950">Routes</h1>
      <p className="mt-2 text-sm text-steam-400">
        Route management placeholder. Later this page will show daily routes,
        assigned drivers, stops, and route status.
      </p>
    </main>
  );
}