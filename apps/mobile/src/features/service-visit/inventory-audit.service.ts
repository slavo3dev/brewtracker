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
  par_level: number | string | null;
  product: {
    id: string;
    sku: string | null;
    name: string;
    category: ClientInventoryProduct["category"];

    unit_label: string;

    base_unit: string;
    issue_unit: string;
    units_per_issue_unit: number | string;
    package_description: string | null;
    allows_loose_units: boolean;
    allows_partial_base_unit: boolean;
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
  "brewtracker:client-inventory-products:v3";

function getCacheKey(clientId: string): string {
  return `${CLIENT_PRODUCTS_CACHE_PREFIX}:${clientId}`;
}

function validatePackaging(
  value: unknown,
): value is ClientInventoryProduct["packaging"] {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const packaging =
    value as Record<string, unknown>;

  return (
    typeof packaging.baseUnit === "string" &&
    packaging.baseUnit.trim().length > 0 &&
    typeof packaging.issueUnit === "string" &&
    packaging.issueUnit.trim().length > 0 &&
    typeof packaging.unitsPerIssueUnit === "number" &&
    Number.isFinite(packaging.unitsPerIssueUnit) &&
    packaging.unitsPerIssueUnit > 0 &&
    (
      packaging.packageDescription === null ||
      typeof packaging.packageDescription === "string"
    ) &&
    typeof packaging.allowsLooseUnits === "boolean" &&
    typeof packaging.allowsPartialBaseUnit === "boolean"
  );
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
      validatePackaging(product.packaging) &&
      typeof product.displayOrder === "number" &&
      typeof product.isRequired === "boolean" &&
      (
        product.parLevel === null ||
        (
          typeof product.parLevel === "number" &&
          Number.isFinite(product.parLevel) &&
          product.parLevel >= 0
        )
      ),
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
      par_level,
      product:inventory_products!client_inventory_products_product_id_fkey (
        id,
        sku,
        name,
        category,
        unit_label,
        base_unit,
        issue_unit,
        units_per_issue_unit,
        package_description,
        allows_loose_units,
        allows_partial_base_unit
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

        packaging: {
          baseUnit: row.product.base_unit,
          issueUnit: row.product.issue_unit,
          unitsPerIssueUnit: Number(
            row.product.units_per_issue_unit,
          ),
          packageDescription:
            row.product.package_description,
          allowsLooseUnits:
            row.product.allows_loose_units,
          allowsPartialBaseUnit:
            row.product.allows_partial_base_unit,
        },

        displayOrder: row.display_order,
        isRequired: row.is_required,

        parLevel:
          row.par_level === null
            ? null
            : Number(row.par_level),
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