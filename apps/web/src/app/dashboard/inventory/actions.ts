"use server";

import { requireAdmin } from "@/lib/auth/require-admin";

import {
  getInventoryMovements,
  type InventoryMovementFilters,
  type InventoryMovementPage,
} from "@/lib/inventory/inventory-service";

export async function loadInventoryMovements(
  filters: InventoryMovementFilters,
): Promise<InventoryMovementPage> {
  await requireAdmin();

  return getInventoryMovements(filters);
}