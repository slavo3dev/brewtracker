import type { Database } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";

import type {
  ClientDeliveryQuantityInput,
} from "./service-visit.types";

type DeliveryItems =
  Database["public"]["Functions"]["save_client_delivery"]["Args"]["p_items"];

export type SaveClientDeliveryInput = {
  sourceVisitId: string;

  clientId: string;
  stopId: string;
  machineId: string;

  confirmedAt: string;

  quantities: ClientDeliveryQuantityInput[];
};

export async function saveClientDelivery(
  input: SaveClientDeliveryInput,
): Promise<string> {
  if (!input.sourceVisitId.trim()) {
    throw new Error(
      "A service visit ID is required.",
    );
  }

  const productIds = new Set<string>();

  for (const item of input.quantities) {
    if (!item.productId.trim()) {
      throw new Error(
        "Every delivery entry must reference a product.",
      );
    }

    if (productIds.has(item.productId)) {
      throw new Error(
        "A product cannot appear more than once.",
      );
    }

    if (
      !Number.isFinite(item.issueQuantity) ||
      item.issueQuantity < 0 ||
      !Number.isInteger(item.issueQuantity)
    ) {
      throw new Error(
        "Every package quantity must be a whole number of zero or greater.",
      );
    }

    if (
      !Number.isFinite(item.looseQuantity) ||
      item.looseQuantity < 0
    ) {
      throw new Error(
        "Every loose quantity must be zero or greater.",
      );
    }

    productIds.add(item.productId);
  }

  const items: DeliveryItems =
    input.quantities.map((item) => ({
      product_id: item.productId,

      issue_quantity:
        item.issueQuantity,

      loose_quantity:
        item.looseQuantity,
    }));

  const { data, error } =
    await supabase.rpc(
      "save_client_delivery",
      {
        p_source_visit_id:
          input.sourceVisitId,

        p_client_id:
          input.clientId,

        p_stop_id:
          input.stopId,

        p_machine_id:
          input.machineId,

        p_confirmed_at:
          input.confirmedAt,

        p_items: items,
      },
    );

  if (error) {
    throw new Error(
      `Unable to sync the client delivery: ${error.message}`,
    );
  }

  if (
    typeof data !== "string" ||
    !data
  ) {
    throw new Error(
      "The client delivery was saved without a valid ID.",
    );
  }

  return data;
}