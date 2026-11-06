import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Prijavljuje se kao dati korisnik (pravi signInWithPassword, ne service role) i vraća
 * listu email-ova vozača koje TA osoba stvarno vidi na Fleet mapi — direktno preko iste
 * RLS-zaštićene tabele koju UI koristi, bez klikanja po Leaflet markerima/popup-ovima
 * (ti su nepouzdani za automatizaciju kad ima više markera blizu jedan drugom).
 */
export async function getVisibleFleetDriverEmailsAs(email: string, password: string): Promise<string[]> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Ne mogu da se ulogujem kao ${email}: ${signInError.message}`);
  }

  const { data, error } = await supabase.from('active_fleet_locations').select('driver_email');
  if (error) {
    throw new Error(`Ne mogu da pročitam active_fleet_locations: ${error.message}`);
  }

  return (data ?? []).map((row) => row.driver_email).filter((email): email is string => !!email);
}

/**
 * Osigurava da je dati vozač "live" na Fleet mapi: ima otvorenu smenu (time_entries)
 * i svežu lokaciju (location_pings, u poslednjih 10 minuta, kako Fleet mapa zahteva).
 * Koristi service role ključ da zaobiđe RLS (ista pravila koja bi inače zahtevala
 * pravi mobilni clock-in).
 */
export async function ensureDriverIsLiveOnFleetMap(driverEmail: string) {
  const supabase = supabaseAdmin();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', driverEmail)
    .single();

  if (userError || !user) {
    throw new Error(`Ne mogu da nađem vozača sa email-om ${driverEmail}: ${userError?.message}`);
  }

  const driverId = user.id;

  const { data: openEntry } = await supabase
    .from('time_entries')
    .select('id')
    .eq('driver_id', driverId)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null)
    .limit(1)
    .maybeSingle();

  if (!openEntry) {
    const { error: clockInError } = await supabase.from('time_entries').insert({
      driver_id: driverId,
      status: 'open',
    });
    if (clockInError) {
      throw new Error(`Ne mogu da otvorim smenu za vozača: ${clockInError.message}`);
    }
  }

  // Mali nasumični pomeraj po vozaču da markeri na mapi ne budu tačno jedan na drugom
  // (olakšava UI testovima da kliknu na konkretan marker).
  const jitter = () => (Math.random() - 0.5) * 0.05;

  const { error: pingError } = await supabase.from('location_pings').insert({
    driver_id: driverId,
    latitude: 44.8125 + jitter(),
    longitude: 20.4612 + jitter(),
    recorded_at: new Date().toISOString(),
  });

  if (pingError) {
    throw new Error(`Ne mogu da pošaljem lokaciju za vozača: ${pingError.message}`);
  }
}

/**
 * Uklanja vozača sa Fleet mape (zatvara otvorenu smenu), bez obzira na to da li je
 * trenutno "live". Koristi se da se test-vozač garantovano NE prikazuje na mapi
 * pre testiranja "pojavio se uživo" scenarija — čini test ponovljivim bez obzira
 * na to da li je isti vozač nedavno već bio korišćen u prethodnom pokretanju testa.
 */
export async function removeDriverFromFleetMap(driverEmail: string) {
  const supabase = supabaseAdmin();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', driverEmail)
    .single();

  if (userError || !user) {
    throw new Error(`Ne mogu da nađem vozača sa email-om ${driverEmail}: ${userError?.message}`);
  }

  const { error } = await supabase
    .from('time_entries')
    .update({ clock_out_at: new Date().toISOString(), status: 'closed' })
    .eq('driver_id', user.id)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null);

  if (error) {
    throw new Error(`Ne mogu da zatvorim smenu vozača: ${error.message}`);
  }
}
