import 'dotenv/config';
import { supabaseAdmin } from './helpers/supabaseAdmin';

/**
 * Mandatory preflight, run once before ANY test executes — regardless of which tests a given
 * invocation ends up selecting (e.g. `-g "WEB-SMOKE"`, a single browser-only spec file). Without
 * this, the SUPABASE_URL allowlist check in helpers/supabaseAdmin.ts only fires the first time
 * some test actually calls supabaseAdmin() — a run containing ONLY browser-driven tests that
 * never touch a seed helper would never trigger it at all. Calling supabaseAdmin() here forces
 * the check to run unconditionally; it throws (aborting the whole run) if SUPABASE_URL isn't the
 * approved project.
 *
 * Known limitation (not solved here): this verifies the seed/admin client's target, not the
 * ALREADY-RUNNING web dev server's live configuration — the server loads its own env at process
 * start, before this ever runs, and there's no endpoint it exposes to confirm which Supabase
 * project it actually connected to. Closing that gap needs a verification hook in apps/web
 * itself, which is out of scope for an e2e-only change (see the same constraint documented on
 * WEB-SURV-10 in tests/web-survey.spec.ts).
 */
export default async function globalSetup() {
  supabaseAdmin();
}
