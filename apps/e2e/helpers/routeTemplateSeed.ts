import { supabaseAdmin } from './supabaseAdmin';

/**
 * Direktno (preko baze) deaktivira i briše sve route_templates čiji naziv počinje
 * datim prefiksom. Koristi se kao garantovani cleanup (u finally bloku) za testove
 * koji namerno prave driver+day+machine konflikte — ako test padne NA POLA (npr. zbog
 * pogrešnog očekivanog teksta), UI-bazirani cleanup na kraju testa se nikad ne izvrši i
 * aktivan template ostaje trajno "zauzet", blokirajući SVAKO naredno pokretanje istog
 * test slučaja istom greškom.
 */
export async function forceCleanupTemplates(namePrefixes: string[]) {
  const supabase = supabaseAdmin();
  for (const prefix of namePrefixes) {
    await supabase.from('route_templates').update({ is_active: false }).ilike('name', `${prefix}%`);
    await supabase.from('route_templates').delete().ilike('name', `${prefix}%`);
  }
}

export async function getTemplateIdByName(name: string): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('route_templates').select('id').eq('name', name).single();
  if (error || !data) {
    throw new Error(`Ne mogu da nađem route template: ${error?.message}`);
  }
  return data.id;
}

type GeneratedRoute = {
  route_id: string;
  route_template_id: string;
  driver_id: string;
  route_date: string;
  stops_created: number;
};

// RPC koji inače pokreće dnevni cron — poziva se direktno (preko servisne role) da bi se
// deterministički testiralo ROUTE-6 pravilo (generisanje se preskače kad već postoji
// nepotkazana operativna ruta za istog vozača/datum sa istom mašinom ili istim klijentom).
//
// POZNATO OGRANIČENJE: ovaj RPC obrađuje SVE aktivne route_templates za dati datum, ne samo
// onaj koji WEB-TPL-20 pravi — poziv ovde pokreće realno generisanje ruta i za SVE OSTALE
// aktivne template-e koji imaju današnji dan kao radni (ne samo QA fixture). Prihvatljivo jer
// je ovo deljeni QA/test Supabase projekat (ista vrsta podataka koju i sami testovi prave), ne
// produkcija sa pravim klijentima — ako se ovaj paket ikad pokrene nad bazom koja ima stvarni
// produkcioni saobraćaj, ovaj poziv treba PRVO izmeniti RPC da prima opcioni filter po
// template ID-u (migracija), jer bi inače generisao stvarne operativne rute mimo cron rasporeda.
export async function generateRoutesFromTemplates(routeDateIso: string): Promise<GeneratedRoute[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc('generate_routes_from_templates', {
    p_route_date: routeDateIso,
  });
  if (error) {
    throw new Error(`RPC generate_routes_from_templates nije uspeo: ${error.message}`);
  }
  return (data ?? []) as GeneratedRoute[];
}
