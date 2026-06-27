create type public.time_entry_status as enum (
  'open',
  'closed',
  'flagged',
  'manager_override'
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(id),
  warehouse_id uuid references public.warehouses(id),
  clock_in_at timestamptz not null default now(),
  clock_in_latitude double precision,
  clock_in_longitude double precision,
  clock_in_selfie_url text,
  clock_out_at timestamptz,
  clock_out_latitude double precision,
  clock_out_longitude double precision,
  status public.time_entry_status not null default 'open',
  is_geofence_override boolean not null default false,
  override_reason text,
  override_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index time_entries_driver_idx on public.time_entries(driver_id);
create index time_entries_status_idx on public.time_entries(status);
create index time_entries_clock_in_idx on public.time_entries(clock_in_at);

alter table public.time_entries enable row level security;

create policy "Drivers can read own time entries"
on public.time_entries
for select
to authenticated
using (driver_id = auth.uid());

create policy "Drivers can insert own time entries"
on public.time_entries
for insert
to authenticated
with check (driver_id = auth.uid());

create policy "Drivers can update own open time entries"
on public.time_entries
for update
to authenticated
using (driver_id = auth.uid() and status = 'open')
with check (driver_id = auth.uid());

create policy "CEO can read all time entries"
on public.time_entries
for select
to authenticated
using (public.is_ceo());

create policy "Managers can read regional time entries"
on public.time_entries
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.users
    where users.id = time_entries.driver_id
      and users.region = public.current_user_region()
  )
);

create policy "Managers can update regional time entries"
on public.time_entries
for update
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.users
    where users.id = time_entries.driver_id
      and users.region = public.current_user_region()
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.users
    where users.id = time_entries.driver_id
      and users.region = public.current_user_region()
  )
);

create policy "CEO can manage all time entries"
on public.time_entries
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());