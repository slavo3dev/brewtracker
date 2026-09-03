import type {
  InventoryProductPackaging,
  InventoryQuantityInput,
} from "./inventory";

import {
  normalizeInventoryQuantity,
} from "./inventory";

export type InventoryLocationType =
  | "warehouse"
  | "driver"
  | "client_reserve"
  | "machine";

export type InventoryMovementType =
  | "warehouse_issue"
  | "client_delivery"
  | "machine_refill"
  | "warehouse_return"
  | "adjustment";

export type InventoryMovementInput = {
  movementType: InventoryMovementType;

  productId: string;

  fromLocationId: string | null;
  toLocationId: string | null;

  quantity: InventoryQuantityInput;
  packaging: InventoryProductPackaging;

  sourceVisitId?: string | null;
  stopId?: string | null;
  machineId?: string | null;

  occurredAt: string;
};

export type PreparedInventoryMovement = {
  movementType: InventoryMovementType;

  productId: string;

  fromLocationId: string | null;
  toLocationId: string | null;

  normalizedQuantity: number;
  normalizedUnit: string;

  enteredIssueQuantity: number;
  enteredLooseQuantity: number;

  baseUnitSnapshot: string;
  issueUnitSnapshot: string;
  unitsPerIssueUnitSnapshot: number;
  packageDescriptionSnapshot: string | null;

  sourceVisitId: string | null;
  stopId: string | null;
  machineId: string | null;

  occurredAt: string;
};

export function prepareInventoryMovement(
  input: InventoryMovementInput,
): PreparedInventoryMovement {
  if (
    input.fromLocationId &&
    input.toLocationId &&
    input.fromLocationId === input.toLocationId
  ) {
    throw new Error(
      "Inventory source and destination must be different.",
    );
  }

  const normalized = normalizeInventoryQuantity(
    input.packaging,
    input.quantity,
  );

  if (normalized.normalizedQuantity <= 0) {
    throw new Error(
      "Inventory movement quantity must be greater than zero.",
    );
  }

  return {
    movementType: input.movementType,
    productId: input.productId,

    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,

    normalizedQuantity:
      normalized.normalizedQuantity,

    normalizedUnit:
      normalized.normalizedUnit,

    enteredIssueQuantity:
      normalized.issueUnits,

    enteredLooseQuantity:
      normalized.looseBaseUnits,

    baseUnitSnapshot:
      normalized.conversionSnapshot.baseUnit,

    issueUnitSnapshot:
      normalized.conversionSnapshot.issueUnit,

    unitsPerIssueUnitSnapshot:
      normalized.conversionSnapshot.unitsPerIssueUnit,

    packageDescriptionSnapshot:
      input.packaging.packageDescription,

    sourceVisitId:
      input.sourceVisitId ?? null,

    stopId:
      input.stopId ?? null,

    machineId:
      input.machineId ?? null,

    occurredAt:
      input.occurredAt,
  };
}

export function assertInventoryMovementPath(
  movementType: InventoryMovementType,
  fromType: InventoryLocationType,
  toType: InventoryLocationType,
): void {
  const valid =
    (
      movementType === "warehouse_issue" &&
      fromType === "warehouse" &&
      toType === "driver"
    ) ||
    (
      movementType === "client_delivery" &&
      fromType === "driver" &&
      toType === "client_reserve"
    ) ||
    (
      movementType === "machine_refill" &&
      fromType === "driver" &&
      toType === "machine"
    ) ||
    (
      movementType === "warehouse_return" &&
      fromType === "driver" &&
      toType === "warehouse"
    );

  if (!valid) {
    throw new Error(
      `Invalid inventory movement path: ${movementType} cannot move inventory from ${fromType} to ${toType}.`,
    );
  }
}