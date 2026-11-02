-- Restore client signatures captured during Review & Complete.
-- The original table was removed during the service visit
-- simplification, but signature capture is now supported again.

create table public.service_visit_signatures (
  id uuid primary key default gen_random_uuid(),

  signed_by uuid not null
    references public.users(id)
    on delete restrict,

  source_visit_id text not null,

  stop_id uuid not null
    references public.stops(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  machine_id uuid not null
    references public.machines(id)
    on delete cascade,

  storage_path text not null,
  signed_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_visit_signatures_unique_visit
    unique (source_visit_id)
);

create index idx_service_visit_signatures_signed_by
  on public.service_visit_signatures(signed_by);

create index idx_service_visit_signatures_stop
  on public.service_visit_signatures(stop_id);

create index idx_service_visit_signatures_client
  on public.service_visit_signatures(client_id);

create index idx_service_visit_signatures_machine
  on public.service_visit_signatures(machine_id);

alter table public.service_visit_signatures
  enable row level security;

create policy "Drivers manage own service signatures"
on public.service_visit_signatures
for all
to authenticated
using (signed_by = (select auth.uid()))
with check (signed_by = (select auth.uid()));

create policy "Managers manage regional service signatures"
on public.service_visit_signatures
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.users u
    where u.id = signed_by
      and u.region = public.current_user_region()
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.users u
    where u.id = signed_by
      and u.region = public.current_user_region()
  )
);

create policy "CEOs manage all service signatures"
on public.service_visit_signatures
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

grant select, insert, update, delete
on public.service_visit_signatures
to authenticated;