import type { Database } from "@brewtracker/types";

import { createAdminClient } from "@/lib/supabase/admin";

export type Client = Database["public"]["Tables"]["clients"]["Row"];

export type CreateClientInput = Pick<
  Database["public"]["Tables"]["clients"]["Insert"],
  | "name"
  | "business_type"
  | "address"
  | "city"
  | "region"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "service_email"
  | "latitude"
  | "longitude"
  | "geofence_radius_meters"
>;

export type ClientInventoryAssignment =
  Database["public"]["Tables"]["client_inventory_products"]["Row"] & {
    product: {
      id: string;
      name: string;
      sku: string | null;
      base_unit: string;
      issue_unit: string;
      units_per_issue_unit: number;
    };
  };

export type EligibleClientProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: Database["public"]["Enums"]["inventory_product_category"];
  base_unit: string;
  issue_unit: string;
  units_per_issue_unit: number;
};

export async function getClients(): Promise<Client[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load clients: ${error.message}`);
  }

  return data ?? [];
}

export async function getClientById(clientId: string): Promise<Client | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load client: ${error.message}`);
  }

  return data;
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("clients")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Unable to create client: ${error.message}`);
  }

  return data;
}

export async function updateClient(
  clientId: string,
  input: CreateClientInput,
): Promise<Client> {
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from("clients")
    .update(input)
    .eq("id", clientId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getClientInventoryAssignments(
  clientId: string,
): Promise<ClientInventoryAssignment[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("client_inventory_products")
    .select(
      `
      *,
      product:inventory_products!client_inventory_products_product_id_fkey (
        id,
        name,
        sku,
        base_unit,
        issue_unit,
        units_per_issue_unit
      )
    `,
    )
    .eq("client_id", clientId)
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(
      `Unable to load client inventory assignments: ${error.message}`,
    );
  }

  return (data ?? []) as ClientInventoryAssignment[];
}

export async function getEligibleClientProducts(
  clientId: string,
): Promise<EligibleClientProduct[]> {
  const supabase = createAdminClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("business_type")
    .eq("id", clientId)
    .single();

  if (clientError) {
    throw new Error(
      `Unable to load client business type: ${clientError.message}`,
    );
  }

  const { data: availability, error: availabilityError } = await supabase
    .from("inventory_product_business_types")
    .select("product_id")
    .eq("business_type", client.business_type);

  if (availabilityError) {
    throw new Error(
      `Unable to load eligible products: ${availabilityError.message}`,
    );
  }

  const productIds = (availability ?? []).map((item) => item.product_id);

  if (productIds.length === 0) {
    return [];
  }

  const { data: products, error: productsError } = await supabase
    .from("inventory_products")
    .select(
      `
      id,
      name,
      sku,
      category,
      base_unit,
      issue_unit,
      units_per_issue_unit
    `,
    )
    .eq("is_active", true)
    .in("id", productIds)
    .order("name", { ascending: true });

  if (productsError) {
    throw new Error(
      `Unable to load inventory products: ${productsError.message}`,
    );
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("client_inventory_products")
    .select("product_id")
    .eq("client_id", clientId);

  if (assignmentsError) {
    throw new Error(
      `Unable to load existing assignments: ${assignmentsError.message}`,
    );
  }

  const assignedProductIds = new Set(
    (assignments ?? []).map((item) => item.product_id),
  );

  return (products ?? []).filter(
    (product) => !assignedProductIds.has(product.id),
  );
}
