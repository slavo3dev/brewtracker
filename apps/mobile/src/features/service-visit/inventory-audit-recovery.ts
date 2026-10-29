
import { prepareClientReserveQuantity } from "@brewtracker/types";

import type {
  ClientInventoryProduct,
  InventoryAuditRecord,
} from "./service-visit.types";

export function recoverLegacyAuditConfiguration(
  audit: InventoryAuditRecord,
  availableProducts: ClientInventoryProduct[],
): ClientInventoryProduct[] {
  if (audit.items.length === 0) {
    throw new Error("The saved inventory audit has no products.");
  }

  const productsById = new Map(
    availableProducts.map((product) => [product.productId, product]),
  );

  const seen = new Set<string>();
  const recoveredProducts: ClientInventoryProduct[] = [];

  for (const item of audit.items) {
    if (seen.has(item.productId)) {
      throw new Error(
        `The saved audit contains duplicate product ${item.productId}.`,
      );
    }

    seen.add(item.productId);

    const product = productsById.get(item.productId);

    if (!product) {
      throw new Error(
        `Product ${item.name} is no longer configured for this client. ` +
          "Manager reconciliation is required.",
      );
    }

    let prepared: ReturnType<typeof prepareClientReserveQuantity>;

    try {
      prepared = prepareClientReserveQuantity({
        productId: item.productId,
        packaging: product.packaging,
        quantity: {
          issueUnits: item.issueQuantity,
          looseBaseUnits: item.looseQuantity,
        },
      });
    } catch {
      throw new Error(
        `Packaging for ${item.name} cannot reproduce the saved count. ` +
          "Manager reconciliation is required.",
      );
    }

    if (
      prepared.normalizedQuantity !== item.normalizedQuantity ||
      prepared.normalizedUnit !== item.normalizedUnit
    ) {
      throw new Error(
        `Packaging for ${item.name} differs from the saved audit. ` +
          "The original quantities have been preserved. " +
          "Manager reconciliation is required.",
      );
    }

    recoveredProducts.push({
      ...product,
      packaging: { ...product.packaging },
    });
  }

  return recoveredProducts;
}
