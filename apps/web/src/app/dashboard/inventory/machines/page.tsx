import { requireAdmin } from "@/lib/auth/require-admin";

export default async function MachinesPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-display text-3xl text-espresso-950">
        Machines
      </h1>

      <p className="mt-2 text-sm text-steam-400">
        Machine management module coming soon.
      </p>
    </main>
  );
}