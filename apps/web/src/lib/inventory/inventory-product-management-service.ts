import type { Database } from "@brewtracker/types";

import { createAdminClient } from "@/lib/supabase/admin";

type ProductRow =
  Database["public"]["Tables"]["inventory_products"]["Row"];

type BusinessType =
  Database["public"]["Enums"]["inventory_business_type"];

export type ManagedInventoryProduct = ProductRow & {
  businessTypes: BusinessType[];
};

export async function getManagedInventoryProducts(): Promise<
  ManagedInventoryProduct[]
> {
  const supabase = createAdminClient();

  const [productsResult, availabilityResult] =
    await Promise.all([
      supabase
        .from("inventory_products")
        .select("*")
        .order("sort_order")
        .order("name"),

      supabase
        .from("inventory_product_business_types")
        .select("product_id, business_type"),
    ]);

  if (productsResult.error) {
    throw new Error(
      `Unable to load products: ${productsResult.error.message}`,
    );
  }

  if (availabilityResult.error) {
    throw new Error(
      `Unable to load product availability: ${availabilityResult.error.message}`,
    );
  }

  const availabilityByProduct = new Map<
    string,
    BusinessType[]
  >();

  for (const item of availabilityResult.data ?? []) {
    const existing =
      availabilityByProduct.get(item.product_id) ?? [];

    existing.push(item.business_type);

    availabilityByProduct.set(
      item.product_id,
      existing,
    );
  }

  return (productsResult.data ?? []).map((product) => ({
    ...product,
    businessTypes:
      availabilityByProduct.get(product.id) ?? [],
  }));
}