import type {
  InventoryProductPackaging,
  InventoryQuantityInput,
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
