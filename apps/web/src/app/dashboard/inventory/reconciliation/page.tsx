import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";

import { getInventoryReconciliationData } from "@/lib/inventory/inventory-service";

import { InventoryReconciliationForm } from "./inventory-reconciliation-form";

export default async function InventoryReconciliationPage() {
  await requireAdmin();

  const { drivers, products } =
    await getInventoryReconciliationData();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-display text-3xl text-espresso-950">
            Inventory Reconciliation
          </h1>
          
          <p className="mt-2 max-w-2xl text-sm text-steam-400">
            Compare a driver&apos;s expected van inventory with
            the physical count and record any variance.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/inventory/reconciliation/history"
            className="inline-flex items-center justify-center rounded-full border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-800 transition hover:bg-latte-100"
          >
            Reconciliation history
          </Link>

          <Link
            href="/dashboard/inventory"
            className="inline-flex items-center justify-center rounded-full border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-800 transition hover:bg-latte-100"
          >
            Back to Inventory
          </Link>
        </div>
      </div>

      <InventoryReconciliationForm
        drivers={drivers}
        products={products}
      />
    </main>
  );
}