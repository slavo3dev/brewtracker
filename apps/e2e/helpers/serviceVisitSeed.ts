import { supabaseAdmin } from './supabaseAdmin';
import { todayLocalIso } from './date';

const WAREHOUSE_ID = process.env.QA_GENOVA_TEST_WAREHOUSE_ID!; // Genova Test Warehouse (region: Italy)
// "Genova Test Client" (za razliku od "Italija") nema NIJEDNU postojeću stanicu sa arrived_at
// za QA_DRIVER_ID (71+ postojećih za Italija, vrv iz simulirane mobilne aktivnosti) — bez
// ovoga, pronalaženje TAČNO naše test kartice na /dashboard/service/visits bilo bi dvosmisleno.
const CLIENT_ID = process.env.QA_GENOVA_TEST_CLIENT_ID!; // Genova Test Client
const MACHINE_ID = process.env.QA_GENOVA_TEST_MACHINE_ID!; // Genova Test Machine

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
  const todayIso = todayLocalIso();

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

// Baza ima zaštitu (23514, "Closed stops cannot be deleted") koja blokira .delete() na
// stanici čim je status 'completed'/'in_progress' sa arrived_at postavljenim — tačno stanje
// u kom WEB-SV-* testovi ostavljaju svoje fixture stanice. .delete() tiho ne uspe (greška se
// nije proveravala), stanica trajno ostane na Service Visits listi za sledeće pokretanje. Umesto
// brisanja: ukloni arrived_at/completed_at (to kontroliše vidljivost na listi) i otkaži rutu.
export async function deleteServiceVisitRoute(routeId: string) {
  const supabase = supabaseAdmin();
  const { data: stops } = await supabase.from('stops').select('id').eq('route_id', routeId);
  const stopIds = (stops ?? []).map((s) => s.id);
  if (stopIds.length > 0) {
    await supabase.from('stops').update({ arrived_at: null, completed_at: null }).in('id', stopIds);
  }
  await supabase.from('routes').update({ status: 'cancelled' }).eq('id', routeId);
}
