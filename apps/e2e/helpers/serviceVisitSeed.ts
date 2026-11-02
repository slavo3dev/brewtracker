import { supabaseAdmin } from './supabaseAdmin';

const WAREHOUSE_ID = '44681daa-bcc0-4570-b2b3-289cd78aba17'; // Genova Test Warehouse
// "Genova Test Client" (za razliku od "Italija") nema NIJEDNU postojeću stanicu sa arrived_at
// za QA_DRIVER_ID (71+ postojećih za Italija, vrv iz simulirane mobilne aktivnosti) — bez
// ovoga, pronalaženje TAČNO naše test kartice na /dashboard/service/visits bilo bi dvosmisleno.
const CLIENT_ID = 'bac55bc1-11b5-4968-a024-ad23984f8c8f'; // Genova Test Client
const MACHINE_ID = '2a367b53-e691-4648-99aa-7151410a83c9'; // Genova Test Machine

// Kreira jednokratnu rutu + jednu stanicu sa KONTROLISANIM arrived_at/completed_at
// vremenima, direktno preko baze — UI nema put da precizno podesi "vreme provedeno na
// lokaciji", a WEB-SV-02/03 zahtevaju tačno poznato trajanje da bi se verifikovao račun.
export async function createServiceVisitStop(params: {
  driverId: string;
  arrivedAt: Date;
  completedAt: Date | null;
  warehouseId?: string;
}): Promise<{ routeId: string; stopId: string }> {
  const supabase = supabaseAdmin();
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: route, error: routeError } = await supabase
    .from('routes')
    .insert({
      driver_id: params.driverId,
      warehouse_id: params.warehouseId ?? WAREHOUSE_ID,
      route_date: todayIso,
      status: params.completedAt ? 'completed' : 'in_progress',
    })
    .select('id')
    .single();

  if (routeError || !route) {
    throw new Error(`Ne mogu da napravim rutu za service visit fixture: ${routeError?.message}`);
  }

  const { data: stop, error: stopError } = await supabase
    .from('stops')
    .insert({
      route_id: route.id,
      client_id: CLIENT_ID,
      machine_id: MACHINE_ID,
      sequence_number: 1,
      status: params.completedAt ? 'completed' : 'in_progress',
      arrived_at: params.arrivedAt.toISOString(),
      completed_at: params.completedAt ? params.completedAt.toISOString() : null,
    })
    .select('id')
    .single();

  if (stopError || !stop) {
    throw new Error(`Ne mogu da napravim stanicu za service visit fixture: ${stopError?.message}`);
  }

  return { routeId: route.id, stopId: stop.id };
}

export async function deleteServiceVisitRoute(routeId: string) {
  const supabase = supabaseAdmin();
  await supabase.from('stops').delete().eq('route_id', routeId);
  await supabase.from('routes').delete().eq('id', routeId);
}
