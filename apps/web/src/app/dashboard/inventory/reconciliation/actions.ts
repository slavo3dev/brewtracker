"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";

import {
  confirmInventoryReconciliation,
  createInventoryReconciliation,
  getDriverExpectedInventory,
  getInventoryReconciliation,
  type CreateInventoryReconciliationInput,
} from "@/lib/inventory/inventory-service";

export async function loadDriverExpectedInventoryAction(
  driverId: string,
) {
  await requireAdmin();

  if (!driverId) {
    throw new Error("Select a driver.");
  }

  return getDriverExpectedInventory(driverId);
}

function validateReconciliationInput(
  input: CreateInventoryReconciliationInput,
) {
  if (!input.driverId) {
    throw new Error("Select a driver.");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Enter at least one physical inventory count.");
  }

  const productIds = new Set<string>();

  for (const item of input.items) {
    if (!item.productId) {
      throw new Error("Every count must contain a product.");
    }

    if (productIds.has(item.productId)) {
      throw new Error(
        "The same product cannot be reconciled more than once.",
      );
    }

    productIds.add(item.productId);

    if (
      !Number.isFinite(item.physicalQuantity) ||
      item.physicalQuantity < 0
    ) {
      throw new Error(
        "Physical quantities must be zero or greater.",
      );
    }
  }
}

export async function confirmNewInventoryReconciliationAction(
  input: CreateInventoryReconciliationInput,
) {
  await requireAdmin();

  validateReconciliationInput(input);

  const reconciliationId =
    await createInventoryReconciliation(input);

  await confirmInventoryReconciliation(reconciliationId);

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/reconciliation");
  revalidatePath("/dashboard/inventory/movements");

  return getInventoryReconciliation(reconciliationId);
}