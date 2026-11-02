import { randomUUID } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Pravi svež service_visit_summaries red sa jedinstvenim survey_token-om, tako da
 * testovi koji STVARNO šalju ocenu (SURV-05/06/08...) ne troše deljeni fixture token
 * korišćen od strane testova koji samo proveravaju da forma renderuje (SURV-01).
 */
export async function createFreshSurveyToken(): Promise<string> {
  const supabase = supabaseAdmin();
  const token = randomUUID();

  const { data: stop, error: stopError } = await supabase
    .from('stops')
    .select('id, client_id, machine_id')
    .not('client_id', 'is', null)
    .not('machine_id', 'is', null)
    .limit(1)
    .single();

  if (stopError || !stop) {
    throw new Error(`Ne mogu da nađem stanicu za survey fixture: ${stopError?.message}`);
  }

  const { error } = await supabase.from('service_visit_summaries').insert({
    source_visit_id: `qa-survey-fixture-${Date.now()}-${token.slice(0, 8)}`,
    stop_id: stop.id,
    client_id: stop.client_id,
    machine_id: stop.machine_id,
    completed_by: process.env.QA_DRIVER_ID,
    completed_at: new Date().toISOString(),
    summary: {},
    survey_token: token,
  });

  if (error) {
    throw new Error(`Ne mogu da napravim survey fixture: ${error.message}`);
  }

  return token;
}

/**
 * Simulira forged request koji zaobilazi UI/server akciju i pokušava direktan insert u
 * service_visit_surveys sa proizvoljnim rating-om — koristi se da provери da je rating
 * ograničenje (1-5) sprovedeno na nivou baze (CHECK constraint), ne samo u formi.
 */
export async function attemptForgedSurveyInsert(token: string, rating: number): Promise<{ error: string | null }> {
  const supabase = supabaseAdmin();

  const { data: summary, error: summaryError } = await supabase
    .from('service_visit_summaries')
    .select('id')
    .eq('survey_token', token)
    .single();

  if (summaryError || !summary) {
    throw new Error(`Ne mogu da nađem summary za token: ${summaryError?.message}`);
  }

  const { error } = await supabase.from('service_visit_surveys').insert({
    summary_id: summary.id,
    rating,
  });

  return { error: error?.message ?? null };
}

/**
 * app_settings je JEDAN deljeni red za celu aplikaciju — čita trenutnu vrednost da bi
 * test mogao da je vrati nazad nakon što završi (ne ostavlja trajnu promenu globalnog podešavanja).
 */
export async function getGoogleReviewUrl(): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('app_settings')
    .select('google_review_url')
    .eq('id', true)
    .maybeSingle();

  if (error) {
    throw new Error(`Ne mogu da pročitam app_settings: ${error.message}`);
  }
  return data?.google_review_url ?? null;
}

export async function setGoogleReviewUrl(url: string | null) {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('app_settings')
    .update({ google_review_url: url })
    .eq('id', true);

  if (error) {
    throw new Error(`Ne mogu da postavim app_settings.google_review_url: ${error.message}`);
  }
}
