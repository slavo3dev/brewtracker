import {
  calculateClientReserveDecrease,
  prepareClientReserveQuantity,
} from "@brewtracker/types";

import type {
  CompleteInventoryAuditInput,
  InventoryAuditItemRecord,
} from "./service-visit.types";

export function prepareInventoryAudit(
  input: CompleteInventoryAuditInput,
): InventoryAuditItemRecord[] {
  if (input.counts.length === 0) {
    throw new Error("At least one client reserve quantity is required.");
  }

  const productIds = new Set<string>();

  for (const count of input.counts) {
    if (!count.productId.trim()) {
      throw new Error("Every reserve count must reference a product.");
    }

    if (productIds.has(count.productId)) {
      throw new Error("A product cannot appear more than once.");
    }

    if (
      !Number.isFinite(count.issueQuantity) ||
      count.issueQuantity < 0 ||
      !Number.isInteger(count.issueQuantity)
    ) {
      throw new Error(
        "Package quantities must be whole numbers zero or greater.",
      );
    }

    if (!Number.isFinite(count.looseQuantity) || count.looseQuantity < 0) {
      throw new Error("Loose quantities must be zero or greater.");
    }

    productIds.add(count.productId);
  }

  const configuredProducts = input.configuredProducts;

  const configuredById = new Map(
    configuredProducts.map((product) => [product.productId, product]),
  );

  const missingRequiredProduct = configuredProducts.some(
    (product) => product.isRequired && !productIds.has(product.productId),
  );

  if (missingRequiredProduct) {
    throw new Error("Enter a quantity for every required client product.");
  }

  const previousBalances = input.previousBalances;

  const items: InventoryAuditItemRecord[] = input.counts.map((count) => {
    const product = configuredById.get(count.productId);

    if (!product) {
      throw new Error(
        "The inventory list changed. Reload the step and try again.",
      );
    }

    const prepared = prepareClientReserveQuantity({
      productId: product.productId,

      packaging: product.packaging,

      quantity: {
        issueUnits: count.issueQuantity,

        looseBaseUnits: count.looseQuantity,
      },
    });

    const previousReserveAfter =
      previousBalances.get(product.productId) ?? null;

    const comparison = calculateClientReserveDecrease(
      previousReserveAfter,
      prepared.normalizedQuantity,
    );

    return {
      productId: product.productId,

      sku: product.sku,

      name: product.name,

      category: product.category,

      unitLabel: product.unitLabel,

      issueQuantity: count.issueQuantity,

      looseQuantity: count.looseQuantity,

      normalizedQuantity: prepared.normalizedQuantity,

      normalizedUnit: prepared.normalizedUnit,

      previousReserveAfter: comparison.previousReserveAfter,

      reserveDecrease: comparison.reserveDecrease,
    };
  });

  return items;
}
