import { supabaseAdmin } from './supabaseAdmin';

/**
 * Directly (via the database) deactivates and deletes all route_templates whose name
 * starts with the given prefix. Used as a guaranteed cleanup (in a finally block) for
 * tests that deliberately create driver+day+machine conflicts — if a test fails PARTWAY
 * through (e.g. due to a wrong expected text), the UI-based cleanup at the end of the test
 * never runs, and an active template stays permanently "occupied", blocking EVERY
 * subsequent run of the same test case with the same error.
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
    throw new Error(`Unable to find route template: ${error?.message}`);
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

// The RPC that normally powers the daily cron job — called directly (via the service role)
// so that the ROUTE-6 rule can be tested deterministically (generation is skipped when a
// non-cancelled operational route already exists for the same driver/date with the same
// machine or client).
//
// p_template_id is an optional parameter (migration 20261104171218) — when passed, the RPC
// generates ONLY for that template, not for every active template that day (which, if
// called from a test, would otherwise trigger real route generation for other, unrelated
// templates too). The cron job still calls the RPC with only a date — the default null
// preserves identical behavior for it.
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
    throw new Error(`RPC generate_routes_from_templates failed: ${error.message}`);
  }
  return (data ?? []) as GeneratedRoute[];
}
