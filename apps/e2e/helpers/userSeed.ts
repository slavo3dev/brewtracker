import { supabaseAdmin } from './supabaseAdmin';

/**
 * Pravi test nalog direktno preko Supabase admin API-ja (bez slanja setup email-a),
 * i odmah mu postavlja poznatu lozinku + role. Koristi se kada test treba nalog sa
 * tačno poznatim kredencijalima, a UI flow bi inače zahtevao slanje pravog email-a.
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
    throw new Error(`Ne mogu da napravim auth nalog: ${authError?.message}`);
  }

  // Napomena: baza ima trigger koji automatski pravi red u public.users čim se napravi
  // auth nalog (sa default role='driver', is_active=true) — zato ovde radimo UPDATE, ne INSERT.
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
    throw new Error(`Ne mogu da ažuriram users red: ${profileError.message}`);
  }

  return authUser.user.id;
}

/**
 * Postavlja users.email na NULL direktno preko baze — simulira "korisnik bez email-a"
 * edge case (WEB-USR-11). Ne menja auth.users email (ostaje isti realan nalog), samo
 * denormalizovano display polje koje Users stranica koristi.
 */
export async function setUserEmailToNull(userId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('users').update({ email: null }).eq('id', userId);
  if (error) {
    throw new Error(`Ne mogu da postavim email na null: ${error.message}`);
  }
}

export async function deleteTestUser(userId: string) {
  const supabase = supabaseAdmin();
  await supabase.from('users').delete().eq('id', userId);
  await supabase.auth.admin.deleteUser(userId);
}

/**
 * Pravi auth.users nalog BEZ odgovarajućeg public.users reda (DB trigger ga automatski
 * napravi na insert, pa ga ovde namerno brišemo) — simulira "orphan" auth nalog za
 * WEB-AUTH-04 (profil nedostaje).
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
    throw new Error(`Ne mogu da napravim auth nalog: ${authError?.message}`);
  }

  // Trigger koji pravi public.users red takođe (posredno, preko drugog triggera) pravi i
  // inventory_locations red za tog vozača — mora se obrisati PRE users reda zbog FK-a.
  await supabase.from('inventory_locations').delete().eq('driver_id', authUser.user.id);

  const { error: deleteError } = await supabase.from('users').delete().eq('id', authUser.user.id);
  if (deleteError) {
    throw new Error(`Ne mogu da obrišem profil red: ${deleteError.message}`);
  }

  return authUser.user.id;
}
