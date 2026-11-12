import { supabaseAdmin } from './supabaseAdmin';
import { todayLocalIso } from './date';

const WAREHOUSE_ID = process.env.QA_GENOVA_TEST_WAREHOUSE_ID!; // Genova Test Warehouse (region: Italy)
// "Genova Test Client" (unlike "Italija") has NO existing stop with an arrived_at
// for QA_DRIVER_ID (71+ exist for Italija, likely from simulated mobile activity) — without
// this, finding EXACTLY our test card on /dashboard/service/visits would be ambiguous.
const CLIENT_ID = process.env.QA_GENOVA_TEST_CLIENT_ID!; // Genova Test Client
const MACHINE_ID = process.env.QA_GENOVA_TEST_MACHINE_ID!; // Genova Test Machine

// Creates a one-off route + a single stop with CONTROLLED arrived_at/completed_at
// times, directly via the database — the UI has no way to precisely set "time spent on
// location", and WEB-SV-02/03 need a precisely known duration to verify the computation.
export async function createServiceVisitStop(params: {
  driverId: string;
  arrivedAt: Date;
  completedAt: Date | null;
  warehouseId?: string;
}): Promise<{ routeId: string; stopId: string }> {
  const supabase = supabaseAdmin();
  const todayIso = todayLocalIso();

  const { data: route, error: routeError } = await supabase
    .from('routes')
    .insert({
      driver_id: params.driverId,
      warehouse_id: params.warehouseId ?? WAREHOUSE_ID,
      route_date: todayIso,
      status: params.completedAt ? 'completed' : 'in_progress',
    })
    .select('id')
    .single();

  if (routeError || !route) {
    throw new Error(`Unable to create a route for the service visit fixture: ${routeError?.message}`);
  }

  const { data: stop, error: stopError } = await supabase
    .from('stops')
    .insert({
      route_id: route.id,
      client_id: CLIENT_ID,
      machine_id: MACHINE_ID,
      sequence_number: 1,
      status: params.completedAt ? 'completed' : 'in_progress',
      arrived_at: params.arrivedAt.toISOString(),
      completed_at: params.completedAt ? params.completedAt.toISOString() : null,
    })
    .select('id')
    .single();

  if (stopError || !stop) {
    throw new Error(`Unable to create a stop for the service visit fixture: ${stopError?.message}`);
  }

  return { routeId: route.id, stopId: stop.id };
}

// The database has a guard (23514, "Closed stops cannot be deleted") that blocks .delete()
// on a stop as soon as its status is 'completed'/'in_progress' with arrived_at set — exactly
// the state WEB-SV-* tests leave their fixture stops in. Instead of deleting: clear
// arrived_at/completed_at (that's what controls visibility on the list) and cancel the route.
//
// WEB-SV-03 leaves its fixture stop 'in_progress' — inv_v3_guard_machine_transfer() still
// blocks transferring a shared machine while an 'in_progress' stop EXISTS on it, regardless
// of whether the parent route is cancelled. So we first reset 'in_progress' to 'pending'
// (this doesn't touch completed — that status isn't blocked by the same trigger), and ONLY
// THEN cancel the route — after which even a 'pending' stop on a cancelled route no longer
// blocks the transfer.
export async function deleteServiceVisitRoute(routeId: string) {
  const supabase = supabaseAdmin();

  const { error: statusError } = await supabase
    .from('stops')
    .update({ status: 'pending' })
    .eq('route_id', routeId)
    .eq('status', 'in_progress');
  if (statusError) {
    throw new Error(`Unable to reset fixture stop status: ${statusError.message}`);
  }

  const { error: stopError } = await supabase
    .from('stops')
    .update({ arrived_at: null, completed_at: null })
    .eq('route_id', routeId);
  if (stopError) {
    throw new Error(`Unable to clear fixture stop timestamps: ${stopError.message}`);
  }

  const { error: routeError } = await supabase
    .from('routes')
    .update({ status: 'cancelled' })
    .eq('id', routeId);
  if (routeError) {
    throw new Error(`Unable to cancel the fixture route: ${routeError.message}`);
  }
}
