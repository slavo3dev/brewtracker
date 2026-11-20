import { prepareClientReserveQuantity } from "@brewtracker/types";

import { saveClientReserveBefore } from "./inventory-audit.service";
import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";

export async function syncUnifiedInventoryAudit(
  visit: MultiMachineServiceVisit,
): Promise<string> {
  const audit = visit.inventoryAudit;

  if (!audit || audit.sourceVisitId !== visit.id) {
    throw new Error("No valid inventory audit is available to synchronize.");
  }

  if (audit.syncStatus === "synced") {
    if (!audit.databaseId) {
      throw new Error("Synchronized inventory audit has no database ID.");
    }

    return audit.databaseId;
  }

  if (!audit.items.length || !audit.configuredProducts?.length) {
    throw new Error(
      "The saved inventory audit is missing its original product configuration.",
    );
  }

  const productsById = new Map(
    audit.configuredProducts.map((product) => [product.productId, product]),
  );

  const seen = new Set<string>();

  const quantities = audit.items.map((item) => {
    if (seen.has(item.productId)) {
      throw new Error("The saved inventory audit contains duplicate products.");
    }

    seen.add(item.productId);

    const product = productsById.get(item.productId);

    if (!product) {
      throw new Error(
        `Original packaging is missing for product ${item.productId}.`,
      );
    }

    const prepared = prepareClientReserveQuantity({
      productId: item.productId,
      packaging: product.packaging,
      quantity: {
        issueUnits: item.issueQuantity,
        looseBaseUnits: item.looseQuantity,
      },
    });

    if (
      prepared.normalizedQuantity !== item.normalizedQuantity ||
      prepared.normalizedUnit !== item.normalizedUnit
    ) {
      throw new Error(
        `Saved inventory quantities do not match original packaging for product ${item.productId}.`,
      );
    }

    return {
      productId: item.productId,
      issueQuantity: item.issueQuantity,
      looseQuantity: item.looseQuantity,
      expectedPackaging: product.packaging,
    };
  });

  const machineId =
    visit.machines.length === 1 ? visit.machines[0].machineId : null;

  return saveClientReserveBefore({
    sourceVisitId: audit.sourceVisitId,
    clientId: visit.clientId,
    stopId: visit.stopId,
    machineId,
    recordedAt: audit.countedAt,
    quantities,
  });
}
