import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Logs in as the given user (a real signInWithPassword, not service role) and returns
 * the list of driver emails THAT person actually sees on the Fleet map — directly through
 * the same RLS-protected table the UI uses, without clicking Leaflet markers/popups
 * (those are unreliable to automate when several markers are close together).
 */
export async function getVisibleFleetDriverEmailsAs(email: string, password: string): Promise<string[]> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Unable to log in as ${email}: ${signInError.message}`);
  }

  const { data, error } = await supabase.from('active_fleet_locations').select('driver_email');
  if (error) {
    throw new Error(`Unable to read active_fleet_locations: ${error.message}`);
  }

  return (data ?? []).map((row) => row.driver_email).filter((email): email is string => !!email);
}

/**
 * Ensures the given driver is "live" on the Fleet map: has an open shift (time_entries)
 * and a fresh location (location_pings, within the last 10 minutes, as the Fleet map
 * requires). Uses the service role key to bypass RLS (the same rules that would otherwise
 * require a real mobile clock-in).
 */
export async function ensureDriverIsLiveOnFleetMap(driverEmail: string) {
  const supabase = supabaseAdmin();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', driverEmail)
    .single();

  if (userError || !user) {
    throw new Error(`Unable to find driver with email ${driverEmail}: ${userError?.message}`);
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
      throw new Error(`Unable to open a shift for the driver: ${clockInError.message}`);
    }
  }

  // Small random offset per driver so markers on the map aren't stacked exactly on top of
  // each other (makes it easier for UI tests to click a specific marker).
  const jitter = () => (Math.random() - 0.5) * 0.05;

  const { error: pingError } = await supabase.from('location_pings').insert({
    driver_id: driverId,
    latitude: 44.8125 + jitter(),
    longitude: 20.4612 + jitter(),
    recorded_at: new Date().toISOString(),
  });

  if (pingError) {
    throw new Error(`Unable to send a location for the driver: ${pingError.message}`);
  }
}

/**
 * Removes a driver from the Fleet map (closes any open shift), regardless of whether they
 * are currently "live". Used to guarantee the test driver does NOT show up on the map
 * before testing the "just went live" scenario — makes the test repeatable regardless of
 * whether the same driver was recently used by a previous test run.
 */
export async function removeDriverFromFleetMap(driverEmail: string) {
  const supabase = supabaseAdmin();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', driverEmail)
    .single();

  if (userError || !user) {
    throw new Error(`Unable to find driver with email ${driverEmail}: ${userError?.message}`);
  }

  const { error } = await supabase
    .from('time_entries')
    .update({ clock_out_at: new Date().toISOString(), status: 'closed' })
    .eq('driver_id', user.id)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null);

  if (error) {
    throw new Error(`Unable to close the driver's shift: ${error.message}`);
  }
}
