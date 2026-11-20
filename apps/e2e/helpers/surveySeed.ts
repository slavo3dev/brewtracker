import { randomUUID } from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Creates a fresh service_visit_summaries row with a unique survey_token, so that tests
 * which ACTUALLY submit a rating (SURV-05/06/08...) don't consume the shared fixture token
 * used by tests that only check the form renders (SURV-01).
 *
 * The summary needs a real stop/client/machine to satisfy its FK constraints, but it must NOT
 * borrow an arbitrary pre-existing one — every call here was previously attaching a permanent
 * "completed" summary to whatever real stop happened to sort first, with no teardown anywhere
 * in the suite, silently accumulating fake completion/rating history against unrelated
 * clients and machines on every run. Instead, this creates its own route+stop (a route cascades
 * its stop on delete), and deleteSurveyFixture() below removes everything this function
 * created, in reverse order.
 */
export async function createFreshSurveyToken(): Promise<string> {
  const supabase = supabaseAdmin();
  const token = randomUUID();

  // route_date is a fixed date in the past, deliberately NOT today — several other tests
  // (WEB-TPL-13/14/16/17/20, WEB-RT-*...) check for "any non-cancelled route for this
  // driver+machine+TODAY" to detect scheduling conflicts. A route dated today here was an
  // invisible, permanent conflict for every one of them (the survey feature itself never
  // reads route_date, so the actual value doesn't matter beyond avoiding that collision).
  const { data: route, error: routeError } = await supabase
    .from('routes')
    .insert({
      driver_id: process.env.QA_DRIVER_ID,
      warehouse_id: process.env.QA_GENOVA_TEST_WAREHOUSE_ID,
      route_date: '2020-01-01',
      status: 'completed',
      notes: `QA survey fixture route ${token}`,
    })
    .select('id')
    .single();

  if (routeError || !route) {
    throw new Error(`Unable to create the survey fixture's route: ${routeError?.message}`);
  }

  // status stays 'pending' (not 'completed') deliberately — the survey feature never reads
  // stops.status, and a DB trigger (inv_v3_guard_stop) blocks deleting any stop whose status
  // is 'completed'/'skipped', which would make deleteSurveyFixture() below unable to clean up.
  const { data: stop, error: stopError } = await supabase
    .from('stops')
    .insert({
      route_id: route.id,
      client_id: process.env.QA_GENOVA_TEST_CLIENT_ID,
      machine_id: process.env.QA_GENOVA_TEST_MACHINE_ID,
      sequence_number: 1,
    })
    .select('id, client_id, machine_id')
    .single();

  if (stopError || !stop) {
    await supabase.from('routes').delete().eq('id', route.id);
    throw new Error(`Unable to create the survey fixture's stop: ${stopError?.message}`);
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
    await supabase.from('routes').delete().eq('id', route.id); // cascades the stop
    throw new Error(`Unable to create the survey fixture: ${error.message}`);
  }

  return token;
}

/**
 * Removes everything createFreshSurveyToken() created for this token: the summary (its survey
 * row cascades automatically), then the route (cascades its stop automatically). Safe to call
 * even if the summary was never created or was already removed.
 */
export async function deleteSurveyFixture(token: string): Promise<void> {
  const supabase = supabaseAdmin();

  const { data: summary } = await supabase
    .from('service_visit_summaries')
    .select('id, stop:stops(route_id)')
    .eq('survey_token', token)
    .maybeSingle();

  if (!summary) {
    return;
  }

  await supabase.from('service_visit_summaries').delete().eq('id', summary.id);

  const routeId = (summary.stop as unknown as { route_id: string } | null)?.route_id;
  if (routeId) {
    await supabase.from('routes').delete().eq('id', routeId);
  }
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
