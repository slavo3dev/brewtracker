import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function InventoryPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-display text-3xl text-espresso-950">
          Inventory
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Manage company inventory, warehouses and customer machines.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <InventoryCard
          title="Warehouses"
          description="Manage warehouse locations and stock."
          href="/dashboard/inventory/warehouses"
        />

        <InventoryCard
          title="Machines"
          description="Manage customer coffee machines."
          href="/dashboard/inventory/machines"
        />
      </section>
    </main>
  );
}

type Props = {
  title: string;
  description: string;
  href: string;
};

function InventoryCard({ title, description, href }: Props) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
    >
      <h2 className="text-lg font-semibold text-espresso-950">
        {title}
      </h2>

      <p className="mt-2 text-sm text-steam-400">
        {description}
      </p>
    </Link>
  );
}