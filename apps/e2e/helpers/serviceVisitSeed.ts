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
// u kom WEB-SV-* testovi ostavljaju svoje fixture stanice. Umesto brisanja: ukloni
// arrived_at/completed_at (to kontroliše vidljivost na listi) i otkaži rutu.
//
// WEB-SV-03 ostavlja svoju fixture stanicu 'in_progress' — inv_v3_guard_machine_transfer()
// i dalje blokira transfer deljene mašine dok god POSTOJI 'in_progress' stanica na njoj, bez
// obzira da li je roditeljska ruta otkazana. Zato prvo resetujemo 'in_progress' na 'pending'
// (to ne dira completed — taj status se ne blokira istim trigerom), PA tek onda otkazujemo
// rutu — nakon čega ni 'pending' stanica na otkazanoj ruti ne blokira transfer.
export async function deleteServiceVisitRoute(routeId: string) {
  const supabase = supabaseAdmin();

  const { error: statusError } = await supabase
    .from('stops')
    .update({ status: 'pending' })
    .eq('route_id', routeId)
    .eq('status', 'in_progress');
  if (statusError) {
    throw new Error(`Ne mogu da resetujem status fixture stanica: ${statusError.message}`);
  }

  const { error: stopError } = await supabase
    .from('stops')
    .update({ arrived_at: null, completed_at: null })
    .eq('route_id', routeId);
  if (stopError) {
    throw new Error(`Ne mogu da očistim vremena fixture stanica: ${stopError.message}`);
  }

  const { error: routeError } = await supabase
    .from('routes')
    .update({ status: 'cancelled' })
    .eq('id', routeId);
  if (routeError) {
    throw new Error(`Ne mogu da otkažem fixture rutu: ${routeError.message}`);
  }
}
