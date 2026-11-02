import { supabaseAdmin } from './supabaseAdmin';

const TICKET_ID = 'd3e29542-37f9-4d1b-b9c0-fd8644413eb4'; // "QA TT-05 ticket without photo"
const KNOWN_TECH_ID = '13aa6a69-4ef6-46d8-a7f1-6c389238f39f';

export async function resetTicketToOpen() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'open', assigned_to: null, resolved_at: null })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Ne mogu da resetujem tiket na open: ${error.message}`);
  }
}

export async function resetTicketToResolved() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'resolved', assigned_to: KNOWN_TECH_ID, resolved_at: new Date().toISOString() })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Ne mogu da resetujem tiket na resolved: ${error.message}`);
  }
}

export async function resetTicketToInProgressAssigned() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'in_progress', assigned_to: KNOWN_TECH_ID, resolved_at: null })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Ne mogu da resetujem tiket na in_progress: ${error.message}`);
  }
}

// Rubni slučaj koji UI ne može prirodno da proizvede (dodela tehničara UVEK postavlja i
// assigned_to i status zajedno) — direktno preko baze simuliramo in_progress tiket BEZ
// dodeljenog tehničara, za WEB-TT-08.
export async function resetTicketToInProgressNoAssignee() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'in_progress', assigned_to: null, resolved_at: null })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Ne mogu da resetujem tiket na in_progress bez dodele: ${error.message}`);
  }
}

// "Istinit" broj tiketa po statusu za dati region klijenta — direktno preko servisne role
// (bez RLS), koristi se kao referenca za WEB-TT-01 (status kartice na /dashboard/service
// ne odgovaraju stvarnim podacima regiona zbog RLS filtriranja po TRENUTNOM regionu mašine,
// umesto po regionu samog tiketa/klijenta — poznat, dokumentovan gap).
export async function getTrueTicketCountsByRegion(
  region: string,
): Promise<{ open: number; inProgress: number; resolved: number }> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('technical_tickets')
    .select('status, client:clients!technical_tickets_client_id_fkey(region)');

  if (error) {
    throw new Error(`Ne mogu da učitam tehničke tikete: ${error.message}`);
  }

  const regionTickets = (data ?? []).filter((t) => (t.client as unknown as { region: string | null })?.region === region);

  return {
    open: regionTickets.filter((t) => t.status === 'open').length,
    inProgress: regionTickets.filter((t) => t.status === 'in_progress').length,
    resolved: regionTickets.filter((t) => t.status === 'resolved').length,
  };
}
