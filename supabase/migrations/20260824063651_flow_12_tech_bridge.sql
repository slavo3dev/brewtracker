-- =====================================================
-- FLOW-12 - Tech Bridge
-- =====================================================

create type public.technical_ticket_status as enum (
  'open',
  'in_progress',
  'resolved',
  'cancelled'
);

create table public.technical_tickets (
  id uuid primary key default gen_random_uuid(),

  reported_by uuid not null
    references public.users(id)
    on delete restrict,

  source_visit_id text not null,

  stop_id uuid not null
    references public.stops(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete restrict,

  machine_id uuid not null
    references public.machines(id)
    on delete restrict,

  description text not null,

  status public.technical_ticket_status
    not null default 'open',

  assigned_to uuid
    references public.users(id)
    on delete set null,

  photo_storage_path text,

  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint technical_tickets_description_not_empty
    check (length(trim(description)) > 0)
);

create index technical_tickets_machine_idx
  on public.technical_tickets(machine_id);

create index technical_tickets_stop_idx
  on public.technical_tickets(stop_id);

create index technical_tickets_reported_by_idx
  on public.technical_tickets(reported_by);

create index technical_tickets_status_idx
  on public.technical_tickets(status);

alter table public.technical_tickets
enable row level security;

-- Driver can create tickets belonging to themselves.
create policy "Drivers create own technical tickets"
on public.technical_tickets
for insert
to authenticated
with check (
  reported_by = auth.uid()
);

-- Driver can read tickets they reported.
create policy "Drivers read own technical tickets"
on public.technical_tickets
for select
to authenticated
using (
  reported_by = auth.uid()
);

-- Managers can access tickets in their region.
create policy "Managers manage regional technical tickets"
on public.technical_tickets
for all
to authenticated
using (
  is_manager()
  and exists (
    select 1
    from public.users reporter
    where reporter.id = reported_by
      and reporter.region = current_user_region()
  )
)
with check (
  is_manager()
  and exists (
    select 1
    from public.users reporter
    where reporter.id = reported_by
      and reporter.region = current_user_region()
  )
);

-- CEO has full access.
create policy "CEOs manage all technical tickets"
on public.technical_tickets
for all
to authenticated
using (is_ceo())
with check (is_ceo());