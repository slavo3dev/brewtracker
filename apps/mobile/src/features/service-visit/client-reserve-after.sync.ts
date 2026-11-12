
import { saveClientReserveAfterService } from "./client-reserve-after.service";
import { saveServiceVisit } from "./service-visit.storage";

import type {
  ClientReserveAfterItemRecord,
  ServiceVisit,
} from "./service-visit.types";

export class ReserveAfterSyncError extends Error {
  visit: ServiceVisit;

  constructor(message: string, visit: ServiceVisit) {
    super(message);
    this.name = "ReserveAfterSyncError";
    this.visit = visit;
  }
}

export async function syncReserveAfter(
  visit: ServiceVisit,
): Promise<ServiceVisit> {
  if (
    visit.reserveAfter?.syncStatus === "synced" &&
    visit.reserveAfter.databaseId
  ) {
    return visit;
  }

  const inventoryAudit = visit.inventoryAudit;
  const clientDelivery = visit.restockDrop;

  if (
    !inventoryAudit ||
    inventoryAudit.syncStatus !== "synced" ||
    !inventoryAudit.databaseId
  ) {
    throw new Error(
      "Client reserve before service must be synced before calculating reserve after service.",
    );
  }

  if (
    !clientDelivery ||
    clientDelivery.syncStatus !== "synced" ||
    !clientDelivery.databaseId
  ) {
    throw new Error(
      "Client delivery must be synced before calculating reserve after service.",
    );
  }

  const deliveryByProduct = new Map(
    clientDelivery.items.map((item) => [
      item.productId,
      item.actualQuantity,
    ]),
  );

  const items: ClientReserveAfterItemRecord[] =
    inventoryAudit.items.map((item) => {
      const deliveredQuantity =
        deliveryByProduct.get(item.productId) ?? 0;

      return {
        productId: item.productId,
        reserveBeforeQuantity: item.normalizedQuantity,
        deliveredQuantity,
        reserveAfterQuantity:
          item.normalizedQuantity + deliveredQuantity,
        normalizedUnit: item.normalizedUnit,
      };
    });

  const calculatedAt =
    visit.reserveAfter?.calculatedAt ??
    new Date().toISOString();

  const pendingVisit: ServiceVisit = {
    ...visit,
    reserveAfter: {
      databaseId: null,
      sourceVisitId: visit.id,
      calculatedAt,
      items,
      syncStatus: "pending_sync",
      syncError: null,
    },
    updatedAt: new Date().toISOString(),
  };

  await saveServiceVisit(pendingVisit);

  try {
    const databaseId =
      await saveClientReserveAfterService({
        sourceVisitId: visit.id,
        clientId: visit.clientId,
        stopId: visit.stopId,
        machineId: visit.machineId,
        calculatedAt,
      });

    const syncedVisit: ServiceVisit = {
      ...pendingVisit,
      reserveAfter: {
        ...pendingVisit.reserveAfter!,
        databaseId,
        syncStatus: "synced",
        syncError: null,
      },
      updatedAt: new Date().toISOString(),
    };

    await saveServiceVisit(syncedVisit);

    return syncedVisit;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to sync client reserve after service.";

    const failedVisit: ServiceVisit = {
      ...pendingVisit,
      reserveAfter: {
        ...pendingVisit.reserveAfter!,
        syncStatus: "failed",
        syncError: message,
      },
      updatedAt: new Date().toISOString(),
    };

    await saveServiceVisit(failedVisit);

    throw new ReserveAfterSyncError(
      message,
      failedVisit,
    );
  }
}
