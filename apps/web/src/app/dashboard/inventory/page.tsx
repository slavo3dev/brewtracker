import { requireAdmin } from "@/lib/auth/require-admin";

import {
  getInventoryAdminData,
  getInventoryMovements,
} from "@/lib/inventory/inventory-service";

import { InventoryManagement } from "./inventory-management";

export default async function InventoryPage() {
  await requireAdmin();

  const [
    { products, locations },
    initialMovements,
  ] = await Promise.all([
    getInventoryAdminData(),

    getInventoryMovements({
      page: 1,
      pageSize: 10,
    }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <InventoryManagement
        products={products}
        locations={locations}
        initialMovements={initialMovements}
      />
    </main>
  );
}