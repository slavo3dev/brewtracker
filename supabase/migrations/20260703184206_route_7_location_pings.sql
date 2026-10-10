create table if not exists public.location_pings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision,
  heading double precision,
  speed_meters_per_second double precision,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.location_pings enable row level security;

create index if not exists location_pings_driver_id_idx
on public.location_pings(driver_id);

create index if not exists location_pings_route_id_idx
on public.location_pings(route_id);

create index if not exists location_pings_recorded_at_idx
on public.location_pings(recorded_at desc);

create policy "Field staff can insert own location pings"
on public.location_pings
for insert
to authenticated
with check (
  public.is_field_staff()
  and driver_id = auth.uid()
);

create policy "Managers can read location pings in region"
on public.location_pings
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.users driver
    where driver.id = location_pings.driver_id
      and driver.region = public.current_user_region()
  )
);

create policy "CEO can read all location pings"
on public.location_pings
for select
to authenticated
using (public.is_ceo());

alter publication supabase_realtime add table public.location_pings;