import { supabaseAdmin } from './supabaseAdmin';

// generateLink (admin API) NE šalje stvarni email — samo vraća link podatke — pa zaobilazi
// Supabase rate-limit na slanje reset-password email-ova (poznat gap kod WEB-USR-01).
//
// NAPOMENA: `action_link` iz odgovora NIJE isti tok kao klik na pravi email link — on prolazi
// kroz Supabase-ov hostovani /auth/v1/verify, koji sesiju vraća kao HASH FRAGMENT na redirectTo
// (implicit flow), što naša /auth/recovery ruta ne čita (ona čita token_hash iz QUERY stringa,
// jer stvarni email template koristi {{ .TokenHash }}). Zato ovde gradimo link ručno sa
// `hashed_token`, tačno kao što to radi pravi email template — ne koristimo action_link.
export async function generateRecoveryActionLink(email: string, redirectTo: string): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.hashed_token) {
    throw new Error(`Ne mogu da generišem recovery link: ${error?.message}`);
  }

  return `${redirectTo}?token_hash=${data.properties.hashed_token}&type=recovery`;
}
