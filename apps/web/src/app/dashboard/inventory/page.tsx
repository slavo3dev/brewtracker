import { requireAdmin } from "@/lib/auth/require-admin";

import {
  getInventoryAdminData,
  getInventoryMovements,
} from "@/lib/inventory/inventory-service";

import { InventoryManagement } from "./inventory-management";
import { getManagedInventoryProducts } from
  "@/lib/inventory/inventory-product-management-service";

export default async function InventoryPage() {
  await requireAdmin();

  const [
    { locations },
    products,
    initialMovements,
  ] = await Promise.all([
    getInventoryAdminData(),
    getManagedInventoryProducts(),
    getInventoryMovements({ page: 1, pageSize: 10 }),
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