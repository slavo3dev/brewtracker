"use server";

import { revalidatePath } from "next/cache";

import { requireInventoryManager } from
  "@/lib/auth/require-inventory-manager";
import { createClient } from "@/lib/supabase/server";

type AssignClientProductInput = {
  clientId: string;
  productId: string;
  parLevel: number | null;
  isRequired: boolean;
};

export async function assignClientProduct(
  input: AssignClientProductInput,
): Promise<void> {
  await requireInventoryManager();

  if (!input.clientId || !input.productId) {
    throw new Error("Client and product are required.");
  }

  if (
    input.parLevel !== null &&
    (!Number.isFinite(input.parLevel) ||
      input.parLevel < 0)
  ) {
    throw new Error(
      "Par level must be a non-negative number.",
    );
  }

  const supabase = await createClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, business_type")
    .eq("id", input.clientId)
    .single();

  if (clientError || !client) {
    throw new Error("Client not found or access denied.");
  }

  const { data: product, error: productError } = await supabase
    .from("inventory_products")
    .select("id, is_active")
    .eq("id", input.productId)
    .single();

  if (productError || !product?.is_active) {
    throw new Error("Product not found or inactive.");
  }

  const { data: eligibility, error: eligibilityError } =
    await supabase
      .from("inventory_product_business_types")
      .select("product_id")
      .eq("product_id", input.productId)
      .eq("business_type", client.business_type)
      .maybeSingle();

  if (eligibilityError || !eligibility) {
    throw new Error(
      "This product is not eligible for the client's business type.",
    );
  }

  const { error } = await supabase
    .from("client_inventory_products")
    .insert({
      client_id: input.clientId,
      product_id: input.productId,
      par_level: input.parLevel,
      is_required: input.isRequired,
      is_active: true,
    });

  if (error) {
    throw new Error(
      `Unable to assign product: ${error.message}`,
    );
  }

  revalidatePath(`/dashboard/clients/${input.clientId}`);
}