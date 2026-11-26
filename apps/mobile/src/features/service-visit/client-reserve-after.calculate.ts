import type {
  ClientReserveAfterItemRecord,
} from "./service-visit.types";

type ReserveBeforeItem = {
  productId: string;
  normalizedQuantity: number;
  normalizedUnit: string;
};

type DeliveredItem = {
  productId: string;
  actualQuantity: number;
};

export function calculateClientReserveAfter(
  inventoryItems: ReserveBeforeItem[],
  deliveryItems: DeliveredItem[],
): ClientReserveAfterItemRecord[] {
  const deliveryByProduct = new Map<string, number>();

  for (const item of deliveryItems) {
    deliveryByProduct.set(
      item.productId,
      (deliveryByProduct.get(item.productId) ?? 0) +
        item.actualQuantity,
    );
  }

  return inventoryItems.map((item) => {
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
}