import { requireAdmin } from "@/lib/auth/require-admin";

export default async function ServicePage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-display text-3xl text-espresso-950">Service</h1>
      <p className="mt-2 text-sm text-steam-400">
        Service workflow placeholder. Later this page will show service visits,
        machine status, and quality review items.
      </p>
    </main>
  );
}