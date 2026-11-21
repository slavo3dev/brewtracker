import { supabaseAdmin } from './supabaseAdmin';

/**
 * Creates a test account directly via the Supabase admin API (without sending a setup
 * email), and immediately sets a known password + role. Used when a test needs an account
 * with exactly known credentials, while the UI flow would otherwise require sending a real
 * email.
 */
export async function createTestUser(params: {
  email: string;
  password: string;
  fullName: string;
  role: 'driver' | 'tech' | 'manager' | 'ceo';
  isActive: boolean;
  region?: string;
  phone?: string;
}) {
  const supabase = supabaseAdmin();

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    throw new Error(`Unable to create auth account: ${authError?.message}`);
  }

  // Note: the database has a trigger that automatically creates a public.users row as soon
  // as an auth account is created (with default role='driver', is_active=true) — that's why
  // we do an UPDATE here, not an INSERT.
  const { error: profileError } = await supabase
    .from('users')
    .update({
      full_name: params.fullName,
      role: params.role,
      is_active: params.isActive,
      ...(params.region ? { region: params.region } : {}),
      ...(params.phone ? { phone: params.phone } : {}),
    })
    .eq('id', authUser.user.id);
  if (profileError) {
    throw new Error(`Unable to update the users row: ${profileError.message}`);
  }

  return authUser.user.id;
}

/**
 * Deliberately exhausts the shared Supabase project's auth-email rate limit, so a test that
 * needs to observe the "email send failed" branch (e.g. WEB-USR-15) can do so DETERMINISTICALLY
 * instead of waiting for the limit to already be exhausted by chance (the way WEB-AUTH-07/
 * WEB-USR-01/WEB-USR-10 do, which is why those are documented as quota-dependent and
 * occasionally green even when correct).
 *
 * This has a real side effect on the shared QA project: it burns part of its hourly email
 * quota, which can make unrelated reset/invite emails fail for anyone else using this same
 * project around the same time. Keep call sites to tests that specifically need to assert the
 * failure branch, not as a general-purpose precondition.
 */
export async function exhaustEmailRateLimit(maxAttempts = 20): Promise<void> {
  const supabase = supabaseAdmin();

  // Must be a REAL, existing account — Supabase only queues an actual outbound email (and
  // only THAT counts against the send quota) for an address that resolves to a real user, by
  // design (so the API can't be used to probe which emails are registered). A made-up address
  // returns success without ever being rate-limited, no matter how many times it's called.
  const realEmail = process.env.QA_MANAGER_EMAIL!;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { error } = await supabase.auth.resetPasswordForEmail(realEmail);
    if (error) {
      // The limit is now exhausted — the next real send (from the test itself) will fail too.
      return;
    }
  }

  throw new Error(
    `Unable to exhaust the email rate limit after ${maxAttempts} attempts — the quota may have ` +
      'been raised, or was already partially consumed by other activity in a way that needs more attempts.',
  );
}

/**
 * Sets users.email to NULL directly via the database — simulates the "user without an
 * email" edge case (WEB-USR-11). Does not change the auth.users email (that remains a real,
 * valid account), only the denormalized display field the Users page uses.
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const { data } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

export async function setUserEmailToNull(userId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('users').update({ email: null }).eq('id', userId);
  if (error) {
    throw new Error(`Unable to set email to null: ${error.message}`);
  }
}

export async function deleteTestUser(userId: string) {
  const supabase = supabaseAdmin();

  // The trigger that creates the public.users row also (indirectly) creates an
  // inventory_locations row for that driver — it must be deleted BEFORE the users row
  // because of an ON DELETE RESTRICT FK.
  const { error: locationError } = await supabase.from('inventory_locations').delete().eq('driver_id', userId);
  if (locationError) {
    throw new Error(`Unable to delete inventory location: ${locationError.message}`);
  }

  const { error: profileError } = await supabase.from('users').delete().eq('id', userId);
  if (profileError) {
    throw new Error(`Unable to delete profile: ${profileError.message}`);
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    throw new Error(`Unable to delete auth account: ${authError.message}`);
  }
}

/**
 * Creates an auth.users account WITHOUT a matching public.users row (the DB trigger
 * creates one automatically on insert, so we deliberately delete it here) — simulates an
 * "orphan" auth account for WEB-AUTH-04 (missing profile).
 */
export async function createUserWithoutProfile(params: {
  email: string;
  password: string;
}) {
  const supabase = supabaseAdmin();

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    throw new Error(`Unable to create auth account: ${authError?.message}`);
  }

  // The trigger that creates the public.users row also (indirectly, via another trigger)
  // creates an inventory_locations row for that driver — it must be deleted BEFORE the
  // users row because of the FK.
  await supabase.from('inventory_locations').delete().eq('driver_id', authUser.user.id);

  const { error: deleteError } = await supabase.from('users').delete().eq('id', authUser.user.id);
  if (deleteError) {
    throw new Error(`Unable to delete the profile row: ${deleteError.message}`);
  }

  return authUser.user.id;
}
