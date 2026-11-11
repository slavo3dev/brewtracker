import { supabaseAdmin } from './supabaseAdmin';

// QA Smederevo Warehouse: geofence_radius_meters 120.
const DEFAULT_WAREHOUSE_ID = process.env.QA_WAREHOUSE_ID!;
const WAREHOUSE_LAT = 44.6579212712334;
const WAREHOUSE_LNG = 20.936239461265;

/**
 * Pending entries left over from earlier test runs would otherwise stay in the review
 * queue forever (nothing resolves them) and would break locators that expect EXACTLY the
 * "fresh" pending entries the test is seeding right now. Call this ONCE at the start of the
 * test — not before every createPendingClockInEntry call (that would also "resolve" an
 * entry from an earlier call in the SAME test if the test seeds multiple entries for the
 * same driver).
 */
export async function resolveExistingPendingEntries(driverId: string) {
  const supabase = supabaseAdmin();
  await supabase
    .from('time_entries')
    .update({ review_status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('driver_id', driverId)
    .eq('review_status', 'pending');
}

export async function createPendingClockInEntry(
  driverId: string,
  options?: {
    geofence?: 'inside' | 'outside';
    leaveOpen?: boolean;
    clockInSelfieUrl?: string;
    warehouseId?: string;
    warehouseLat?: number;
    warehouseLng?: number;
  },
): Promise<string> {
  const supabase = supabaseAdmin();

  // Only one OPEN entry per driver is allowed (DB constraint) — close any existing one
  // before creating a new one, so seeding stays repeatable.
  await supabase
    .from('time_entries')
    .update({ clock_out_at: new Date().toISOString(), status: 'closed' })
    .eq('driver_id', driverId)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null);

  // "outside" moves the clock-in ~3.3km north of the warehouse — clearly outside every test
  // radius.
  const latOffset = options?.geofence === 'outside' ? 0.03 : 0.0001;
  const leaveOpen = options?.leaveOpen ?? true;
  const warehouseLat = options?.warehouseLat ?? WAREHOUSE_LAT;
  const warehouseLng = options?.warehouseLng ?? WAREHOUSE_LNG;

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      driver_id: driverId,
      warehouse_id: options?.warehouseId ?? DEFAULT_WAREHOUSE_ID,
      clock_in_at: new Date().toISOString(),
      clock_in_latitude: warehouseLat + latOffset,
      clock_in_longitude: warehouseLng,
      // A second (non-open) entry for the same driver must have clock_out_at set, or it
      // would violate the "one open entry per driver" constraint.
      ...(leaveOpen
        ? { status: 'open' }
        : { status: 'closed', clock_out_at: new Date().toISOString() }),
      review_status: 'pending',
      ...(options?.clockInSelfieUrl ? { clock_in_selfie_url: options.clockInSelfieUrl } : {}),
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create a pending clock-in: ${error?.message}`);
  }
  return data.id;
}

export type ReviewOutcome = {
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export async function getReviewOutcome(timeEntryId: string): Promise<ReviewOutcome> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('time_entries')
    .select('review_status, reviewed_by, reviewed_at, review_note')
    .eq('id', timeEntryId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to read review outcome: ${error?.message}`);
  }
  return data;
}

/**
 * An open entry whose shift_end_at is in the past — a mobile clock-in never sets this
 * field (that's why the precondition explicitly says "set via SQL"), so this must go
 * directly through the service-role client. Used to test the "Run auto-close check"
 * function.
 */
export async function createOpenEntryWithPastShiftEnd(driverId: string): Promise<string> {
  const supabase = supabaseAdmin();

  await supabase
    .from('time_entries')
    .update({ clock_out_at: new Date().toISOString(), status: 'closed' })
    .eq('driver_id', driverId)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      driver_id: driverId,
      warehouse_id: DEFAULT_WAREHOUSE_ID,
      clock_in_at: twoHoursAgo,
      clock_in_latitude: WAREHOUSE_LAT,
      clock_in_longitude: WAREHOUSE_LNG,
      status: 'open',
      shift_end_at: oneHourAgo,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create an open entry with a past shift_end_at: ${error?.message}`);
  }
  return data.id;
}

/**
 * An open entry whose shift_end_at is in the FUTURE — used by WEB-TCSET-02 (the shift
 * hasn't ended yet, auto-close must not touch it).
 */
export async function createOpenEntryWithFutureShiftEnd(driverId: string): Promise<string> {
  const supabase = supabaseAdmin();

  await supabase
    .from('time_entries')
    .update({ clock_out_at: new Date().toISOString(), status: 'closed' })
    .eq('driver_id', driverId)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      driver_id: driverId,
      warehouse_id: DEFAULT_WAREHOUSE_ID,
      clock_in_at: oneHourAgo,
      clock_in_latitude: WAREHOUSE_LAT,
      clock_in_longitude: WAREHOUSE_LNG,
      status: 'open',
      shift_end_at: oneHourFromNow,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create an open entry with a future shift_end_at: ${error?.message}`);
  }
  return data.id;
}

/**
 * An open entry WITHOUT a shift_end_at (what a normal mobile clock-in actually produces) —
 * used by WEB-TCSET-05 (auto-close only covers entries that HAVE a shift_end_at).
 */
export async function createOpenEntryWithoutShiftEnd(driverId: string): Promise<string> {
  const supabase = supabaseAdmin();

  await supabase
    .from('time_entries')
    .update({ clock_out_at: new Date().toISOString(), status: 'closed' })
    .eq('driver_id', driverId)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      driver_id: driverId,
      warehouse_id: DEFAULT_WAREHOUSE_ID,
      clock_in_at: oneHourAgo,
      clock_in_latitude: WAREHOUSE_LAT,
      clock_in_longitude: WAREHOUSE_LNG,
      status: 'open',
      shift_end_at: null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create an open entry without a shift_end_at: ${error?.message}`);
  }
  return data.id;
}

export type TimeEntryRow = {
  status: string;
  review_status: string;
  review_reason: string | null;
  auto_close_reason: string | null;
};

export async function setTimeEntryReasonFields(
  timeEntryId: string,
  fields: {
    review_note?: string | null;
    review_reason?: string | null;
    override_reason?: string | null;
    auto_close_reason?: string | null;
  },
) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('time_entries').update(fields).eq('id', timeEntryId);
  if (error) {
    throw new Error(`Unable to set reason fields: ${error.message}`);
  }
}

export async function getTimeEntry(timeEntryId: string): Promise<TimeEntryRow> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('time_entries')
    .select('status, review_status, review_reason, auto_close_reason')
    .eq('id', timeEntryId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to read entry: ${error?.message}`);
  }
  return data;
}
