import { supabaseAdmin } from './supabaseAdmin';

const TICKET_ID = '3b692462-72e9-413a-b16d-23924a10410c'; // "QA TT-05 ticket without photo"
const KNOWN_TECH_ID = '8e3c70cc-1e26-4e09-8970-8e626bc4dae6'; // "Test"

export async function resetTicketToOpen() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'open', assigned_to: null, resolved_at: null })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Unable to reset ticket to open: ${error.message}`);
  }
}

export async function resetTicketToResolved() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'resolved', assigned_to: KNOWN_TECH_ID, resolved_at: new Date().toISOString() })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Unable to reset ticket to resolved: ${error.message}`);
  }
}

export async function resetTicketToInProgressAssigned() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'in_progress', assigned_to: KNOWN_TECH_ID, resolved_at: null })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Unable to reset ticket to in_progress: ${error.message}`);
  }
}

// Edge case the UI cannot naturally produce (assigning a technician ALWAYS sets both
// assigned_to and status together) — we simulate an in_progress ticket WITHOUT an assigned
// technician directly via the database, for WEB-TT-08.
export async function resetTicketToInProgressNoAssignee() {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('technical_tickets')
    .update({ status: 'in_progress', assigned_to: null, resolved_at: null })
    .eq('id', TICKET_ID);

  if (error) {
    throw new Error(`Unable to reset ticket to in_progress without an assignee: ${error.message}`);
  }
}

// The "true" ticket count by status for a given client region — directly via the service
// role (no RLS), used as a reference for WEB-TT-01 (the status cards on /dashboard/service
// don't match the real region data, because RLS filters by the machine's CURRENT region
// rather than the ticket's/client's own region — a known, documented gap).
export async function getTrueTicketCountsByRegion(
  region: string,
): Promise<{ open: number; inProgress: number; resolved: number }> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('technical_tickets')
    .select('status, client:clients!technical_tickets_client_id_fkey(region)');

  if (error) {
    throw new Error(`Unable to load technical tickets: ${error.message}`);
  }

  const regionTickets = (data ?? []).filter((t) => (t.client as unknown as { region: string | null })?.region === region);

  return {
    open: regionTickets.filter((t) => t.status === 'open').length,
    inProgress: regionTickets.filter((t) => t.status === 'in_progress').length,
    resolved: regionTickets.filter((t) => t.status === 'resolved').length,
  };
}
