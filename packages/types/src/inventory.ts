export type InventoryProductPackaging = {
  baseUnit: string;
  issueUnit: string;
  unitsPerIssueUnit: number;
  packageDescription: string | null;
  allowsLooseUnits: boolean;
  allowsPartialBaseUnit: boolean;
};

export type InventoryQuantityInput = {
  issueUnits: number;
  looseBaseUnits: number;
};

export type NormalizedInventoryQuantity = {
  issueUnits: number;
  looseBaseUnits: number;

  normalizedQuantity: number;
  normalizedUnit: string;

  conversionSnapshot: {
    baseUnit: string;
    issueUnit: string;
    unitsPerIssueUnit: number;
  };
};

function assertFiniteNonNegative(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${label} must be a non-negative number.`,
    );
  }
}

function assertWholeNumber(
  value: number,
  label: string,
): void {
  if (!Number.isInteger(value)) {
    throw new Error(
      `${label} must be a whole number.`,
    );
  }
}

export function normalizeInventoryQuantity(
  packaging: InventoryProductPackaging,
  input: InventoryQuantityInput,
): NormalizedInventoryQuantity {
  const {
    baseUnit,
    issueUnit,
    unitsPerIssueUnit,
    allowsLooseUnits,
    allowsPartialBaseUnit,
  } = packaging;

  const { issueUnits, looseBaseUnits } = input;

  if (!baseUnit.trim()) {
    throw new Error("Base unit is required.");
  }

  if (!issueUnit.trim()) {
    throw new Error("Issue unit is required.");
  }

  if (
    !Number.isFinite(unitsPerIssueUnit) ||
    unitsPerIssueUnit <= 0
  ) {
    throw new Error(
      "Units per issue unit must be greater than zero.",
    );
  }

  assertFiniteNonNegative(issueUnits, "Issue quantity");
  assertFiniteNonNegative(
    looseBaseUnits,
    "Loose base-unit quantity",
  );

  // Physical cases/boxes/packages are counted as whole packages.
  assertWholeNumber(issueUnits, "Issue quantity");

  if (!allowsLooseUnits && looseBaseUnits !== 0) {
    throw new Error(
      `Loose ${baseUnit} quantities are not allowed for this product.`,
    );
  }

  if (
    !allowsPartialBaseUnit &&
    !Number.isInteger(looseBaseUnits)
  ) {
    throw new Error(
      `Partial ${baseUnit} quantities are not allowed for this product.`,
    );
  }

  const normalizedQuantity =
    issueUnits * unitsPerIssueUnit + looseBaseUnits;

  return {
    issueUnits,
    looseBaseUnits,

    normalizedQuantity,
    normalizedUnit: baseUnit,

    conversionSnapshot: {
      baseUnit,
      issueUnit,
      unitsPerIssueUnit,
    },
  };
}