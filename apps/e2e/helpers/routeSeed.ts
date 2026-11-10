import { supabaseAdmin } from './supabaseAdmin';

// "Latest scheduled route" nije pouzdan izbor za konkretnu, upravo kreiranu rutu — druga ruta
// za istog vozača/dan može biti upisana pre ove (ili ova nikad nije ni napravljena ako je UI
// korak pre ovog poziva pao). Jedinstveni noteTag je jedini siguran način da pogodimo BAŠ nju.
export async function getRouteIdByNotes(notes: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data } = await supabase.from('routes').select('id').eq('notes', notes).maybeSingle();
  return data?.id ?? null;
}

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

// Simulira rutu generisanu iz recurring template-a (taj cron posao ne pokrećemo u testovima) —
// koristi se za WEB-RT-10 koji provera da se "Recurring" bedž ispravno prikazuje.
export async function createTemplateGeneratedRoute(
  driverId: string,
  warehouseId: string,
  templateId: string,
  routeDateIso: string,
): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('routes')
    .insert({
      driver_id: driverId,
      warehouse_id: warehouseId,
      route_date: routeDateIso,
      status: 'scheduled',
      source_route_template_id: templateId,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Ne mogu da napravim template-generisanu rutu: ${error?.message}`);
  }
  return data.id;
}

export async function deleteRoute(routeId: string) {
  const supabase = supabaseAdmin();
  await supabase.from('routes').delete().eq('id', routeId);
}

// Čisti preduslov za testove generisanja ruta iz template-a (npr. WEB-TPL-20): otkazuje SAMO
// "osirotele" SCHEDULED rute (ostale iz nekog ranijeg prekinutog pokretanja ISTOG testa) koje
// bi inače trajno blokirale generisanje. driver+date+machine+status SAM po sebi nije dovoljno
// precizan identifikator — mogao bi pogoditi i tuđu, legitimnu zakazanu rutu za istog deljenog
// vozača na istoj mašini. notesPrefix (npr. "QA-TPL-20-") dodatno suzi na rute koje je BAŠ ovaj
// test ranije tagovao, bez obzira na timestamp iz tog ranijeg pokretanja. Namerno NE dira
// in_progress/completed rute — to bi prepisalo stvarnu servisnu istoriju, mimo
// cancel_operational_route lifecycle provera (ovo je direktan admin upis, bez tih provera).
export async function cancelRoutesForMachine(
  driverId: string,
  routeDateIso: string,
  machineId: string,
  notesPrefix: string,
) {
  const supabase = supabaseAdmin();
  const { data: stops, error: stopsError } = await supabase
    .from('stops')
    .select('route_id, route:routes!inner(id,status,route_date,driver_id,notes)')
    .eq('machine_id', machineId)
    .eq('route.driver_id', driverId)
    .eq('route.route_date', routeDateIso)
    .eq('route.status', 'scheduled')
    .ilike('route.notes', `${notesPrefix}%`);

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
