"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  recordWarehouseTransfer,
  type RecordWarehouseTransferInput,
} from "@/lib/inventory/inventory-service";

export type WarehouseTransferActionResult = {
  movementIds: string[];
};

export async function recordWarehouseTransferAction(
  input: RecordWarehouseTransferInput,
): Promise<WarehouseTransferActionResult> {
  await requireAdmin();

  if (
    input.movementType !== "warehouse_issue" &&
    input.movementType !== "warehouse_return"
  ) {
    throw new Error("Invalid warehouse transfer type.");
  }

  if (!input.warehouseId) {
    throw new Error("Select a warehouse.");
  }

  if (!input.driverId) {
    throw new Error("Select a driver.");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Add at least one product.");
  }

  const productIds = new Set<string>();

  for (const item of input.items) {
    if (!item.productId) {
      throw new Error("Select a product for every transfer item.");
    }

    if (productIds.has(item.productId)) {
      throw new Error("The same product cannot be added more than once.");
    }

    productIds.add(item.productId);

    if (!Number.isFinite(item.issueQuantity) || item.issueQuantity < 0) {
      throw new Error("Issue quantity must be zero or greater.");
    }

    if (!Number.isInteger(item.issueQuantity)) {
      throw new Error("Issue quantity must be a whole number.");
    }

    if (!Number.isFinite(item.looseQuantity) || item.looseQuantity < 0) {
      throw new Error("Loose quantity must be zero or greater.");
    }
  }

  const movementIds = await recordWarehouseTransfer(input);

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/transfers");
  revalidatePath("/dashboard/inventory/movements");

  return {
    movementIds,
  };
}
