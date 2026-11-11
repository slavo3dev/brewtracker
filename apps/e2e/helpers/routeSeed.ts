import { supabaseAdmin } from './supabaseAdmin';

// "Latest scheduled route" is not a reliable way to pick a specific, just-created route —
// another route for the same driver/day may have been inserted before this one (or this one
// may never have been created at all, if the UI step before this call failed). A unique
// noteTag is the only reliable way to find exactly that one.
export async function getRouteIdByNotes(notes: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data } = await supabase.from('routes').select('id').eq('notes', notes).maybeSingle();
  return data?.id ?? null;
}

export async function getLatestScheduledRouteId(driverId: string, routeDateIso: string): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('routes')
    .select('id')
    .eq('driver_id', driverId)
    .eq('route_date', routeDateIso)
    .eq('status', 'scheduled')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Unable to find a scheduled route for the driver: ${error?.message}`);
  }
  return data.id;
}

/**
 * Directly (via the database) marks the route's first stop as "started" — simulates
 * the driver having arrived at the location, even though the UI for this is only
 * available through the mobile app.
 */
export async function markFirstStopAsStarted(routeId: string) {
  const supabase = supabaseAdmin();
  const { data: stop, error: stopError } = await supabase
    .from('stops')
    .select('id')
    .eq('route_id', routeId)
    .limit(1)
    .single();

  if (stopError || !stop) {
    throw new Error(`Unable to find a stop for the route: ${stopError?.message}`);
  }

  const { error } = await supabase
    .from('stops')
    .update({ status: 'in_progress', arrived_at: new Date().toISOString() })
    .eq('id', stop.id);

  if (error) {
    throw new Error(`Unable to mark the stop as started: ${error.message}`);
  }
}

// The UI has no path to set a route to "in_progress" (only the mobile app does that while
// servicing), so we perform that transition directly via the database, as well as resetting
// it back to "scheduled" after the test.
export async function setRouteStatus(routeId: string, status: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('routes').update({ status }).eq('id', routeId);
  if (error) {
    throw new Error(`Unable to change the route's status: ${error.message}`);
  }
}

// Simulates a route generated from a recurring template (we don't run that cron job in
// tests) — used by WEB-RT-10, which checks that the "Recurring" badge renders correctly.
export async function createTemplateGeneratedRoute(
  driverId: string,
  warehouseId: string,
  templateId: string,
  routeDateIso: string,
): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('routes')
    .insert({
      driver_id: driverId,
      warehouse_id: warehouseId,
      route_date: routeDateIso,
      status: 'scheduled',
      source_route_template_id: templateId,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create a template-generated route: ${error?.message}`);
  }
  return data.id;
}

export async function deleteRoute(routeId: string) {
  const supabase = supabaseAdmin();
  await supabase.from('routes').delete().eq('id', routeId);
}

// Clean precondition for route-template generation tests (e.g. WEB-TPL-20): cancels ONLY
// "orphaned" SCHEDULED routes (left over from some earlier, interrupted run of THIS SAME
// test) that would otherwise permanently block generation. driver+date+machine+status alone
// is not a precise enough identifier — it could also match someone else's legitimate
// scheduled route for the same shared driver on the same machine. notesPrefix (e.g.
// "QA-TPL-20-") further narrows this down to routes that THIS test itself tagged earlier,
// regardless of the timestamp from that earlier run. Intentionally does NOT touch
// in_progress/completed routes — that would overwrite real service history, bypassing the
// cancel_operational_route lifecycle checks (this is a direct admin write, without those
// checks).
export async function cancelRoutesForMachine(
  driverId: string,
  routeDateIso: string,
  machineId: string,
  notesPrefix: string,
) {
  const supabase = supabaseAdmin();
  const { data: stops, error: stopsError } = await supabase
    .from('stops')
    .select('route_id, route:routes!inner(id,status,route_date,driver_id,notes)')
    .eq('machine_id', machineId)
    .eq('route.driver_id', driverId)
    .eq('route.route_date', routeDateIso)
    .eq('route.status', 'scheduled')
    .ilike('route.notes', `${notesPrefix}%`);

  if (stopsError) {
    throw new Error(`Unable to find conflicting routes: ${stopsError.message}`);
  }

  const routeIds = [...new Set((stops ?? []).map((s) => s.route_id))];
  if (routeIds.length === 0) return;

  const { error } = await supabase.from('routes').update({ status: 'cancelled' }).in('id', routeIds);
  if (error) {
    throw new Error(`Unable to cancel conflicting routes: ${error.message}`);
  }
}
