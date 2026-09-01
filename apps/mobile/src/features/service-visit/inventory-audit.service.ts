import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";
import type { ClientInventoryProduct } from "./service-visit.types";

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

export type SaveClientReserveBeforeInput = {
  sourceVisitId: string;
  clientId: string;
  stopId: string;
  machineId: string;
  recordedAt: string;

  quantities: ClientReserveQuantityInput[];
};

export type ClientReserveQuantityInput = {
  productId: string;
  issueQuantity: number;
  looseQuantity: number;
};

export type ClientReservePreviousBalance = {
  productId: string;
  previousReserveAfter: number | null;
};

const CLIENT_PRODUCTS_CACHE_PREFIX = "brewtracker:client-inventory-products:v3";

function getCacheKey(clientId: string): string {
  return `${CLIENT_PRODUCTS_CACHE_PREFIX}:${clientId}`;
}

function validatePackaging(
  value: unknown,
): value is ClientInventoryProduct["packaging"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const packaging = value as Record<string, unknown>;

  return (
    typeof packaging.baseUnit === "string" &&
    packaging.baseUnit.trim().length > 0 &&
    typeof packaging.issueUnit === "string" &&
    packaging.issueUnit.trim().length > 0 &&
    typeof packaging.unitsPerIssueUnit === "number" &&
    Number.isFinite(packaging.unitsPerIssueUnit) &&
    packaging.unitsPerIssueUnit > 0 &&
    (packaging.packageDescription === null ||
      typeof packaging.packageDescription === "string") &&
    typeof packaging.allowsLooseUnits === "boolean" &&
    typeof packaging.allowsPartialBaseUnit === "boolean"
  );
}

function validateProducts(value: unknown): value is ClientInventoryProduct[] {
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
      (product.parLevel === null ||
        (typeof product.parLevel === "number" &&
          Number.isFinite(product.parLevel) &&
          product.parLevel >= 0)),
  );
}

async function readCachedProducts(
  clientId: string,
): Promise<ClientInventoryProduct[] | null> {
  const stored = await AsyncStorage.getItem(getCacheKey(clientId));

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
  await AsyncStorage.setItem(getCacheKey(clientId), JSON.stringify(products));
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
    .select(
      `
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
    `,
    )
    .eq("client_id", normalizedClientId)
    .eq("is_active", true)
    .order("display_order", {
      ascending: true,
    });

  if (error) {
    const cachedProducts = await readCachedProducts(normalizedClientId);

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
          unitsPerIssueUnit: Number(row.product.units_per_issue_unit),
          packageDescription: row.product.package_description,
          allowsLooseUnits: row.product.allows_loose_units,
          allowsPartialBaseUnit: row.product.allows_partial_base_unit,
        },

        displayOrder: row.display_order,
        isRequired: row.is_required,

        parLevel: row.par_level === null ? null : Number(row.par_level),
      },
    ];
  });

  await cacheProducts(normalizedClientId, products);

  return products;
}

export async function loadPreviousClientReserveBalances(
  clientId: string,
  products: ClientInventoryProduct[],
  before: string,
): Promise<Map<string, number | null>> {
  const balances = new Map<string, number | null>();

  await Promise.all(
    products.map(async (product) => {
      const { data, error } = await supabase.rpc(
        "get_previous_client_reserve_balance",
        {
          p_client_id: clientId,
          p_product_id: product.productId,
          p_before: before,
        },
      );

      if (error) {
        throw new Error(
          `Unable to load previous client reserve: ${error.message}`,
        );
      }

      balances.set(product.productId, data === null ? null : Number(data));
    }),
  );

  return balances;
}

export async function saveClientReserveBefore(
  input: SaveClientReserveBeforeInput,
): Promise<string> {
  if (!input.sourceVisitId.trim()) {
    throw new Error("A service visit ID is required.");
  }

  if (input.quantities.length === 0) {
    throw new Error("At least one client reserve quantity is required.");
  }

  for (const quantity of input.quantities) {
    if (!quantity.productId.trim()) {
      throw new Error("Every reserve quantity must reference a product.");
    }

    if (
      !Number.isFinite(quantity.issueQuantity) ||
      quantity.issueQuantity < 0 ||
      !Number.isInteger(quantity.issueQuantity)
    ) {
      throw new Error(
        "Package quantities must be whole numbers zero or greater.",
      );
    }

    if (
      !Number.isFinite(quantity.looseQuantity) ||
      quantity.looseQuantity < 0
    ) {
      throw new Error("Loose quantities must be zero or greater.");
    }
  }

  const { data, error } = await supabase.rpc(
    "save_client_reserve_before_service",
    {
      p_source_visit_id: input.sourceVisitId,

      p_client_id: input.clientId,

      p_stop_id: input.stopId,

      p_machine_id: input.machineId,

      p_recorded_at: input.recordedAt,

      p_items: input.quantities.map((quantity) => ({
        product_id: quantity.productId,

        issue_quantity: quantity.issueQuantity,

        loose_quantity: quantity.looseQuantity,
      })),
    },
  );

  if (error) {
    throw new Error(`Unable to save client reserve: ${error.message}`);
  }

  if (typeof data !== "string" || !data) {
    throw new Error("Client reserve was saved without a valid ID.");
  }

  return data;
}
