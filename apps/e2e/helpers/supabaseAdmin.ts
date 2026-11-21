import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseEnv } from 'dotenv';

// This client (service-role) bypasses ALL RLS checks — tests perform region-wide auto-close,
// change the global review URL, write inventory baselines, etc. Against a shared or wrong
// project, this could touch other people's data/users. The only approved project is the one
// this suite was actually developed and verified against — fail-closed if SUPABASE_URL
// targets something else, or if it doesn't match the project the web app (apps/web) actually
// uses.
const ALLOWED_TEST_PROJECT_REF = 'ybsrvlwgnxkutqhmcvdu';

let verified = false;

const ALLOWED_TEST_PROJECT_ORIGIN = `https://${ALLOWED_TEST_PROJECT_REF}.supabase.co`;

function assertSafeTestProject() {
  const url = process.env.SUPABASE_URL;
  // An origin comparison (not .includes()) — a substring check would let a URL like
  // "https://otherproject.supabase.co?approved=<ALLOWED_TEST_PROJECT_REF>" through despite
  // targeting a completely different host. new URL() throws on a malformed value, which
  // falls through to the same rejection (fail-closed).
  let origin: string | null = null;
  try {
    origin = url ? new URL(url).origin : null;
  } catch {
    origin = null;
  }

  if (origin !== ALLOWED_TEST_PROJECT_ORIGIN) {
    throw new Error(
      `Refusing to run: SUPABASE_URL ("${url ?? 'unset'}") is not the explicitly approved ` +
        `isolated test project (${ALLOWED_TEST_PROJECT_REF}). This admin client bypasses RLS ` +
        'and can mutate real data — update ALLOWED_TEST_PROJECT_REF only after confirming the ' +
        'target project is a safe, isolated test project.',
    );
  }

  let webUrl: string | undefined;
  try {
    const webEnvPath = resolve(__dirname, '../../web/.env.local');
    webUrl = parseEnv(readFileSync(webEnvPath)).NEXT_PUBLIC_SUPABASE_URL;
  } catch {
    // apps/web/.env.local not readable from here — the allowlist check above still applies.
    return;
  }

  if (webUrl && webUrl !== url) {
    throw new Error(
      `Refusing to run: e2e SUPABASE_URL ("${url}") does not match the web app's ` +
        `NEXT_PUBLIC_SUPABASE_URL ("${webUrl}") in apps/web/.env.local. Fixtures and the app ` +
        'under test must point at the same backend.',
    );
  }
}

export function supabaseAdmin() {
  if (!verified) {
    assertSafeTestProject();
    verified = true;
  }

  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    // We only write rows here, we don't use realtime — but the Supabase client initializes
    // its WebSocket part as soon as it's created, so we explicitly give it a 'ws'
    // implementation so it doesn't depend on which Node version is installed on the machine
    // running the tests.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
