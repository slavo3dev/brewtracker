import { supabaseAdmin } from './supabaseAdmin';

// generateLink (admin API) does NOT send a real email — it only returns link data — so it
// bypasses Supabase's rate limit on reset-password emails (a known gap, see WEB-USR-01).
//
// NOTE: the `action_link` from the response is NOT the same flow as clicking the real email
// link — it goes through Supabase's hosted /auth/v1/verify, which returns the session as a
// HASH FRAGMENT on redirectTo (implicit flow), which our /auth/recovery route does not read
// (it reads token_hash from the QUERY string, since the real email template uses
// {{ .TokenHash }}). So here we build the link manually with `hashed_token`, exactly like the
// real email template does — we don't use action_link.
export async function generateRecoveryActionLink(email: string, redirectTo: string): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.hashed_token) {
    throw new Error(`Unable to generate recovery link: ${error?.message}`);
  }

  return `${redirectTo}?token_hash=${data.properties.hashed_token}&type=recovery`;
}
