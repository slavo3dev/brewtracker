import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";
import type {
  ClientInventoryProduct,
  InventoryAuditCountInput,
} from "./service-visit.types";

type Json =
  Database["public"]["Functions"]["save_inventory_audit"]["Args"]["p_items"];

type ClientProductQueryRow = {
  display_order: number;
  is_required: boolean;
  product: {
    id: string;
    sku: string | null;
    name: string;
    category: ClientInventoryProduct["category"];
    unit_label: string;
  } | null;
};

export type SaveInventoryAuditInput = {
  sourceVisitId: string;
  clientId: string;
  stopId: string;
  machineId: string;
  countedAt: string;
  counts: InventoryAuditCountInput[];
};

const CLIENT_PRODUCTS_CACHE_PREFIX =
  "brewtracker:client-inventory-products:v1";

function getCacheKey(clientId: string): string {
  return `${CLIENT_PRODUCTS_CACHE_PREFIX}:${clientId}`;
}

function validateProducts(
  value: unknown,
): value is ClientInventoryProduct[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every(
    (product) =>
      typeof product === "object" &&
      product !== null &&
      typeof product.productId === "string" &&
      typeof product.name === "string" &&
      typeof product.unitLabel === "string" &&
      typeof product.displayOrder === "number" &&
      typeof product.isRequired === "boolean",
  );
}

async function readCachedProducts(
  clientId: string,
): Promise<ClientInventoryProduct[] | null> {
  const stored = await AsyncStorage.getItem(
    getCacheKey(clientId),
  );

  if (!stored) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);

    return validateProducts(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function cacheProducts(
  clientId: string,
  products: ClientInventoryProduct[],
): Promise<void> {
  await AsyncStorage.setItem(
    getCacheKey(clientId),
    JSON.stringify(products),
  );
}

export async function loadClientInventoryProducts(
  clientId: string,
): Promise<ClientInventoryProduct[]> {
  const normalizedClientId = clientId.trim();

  if (!normalizedClientId) {
    throw new Error("A client ID is required.");
  }

  const { data, error } = await supabase
    .from("client_inventory_products")
    .select(`
      display_order,
      is_required,
      product:inventory_products!client_inventory_products_product_id_fkey (
        id,
        sku,
        name,
        category,
        unit_label
      )
    `)
    .eq("client_id", normalizedClientId)
    .eq("is_active", true)
    .order("display_order", {
      ascending: true,
    });

  if (error) {
    const cachedProducts =
      await readCachedProducts(normalizedClientId);

    if (cachedProducts) {
      return cachedProducts;
    }

    throw new Error(
      `Unable to load the client inventory list: ${error.message}`,
    );
  }

  const rows = (data ?? []) as ClientProductQueryRow[];

  const products = rows.flatMap((row) => {
    if (!row.product) {
      return [];
    }

    return [
      {
        productId: row.product.id,
        sku: row.product.sku,
        name: row.product.name,
        category: row.product.category,
        unitLabel: row.product.unit_label,
        displayOrder: row.display_order,
        isRequired: row.is_required,
      },
    ];
  });

  await cacheProducts(normalizedClientId, products);

  return products;
}

export async function saveInventoryAudit(
  input: SaveInventoryAuditInput,
): Promise<string> {
  if (!input.sourceVisitId.trim()) {
    throw new Error("A service visit ID is required.");
  }

  if (input.counts.length === 0) {
    throw new Error("At least one inventory count is required.");
  }

  for (const count of input.counts) {
    if (
      !count.productId.trim() ||
      !Number.isFinite(count.quantity) ||
      count.quantity < 0
    ) {
      throw new Error(
        "Every product must have a valid non-negative quantity.",
      );
    }
  }

  const items: Json = input.counts.map((count) => ({
    product_id: count.productId,
    quantity: count.quantity,
  }));

  const { data, error } = await supabase.rpc(
    "save_inventory_audit",
    {
      p_source_visit_id: input.sourceVisitId,
      p_client_id: input.clientId,
      p_stop_id: input.stopId,
      p_machine_id: input.machineId,
      p_counted_at: input.countedAt,
      p_items: items,
    },
  );

  if (error) {
    throw new Error(
      `Unable to sync the inventory audit: ${error.message}`,
    );
  }

  if (typeof data !== "string" || !data) {
    throw new Error(
      "The inventory audit was saved without a valid ID.",
    );
  }

  return data;
}