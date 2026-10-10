import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getWarehouseMovementDashboard,
  type WarehouseMovementDashboardFilters,
} from "@/lib/inventory/inventory-service";

import { WarehouseMovementDashboard } from "./warehouse-movement-dashboard";

type PageProps = {
  searchParams: Promise<{
    warehouse?: string;
    driver?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function WarehouseMovementsPage({
  searchParams,
}: PageProps) {
  await requireAdmin();

  const params = await searchParams;

  const filters: WarehouseMovementDashboardFilters = {
    warehouseId: params.warehouse || undefined,
    driverId: params.driver || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  };

  const data = await getWarehouseMovementDashboard(filters);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-copper-500">Inventory</p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-espresso-950">
            Warehouse Inventory Movement
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-steam-400">
            Review inventory issued to drivers, delivered to clients, put into
            machines, and returned to warehouses.
          </p>
        </div>

        <Link
          href="/dashboard/inventory"
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-950 shadow-sm transition hover:bg-latte-50"
        >
          Back to Inventory
        </Link>
      </div>

      <WarehouseMovementDashboard data={data} filters={filters} />
    </main>
  );
}
