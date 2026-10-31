"use server";

import type { Database } from "@brewtracker/types";
import { revalidatePath } from "next/cache";

import { requireInventoryManager } from "@/lib/auth/require-inventory-manager";
import { createClient } from "@/lib/supabase/server";

type ProductCategory =
  Database["public"]["Enums"]["inventory_product_category"];

type BusinessType =
  Database["public"]["Enums"]["inventory_business_type"];

export type CreateProductInput = {
  name: string;
  sku: string | null;
  category: ProductCategory;
  unitLabel: string;
  baseUnit: string;
  issueUnit: string;
  unitsPerIssueUnit: number;
  packageDescription: string | null;
  allowsLooseUnits: boolean;
  allowsPartialBaseUnit: boolean;
  sortOrder: number;
  isActive: boolean;
  businessTypes: BusinessType[];
};

export type UpdateProductInput = CreateProductInput & {
  productId: string;
};

const PRODUCT_CATEGORIES: ProductCategory[] = [
  "coffee",
  "powders",
  "sweeteners_stirrers",
  "cups_lids",
  "creamers",
  "cleaning",
];

const BUSINESS_TYPES: BusinessType[] = [
  "ocs",
  "horeca",
];

function hasSupportedQuantityPrecision(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-8
  );
}

export async function createInventoryProduct(
  input: CreateProductInput,
): Promise<string> {
  await requireInventoryManager();

  const name = input.name.trim();
  const unitLabel = input.unitLabel.trim();
  const baseUnit = input.baseUnit.trim();
  const issueUnit = input.issueUnit.trim();
  const sku = input.sku?.trim() || null;
  const packageDescription =
    input.packageDescription?.trim() || null;

  if (!name || !unitLabel || !baseUnit || !issueUnit) {
    throw new Error("Required product fields cannot be empty.");
  }

  if (!PRODUCT_CATEGORIES.includes(input.category)) {
    throw new Error("Invalid product category.");
  }

  if (
    !Array.isArray(input.businessTypes) ||
    input.businessTypes.length === 0 ||
    new Set(input.businessTypes).size !==
      input.businessTypes.length ||
    !input.businessTypes.every((type) =>
      BUSINESS_TYPES.includes(type),
    )
  ) {
    throw new Error(
      "Select at least one valid business type without duplicates.",
    );
  }

  if (
    !Number.isFinite(input.unitsPerIssueUnit) ||
    input.unitsPerIssueUnit <= 0
  ) {
    throw new Error(
      "Units per issue unit must be greater than zero.",
    );
  }

  if (!hasSupportedQuantityPrecision(input.unitsPerIssueUnit)) {
    throw new Error(
      "Units per issue unit must use no more than 3 decimal places.",
    );
  }

  if (
    !input.allowsPartialBaseUnit &&
    !Number.isInteger(input.unitsPerIssueUnit)
  ) {
    throw new Error(
      "Whole base units require an integer conversion.",
    );
  }

  if (
    input.allowsLooseUnits &&
    input.unitsPerIssueUnit <= 1
  ) {
    throw new Error(
      "Loose units require more than one base unit per issue unit.",
    );
  }

  if (
    !Number.isSafeInteger(input.sortOrder)
  ) {
    throw new Error("Sort order must be an integer.");
  }

  if (
    typeof input.allowsLooseUnits !== "boolean" ||
    typeof input.allowsPartialBaseUnit !== "boolean" ||
    typeof input.isActive !== "boolean"
  ) {
    throw new Error("Invalid product configuration.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "create_inventory_product",
    {
      p_name: name,
      p_sku: sku ?? undefined,
      p_category: input.category,
      p_unit_label: unitLabel,
      p_base_unit: baseUnit,
      p_issue_unit: issueUnit,
      p_units_per_issue_unit: input.unitsPerIssueUnit,
      p_package_description: packageDescription ?? undefined,
      p_allows_loose_units: input.allowsLooseUnits,
      p_allows_partial_base_unit:
        input.allowsPartialBaseUnit,
      p_sort_order: input.sortOrder,
      p_is_active: input.isActive,
      p_business_types: input.businessTypes,
    },
  );

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "A product with this SKU already exists.",
      );
    }

    if (error.code === "42501") {
      throw new Error(
        "You do not have permission to create inventory products.",
      );
    }

    throw new Error(
      `Unable to create product: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Product creation did not return a product ID.",
    );
  }

  revalidatePath("/dashboard/inventory");

  return data;
}


export async function updateInventoryProduct(
  input: UpdateProductInput,
): Promise<string> {
  await requireInventoryManager();

  if (
    typeof input.productId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.productId,
    )
  ) {
    throw new Error("Invalid product ID.");
  }

  const name = input.name.trim();
  const unitLabel = input.unitLabel.trim();
  const baseUnit = input.baseUnit.trim();
  const issueUnit = input.issueUnit.trim();
  const sku = input.sku?.trim() || null;
  const packageDescription =
    input.packageDescription?.trim() || null;

  if (!name || !unitLabel || !baseUnit || !issueUnit) {
    throw new Error("Required product fields cannot be empty.");
  }

  if (!PRODUCT_CATEGORIES.includes(input.category)) {
    throw new Error("Invalid product category.");
  }

  if (
    !Array.isArray(input.businessTypes) ||
    input.businessTypes.length === 0 ||
    new Set(input.businessTypes).size !==
      input.businessTypes.length ||
    !input.businessTypes.every((type) =>
      BUSINESS_TYPES.includes(type),
    )
  ) {
    throw new Error(
      "Select at least one valid business type without duplicates.",
    );
  }

  if (
    !Number.isFinite(input.unitsPerIssueUnit) ||
    input.unitsPerIssueUnit <= 0
  ) {
    throw new Error(
      "Units per issue unit must be greater than zero.",
    );
  }

  if (!hasSupportedQuantityPrecision(input.unitsPerIssueUnit)) {
    throw new Error(
      "Units per issue unit must use no more than 3 decimal places.",
    );
  }

  if (
    !input.allowsPartialBaseUnit &&
    !Number.isInteger(input.unitsPerIssueUnit)
  ) {
    throw new Error(
      "Whole base units require an integer conversion.",
    );
  }

  if (
    input.allowsLooseUnits &&
    input.unitsPerIssueUnit <= 1
  ) {
    throw new Error(
      "Loose units require more than one base unit per issue unit.",
    );
  }

  if (!Number.isSafeInteger(input.sortOrder)) {
    throw new Error("Sort order must be an integer.");
  }

  if (
    typeof input.allowsLooseUnits !== "boolean" ||
    typeof input.allowsPartialBaseUnit !== "boolean" ||
    typeof input.isActive !== "boolean"
  ) {
    throw new Error("Invalid product configuration.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "update_inventory_product",
    {
      p_product_id: input.productId,
      p_name: name,
      p_sku: sku ?? undefined,
      p_category: input.category,
      p_unit_label: unitLabel,
      p_base_unit: baseUnit,
      p_issue_unit: issueUnit,
      p_units_per_issue_unit: input.unitsPerIssueUnit,
      p_package_description:
        packageDescription ?? undefined,
      p_allows_loose_units: input.allowsLooseUnits,
      p_allows_partial_base_unit:
        input.allowsPartialBaseUnit,
      p_sort_order: input.sortOrder,
      p_is_active: input.isActive,
      p_business_types: input.businessTypes,
    },
  );

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "A product with this SKU already exists.",
      );
    }

    if (error.code === "23514") {
      throw new Error(
        "This update violates an inventory safeguard. " +
          "Packaging cannot be changed after inventory movements exist.",
      );
    }

    if (error.code === "42501") {
      throw new Error(
        "You do not have permission to update inventory products.",
      );
    }

    if (error.code === "P0002") {
      throw new Error("Inventory product not found.");
    }

    throw new Error(
      `Unable to update product: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Product update did not return a product ID.",
    );
  }

  revalidatePath("/dashboard/inventory");

  return data;
}
