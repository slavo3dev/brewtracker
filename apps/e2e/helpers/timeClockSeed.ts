import { supabaseAdmin } from './supabaseAdmin';

// QA Smederevo Warehouse: geofence_radius_meters 120.
const DEFAULT_WAREHOUSE_ID = process.env.QA_WAREHOUSE_ID!;
const WAREHOUSE_LAT = 44.6579212712334;
const WAREHOUSE_LNG = 20.936239461265;

/**
 * Prethodno ostavljeni pending unosi od ranijih pokretanja testa bi inače ostali u review
 * queue-u zauvek (ništa ih ne rešava) i pokvarili bi locator-e koji očekuju TAČNO one
 * "fresh" pending unose koje test upravo seeduje. Pozvati JEDNOM na početku testa —
 * ne pre svakog createPendingClockInEntry poziva (to bi "rešilo" i unos iz prethodnog
 * poziva u ISTOM testu ako test seeduje više unosa za istog vozača).
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

  // Samo jedan OTVOREN unos po vozaču je dozvoljen (DB constraint) — zatvori eventualni
  // postojeći pre nego što napravimo novi, kako bi seeding bio ponovljiv.
  await supabase
    .from('time_entries')
    .update({ clock_out_at: new Date().toISOString(), status: 'closed' })
    .eq('driver_id', driverId)
    .in('status', ['open', 'manager_override'])
    .is('clock_out_at', null);

  // "outside" pomera klik-in ~3.3km severno od magacina — jasno van svih test radijusa.
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
      // Drugi (ne-otvoren) unos za istog vozača mora da ima clock_out_at da ne bi
      // probio "jedan otvoren unos po vozaču" constraint.
      ...(leaveOpen
        ? { status: 'open' }
        : { status: 'closed', clock_out_at: new Date().toISOString() }),
      review_status: 'pending',
      ...(options?.clockInSelfieUrl ? { clock_in_selfie_url: options.clockInSelfieUrl } : {}),
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Ne mogu da napravim pending clock-in: ${error?.message}`);
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
    throw new Error(`Ne mogu da pročitam review ishod: ${error?.message}`);
  }
  return data;
}

/**
 * Otvoren unos čiji je shift_end_at u prošlosti — mobilni clock-in nikad ne postavlja ovo
 * polje (zato precondition eksplicitno kaže "set via SQL"), pa ovo mora direktno preko
 * service-role klijenta. Koristi se za testiranje "Run auto-close check" funkcije.
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
    throw new Error(`Ne mogu da napravim otvoren unos sa prošlim shift_end_at: ${error?.message}`);
  }
  return data.id;
}

/**
 * Otvoren unos čiji je shift_end_at u BUDUĆNOSTI — koristi se za WEB-TCSET-02 (smena još
 * nije završena, auto-close ga ne sme dirati).
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
    throw new Error(`Ne mogu da napravim otvoren unos sa budućim shift_end_at: ${error?.message}`);
  }
  return data.id;
}

/**
 * Otvoren unos BEZ shift_end_at (kakav normalni mobilni clock-in i pravi) — koristi se za
 * WEB-TCSET-05 (auto-close pokriva samo unose koji IMAJU shift_end_at).
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
    throw new Error(`Ne mogu da napravim otvoren unos bez shift_end_at: ${error?.message}`);
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
    throw new Error(`Ne mogu da postavim reason polja: ${error.message}`);
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
    throw new Error(`Ne mogu da pročitam unos: ${error?.message}`);
  }
  return data;
}
