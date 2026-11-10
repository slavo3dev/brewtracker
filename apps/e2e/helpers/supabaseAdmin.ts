import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseEnv } from 'dotenv';

// Ovaj klijent (service-role) zaobilazi SVE RLS provere — testovi rade region-wide auto-close,
// menjaju globalni review URL, čuvaju inventory baseline-ove itd. Protiv deljenog/pogrešnog
// projekta ovo bi mogao da pipne tuđe podatke/korisnike. Jedini odobreni projekat je onaj na
// kom je ova suita stvarno razvijana i verifikovana — fail-closed ako SUPABASE_URL cilja nešto
// drugo, ili ako se ne poklapa sa projektom koji web app (apps/web) stvarno koristi.
const ALLOWED_TEST_PROJECT_REF = 'ybsrvlwgnxkutqhmcvdu';

let verified = false;

function assertSafeTestProject() {
  const url = process.env.SUPABASE_URL;
  if (!url || !url.includes(ALLOWED_TEST_PROJECT_REF)) {
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
    // Mi samo upisujemo redove, ne koristimo realtime — ali Supabase klijent inicijalizuje
    // WebSocket deo čim se napravi, pa mu eksplicitno dajemo 'ws' implementaciju da ne zavisi
    // od toga koja je verzija Node-a instalirana na mašini koja pokreće testove.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
