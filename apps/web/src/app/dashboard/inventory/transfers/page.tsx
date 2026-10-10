import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";

import {
  getWarehouseTransferData,
} from "@/lib/inventory/inventory-service";

import { WarehouseTransferForm } from "./warehouse-transfer-form";

export default async function InventoryTransfersPage() {
  await requireAdmin();

  const {
    warehouses,
    drivers,
    products,
  } = await getWarehouseTransferData();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-display text-3xl text-espresso-950">
            Warehouse Transfers
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-steam-400">
            Issue inventory from a warehouse to a
            driver or record inventory returned by a
            driver to a warehouse.
          </p>
        </div>

        <Link
          href="/dashboard/inventory"
          className="inline-flex items-center justify-center rounded-full border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-800 transition hover:bg-latte-100"
        >
          Back to Inventory
        </Link>
      </div>

      <WarehouseTransferForm
        warehouses={warehouses}
        drivers={drivers}
        products={products}
      />
    </main>
  );
}