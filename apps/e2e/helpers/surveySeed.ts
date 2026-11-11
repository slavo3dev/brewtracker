import { randomUUID } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Creates a fresh service_visit_summaries row with a unique survey_token, so that tests
 * which ACTUALLY submit a rating (SURV-05/06/08...) don't consume the shared fixture token
 * used by tests that only check the form renders (SURV-01).
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
    throw new Error(`Unable to find a stop for the survey fixture: ${stopError?.message}`);
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
    throw new Error(`Unable to create the survey fixture: ${error.message}`);
  }

  return token;
}

/**
 * Simulates a forged request that bypasses the UI/server action and attempts a direct
 * insert into service_visit_surveys with an arbitrary rating — used to verify that the
 * rating constraint (1-5) is enforced at the database level (CHECK constraint), not just
 * in the form.
 */
export async function attemptForgedSurveyInsert(token: string, rating: number): Promise<{ error: string | null }> {
  const supabase = supabaseAdmin();

  const { data: summary, error: summaryError } = await supabase
    .from('service_visit_summaries')
    .select('id')
    .eq('survey_token', token)
    .single();

  if (summaryError || !summary) {
    throw new Error(`Unable to find summary for token: ${summaryError?.message}`);
  }

  const { error } = await supabase.from('service_visit_surveys').insert({
    summary_id: summary.id,
    rating,
  });

  return { error: error?.message ?? null };
}

/**
 * app_settings is a SINGLE shared row for the whole application — reads the current value
 * so the test can restore it afterward (doesn't leave a permanent change to a global
 * setting).
 */
export async function getGoogleReviewUrl(): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('app_settings')
    .select('google_review_url')
    .eq('id', true)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read app_settings: ${error.message}`);
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
    throw new Error(`Unable to set app_settings.google_review_url: ${error.message}`);
  }
}
