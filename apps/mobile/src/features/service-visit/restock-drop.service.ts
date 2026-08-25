import type { Database } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";

import type {
  RestockDropQuantityInput,
} from "./service-visit.types";

type RestockItems =
  Database["public"]["Functions"]["save_inventory_restock_drop"]["Args"]["p_items"];

export type SaveRestockDropInput = {
  sourceVisitId: string;
  inventoryAuditId: string;
  clientId: string;
  stopId: string;
  machineId: string;
  confirmedAt: string;
  quantities: RestockDropQuantityInput[];
};

export async function saveRestockDrop(
  input: SaveRestockDropInput,
): Promise<string> {
  if (!input.sourceVisitId.trim()) {
    throw new Error(
      "A service visit ID is required.",
    );
  }

  if (!input.inventoryAuditId.trim()) {
    throw new Error(
      "A synced inventory audit is required before restocking.",
    );
  }

  /*
   * FLOW-14:
   *
   * quantities: [] is valid.
   *
   * It means every audited product was already at or
   * above its configured par level.
   *
   * We still call the RPC because the parent
   * inventory_restock_drops record represents explicit
   * completion of the refill step.
   */

  const productIds =
    new Set<string>();

  for (const item of input.quantities) {
    if (!item.productId.trim()) {
      throw new Error(
        "Every restock entry must reference a product.",
      );
    }

    if (
      productIds.has(item.productId)
    ) {
      throw new Error(
        "A product cannot appear more than once.",
      );
    }

    if (
      !Number.isFinite(
        item.actualQuantity,
      ) ||
      item.actualQuantity < 0
    ) {
      throw new Error(
        "Every actual restock quantity must be zero or greater.",
      );
    }

    productIds.add(item.productId);
  }

  const items: RestockItems =
    input.quantities.map(
      (item) => ({
        product_id:
          item.productId,

        actual_quantity:
          item.actualQuantity,
      }),
    );

  const { data, error } =
    await supabase.rpc(
      "save_inventory_restock_drop",
      {
        p_source_visit_id:
          input.sourceVisitId,

        p_audit_id:
          input.inventoryAuditId,

        p_client_id:
          input.clientId,

        p_stop_id:
          input.stopId,

        p_machine_id:
          input.machineId,

        p_confirmed_at:
          input.confirmedAt,

        /*
         * [] intentionally represents
         * "No refill needed".
         */
        p_items: items,
      },
    );

  if (error) {
    throw new Error(
      `Unable to sync the restock drop: ${error.message}`,
    );
  }

  if (
    typeof data !== "string" ||
    !data
  ) {
    throw new Error(
      "The restock drop was saved without a valid ID.",
    );
  }

  return data;
}