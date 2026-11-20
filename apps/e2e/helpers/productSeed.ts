import { supabaseAdmin } from './supabaseAdmin';

// create_inventory_product() is SECURITY INVOKER and explicitly requires auth.uid() to be a
// manager/CEO — the service-role key has no auth.uid() at all, so it always rejects this RPC.
// Insert directly into the same two tables the RPC writes to instead (same pattern as
// deleteProductByName() below).
export async function createTestProduct(params: {
  name: string;
  businessTypes: Array<'ocs' | 'horeca'>;
  sku?: string;
  category?: 'coffee' | 'powders' | 'sweeteners_stirrers' | 'cups_lids' | 'creamers' | 'cleaning';
  unitLabel?: string;
  baseUnit?: string;
  issueUnit?: string;
  unitsPerIssueUnit?: number;
}): Promise<string> {
  const supabase = supabaseAdmin();
  const { data: product, error: productError } = await supabase
    .from('inventory_products')
    .insert({
      name: params.name,
      sku: params.sku ?? null,
      category: params.category ?? 'coffee',
      unit_label: params.unitLabel ?? 'bags',
      base_unit: params.baseUnit ?? 'bag',
      issue_unit: params.issueUnit ?? 'case',
      units_per_issue_unit: params.unitsPerIssueUnit ?? 6,
      allows_loose_units: false,
      allows_partial_base_unit: false,
      sort_order: 999,
      is_active: true,
    })
    .select('id')
    .single();

  if (productError || !product) {
    throw new Error(`Unable to create the test product: ${productError?.message}`);
  }

  const { error: availabilityError } = await supabase.from('inventory_product_business_types').insert(
    params.businessTypes.map((businessType) => ({
      product_id: product.id,
      business_type: businessType,
    })),
  );

  if (availabilityError) {
    throw new Error(`Unable to set product business-type availability: ${availabilityError.message}`);
  }

  return product.id as string;
}

export async function deleteProductByName(name: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('inventory_products').delete().eq('name', name);
  if (error) {
    throw new Error(`Unable to delete product: ${error.message}`);
  }
}
