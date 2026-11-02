import { supabaseAdmin } from './supabaseAdmin';

// generateLink (admin API) NE šalje stvarni email — samo vraća link podatke — pa zaobilazi
// Supabase rate-limit na slanje reset-password email-ova (poznat gap kod WEB-USR-01). Navigacija
// na vraćeni action_link reprodukuje TAČNO isti tok kao klik na link iz pravog email-a: Supabase
// verifikuje token i redirektuje na našu /auth/callback rutu, koja razmenjuje kod za sesiju.
export async function generateRecoveryActionLink(email: string, redirectTo: string): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    throw new Error(`Ne mogu da generišem recovery link: ${error?.message}`);
  }

  return data.properties.action_link;
}
