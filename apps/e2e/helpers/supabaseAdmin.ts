import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    // Mi samo upisujemo redove, ne koristimo realtime — ali Supabase klijent inicijalizuje
    // WebSocket deo čim se napravi, pa mu eksplicitno dajemo 'ws' implementaciju da ne zavisi
    // od toga koja je verzija Node-a instalirana na mašini koja pokreće testove.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
