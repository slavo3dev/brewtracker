"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  recordWarehouseTransfer,
  type RecordWarehouseTransferInput,
} from "@/lib/inventory/inventory-service";

export type WarehouseTransferActionResult = {
  movementId: string;
};

export async function recordWarehouseTransferAction(
  input: RecordWarehouseTransferInput,
): Promise<WarehouseTransferActionResult> {
  await requireAdmin();

  if (
    input.movementType !== "warehouse_issue" &&
    input.movementType !== "warehouse_return"
  ) {
    throw new Error(
      "Invalid warehouse transfer type.",
    );
  }

  if (!input.warehouseId) {
    throw new Error(
      "Select a warehouse.",
    );
  }

  if (!input.driverId) {
    throw new Error(
      "Select a driver.",
    );
  }

  if (!input.productId) {
    throw new Error(
      "Select a product.",
    );
  }

  if (
    !Number.isFinite(input.issueQuantity) ||
    input.issueQuantity < 0
  ) {
    throw new Error(
      "Issue quantity must be zero or greater.",
    );
  }

  if (
    !Number.isFinite(input.looseQuantity) ||
    input.looseQuantity < 0
  ) {
    throw new Error(
      "Loose quantity must be zero or greater.",
    );
  }

  const movementId =
    await recordWarehouseTransfer(input);

  revalidatePath("/dashboard/inventory");
  revalidatePath(
    "/dashboard/inventory/transfers",
  );

  return {
    movementId,
  };
}