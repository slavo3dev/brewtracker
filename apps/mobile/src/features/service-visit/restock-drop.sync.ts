import { saveClientDelivery } from "./restock-drop.service";
import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";

export async function syncUnifiedRestockDrop(
  visit: MultiMachineServiceVisit,
): Promise<string> {
  if (visit.status !== "in_progress" || visit.currentStep !== "restock") {
    throw new Error("Client delivery can only synchronize during Restock.");
  }

  const delivery = visit.restockDrop;

  if (!delivery || delivery.sourceVisitId !== visit.id) {
    throw new Error("No valid client delivery is available to synchronize.");
  }

  if (delivery.syncStatus === "synced") {
    if (!delivery.databaseId) {
      throw new Error("Synchronized client delivery has no database ID.");
    }

    return delivery.databaseId;
  }

  if (
    !visit.inventoryAudit ||
    visit.inventoryAudit.syncStatus !== "synced" ||
    !visit.inventoryAudit.databaseId
  ) {
    throw new Error(
      "Client reserve audit must be synchronized before delivery.",
    );
  }

  if (!visit.machines.length) {
    throw new Error("The service visit has no assigned machines.");
  }

  const seen = new Set<string>();

  const quantities = delivery.items.map((item) => {
    if (!item.productId.trim() || seen.has(item.productId)) {
      throw new Error("Saved delivery contains invalid or duplicate products.");
    }

    seen.add(item.productId);

    if (
      !Number.isInteger(item.issueQuantity) ||
      item.issueQuantity < 0 ||
      !Number.isFinite(item.looseQuantity) ||
      item.looseQuantity < 0
    ) {
      throw new Error("Saved delivery contains invalid quantities.");
    }

    return {
      productId: item.productId,
      issueQuantity: item.issueQuantity,
      looseQuantity: item.looseQuantity,
    };
  });

  const machineId =
    visit.machines.length === 1 ? visit.machines[0].machineId : null;

  return saveClientDelivery({
    sourceVisitId: delivery.sourceVisitId,
    clientId: visit.clientId,
    stopId: visit.stopId,
    machineId,
    confirmedAt: delivery.confirmedAt,
    quantities,
  });
}
