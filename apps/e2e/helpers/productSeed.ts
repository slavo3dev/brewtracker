import { supabaseAdmin } from './supabaseAdmin';

export async function deleteProductByName(name: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('inventory_products').delete().eq('name', name);
  if (error) {
    throw new Error(`Unable to delete product: ${error.message}`);
  }
}
