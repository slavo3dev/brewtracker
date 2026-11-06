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
// p_template_id je opcioni parametar (migracija 20261104171218) — kad se prosledi, RPC
// generiše SAMO za taj template, ne za sve aktivne template-e tog dana (što bi inače,
// pozvano iz testa, pokretalo realno generisanje ruta i za tuđe, nepovezane template-e).
// Cron i dalje zove RPC sa samo datumom — default null čuva identično ponašanje za njega.
export async function generateRoutesFromTemplates(
  routeDateIso: string,
  templateId?: string,
): Promise<GeneratedRoute[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc('generate_routes_from_templates', {
    p_route_date: routeDateIso,
    p_template_id: templateId ?? null,
  });
  if (error) {
    throw new Error(`RPC generate_routes_from_templates nije uspeo: ${error.message}`);
  }
  return (data ?? []) as GeneratedRoute[];
}
