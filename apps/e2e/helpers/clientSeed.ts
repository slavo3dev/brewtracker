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
    throw new Error(`Ne mogu da napravim test klijenta: ${error?.message}`);
  }
  return data.id;
}

export async function deleteTestClient(clientId: string) {
  const supabase = supabaseAdmin();
  await supabase.from('clients').delete().eq('id', clientId);
}
