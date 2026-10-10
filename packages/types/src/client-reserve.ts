import type {
  InventoryProductPackaging,
  InventoryQuantityInput,
} from "./inventory";

import {
  normalizeInventoryQuantity,
} from "./inventory";

export type ClientReserveSnapshotStage =
  | "before_service"
  | "after_service";

export type ClientReserveQuantityInput = {
  productId: string;
  quantity: InventoryQuantityInput;
  packaging: InventoryProductPackaging;
};

export type PreparedClientReserveQuantity = {
  productId: string;

  normalizedQuantity: number;
  normalizedUnit: string;

  enteredIssueQuantity: number;
  enteredLooseQuantity: number;

  baseUnitSnapshot: string;
  issueUnitSnapshot: string;
  unitsPerIssueUnitSnapshot: number;
  packageDescriptionSnapshot: string | null;
};

export type ClientReserveComparison = {
  previousReserveAfter: number | null;
  currentReserveBefore: number;

  reserveDecrease: number | null;

  hasPreviousBaseline: boolean;
};

export function prepareClientReserveQuantity(
  input: ClientReserveQuantityInput,
): PreparedClientReserveQuantity {
  const normalized = normalizeInventoryQuantity(
    input.packaging,
    input.quantity,
  );

  return {
    productId: input.productId,

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
  };
}

function assertNonNegativeFinite(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${label} must be a non-negative number.`,
    );
  }
}

export function calculateClientReserveDecrease(
  previousReserveAfter: number | null,
  currentReserveBefore: number,
): ClientReserveComparison {
  assertNonNegativeFinite(
    currentReserveBefore,
    "Current reserve before service",
  );

  if (previousReserveAfter === null) {
    return {
      previousReserveAfter: null,
      currentReserveBefore,
      reserveDecrease: null,
      hasPreviousBaseline: false,
    };
  }

  assertNonNegativeFinite(
    previousReserveAfter,
    "Previous reserve after service",
  );

  return {
    previousReserveAfter,
    currentReserveBefore,

    reserveDecrease:
      previousReserveAfter -
      currentReserveBefore,

    hasPreviousBaseline: true,
  };
}