import { supabaseAdmin } from './supabaseAdmin';

export async function getLatestScheduledRouteId(driverId: string, routeDateIso: string): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('routes')
    .select('id')
    .eq('driver_id', driverId)
    .eq('route_date', routeDateIso)
    .eq('status', 'scheduled')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Ne mogu da nađem zakazanu rutu za vozača: ${error?.message}`);
  }
  return data.id;
}

/**
 * Direktno (preko baze) označava prvu stanicu te rute kao "započetu" — simulira
 * da je vozač stigao na lokaciju, iako je UI za to dostupan samo preko mobilne aplikacije.
 */
export async function markFirstStopAsStarted(routeId: string) {
  const supabase = supabaseAdmin();
  const { data: stop, error: stopError } = await supabase
    .from('stops')
    .select('id')
    .eq('route_id', routeId)
    .limit(1)
    .single();

  if (stopError || !stop) {
    throw new Error(`Ne mogu da nađem stanicu za rutu: ${stopError?.message}`);
  }

  const { error } = await supabase
    .from('stops')
    .update({ status: 'in_progress', arrived_at: new Date().toISOString() })
    .eq('id', stop.id);

  if (error) {
    throw new Error(`Ne mogu da označim stanicu kao započetu: ${error.message}`);
  }
}

// UI nema put da rutu postavi u "in_progress" (to radi samo mobilna app tokom servisiranja),
// pa taj prelaz radimo direktno preko baze, kao i vraćanje na "scheduled" nakon testa.
export async function setRouteStatus(routeId: string, status: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('routes').update({ status }).eq('id', routeId);
  if (error) {
    throw new Error(`Ne mogu da promenim status rute: ${error.message}`);
  }
}

// Čisti preduslov za testove generisanja ruta iz template-a (npr. WEB-TPL-20): otkazuje SVE
// postojeće neotkazane rute za tog vozača/datum koje sadrže datu mašinu, da bi test sam
// kontrolisao jedini konflikt koji namerno pravi — bez ovoga, "osirotela" ruta ostala iz
// nekog ranijeg prekinutog pokretanja može trajno blokirati generisanje.
export async function cancelRoutesForMachine(driverId: string, routeDateIso: string, machineId: string) {
  const supabase = supabaseAdmin();
  const { data: stops, error: stopsError } = await supabase
    .from('stops')
    .select('route_id, route:routes!inner(id,status,route_date,driver_id)')
    .eq('machine_id', machineId)
    .eq('route.driver_id', driverId)
    .eq('route.route_date', routeDateIso)
    .neq('route.status', 'cancelled');

  if (stopsError) {
    throw new Error(`Ne mogu da nađem konfliktne rute: ${stopsError.message}`);
  }

  const routeIds = [...new Set((stops ?? []).map((s) => s.route_id))];
  if (routeIds.length === 0) return;

  const { error } = await supabase.from('routes').update({ status: 'cancelled' }).in('id', routeIds);
  if (error) {
    throw new Error(`Ne mogu da otkažem konfliktne rute: ${error.message}`);
  }
}
