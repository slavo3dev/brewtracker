import { supabaseAdmin } from './supabaseAdmin';

export async function createTestClient(params: {
  name: string;
  businessType?: 'ocs' | 'horeca';
  region?: string;
  city?: string;
}): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: params.name,
      business_type: params.businessType ?? 'ocs',
      region: params.region ?? null,
      city: params.city ?? null,
      geofence_radius_meters: 100,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create the test client: ${error?.message}`);
  }
  return data.id;
}

export async function deleteTestClient(clientId: string) {
  const supabase = supabaseAdmin();

  // Every client automatically gets a "Client Reserve" row in inventory_locations
  // (client_id has ON DELETE RESTRICT, not CASCADE) — deleting the client without removing
  // this first always fails with a silently-swallowed FK violation, leaking the client
  // permanently in the shared QA database.
  const { error: locationError } = await supabase.from('inventory_locations').delete().eq('client_id', clientId);
  if (locationError) {
    throw new Error(`Unable to delete the client's inventory location: ${locationError.message}`);
  }

  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) {
    throw new Error(`Unable to delete the test client: ${error.message}`);
  }
}
