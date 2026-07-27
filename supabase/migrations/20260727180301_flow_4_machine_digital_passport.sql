------------------------------------------------------------
-- FLOW-4: Machine Digital Passport
------------------------------------------------------------

create table public.machine_meter_readings (
  id uuid primary key default gen_random_uuid(),

  machine_id uuid not null
    references public.machines(id)
    on delete cascade,

  service_stop_id uuid
    references public.stops(id)
    on delete set null,

  recorded_by uuid
    references public.users(id)
    on delete set null,

  reading bigint not null
    check (reading >= 0),

  recorded_at timestamptz not null default now(),

  notes text,

  created_at timestamptz not null default now()
);

create index machine_meter_readings_machine_recorded_idx
  on public.machine_meter_readings (
    machine_id,
    recorded_at desc
  );

create index machine_meter_readings_stop_idx
  on public.machine_meter_readings (
    service_stop_id
  );

alter table public.machine_meter_readings
  enable row level security;

------------------------------------------------------------
-- CEO access
------------------------------------------------------------

create policy "CEO can read all machine meter readings"
on public.machine_meter_readings
for select
to authenticated
using (public.is_ceo());

create policy "CEO can manage all machine meter readings"
on public.machine_meter_readings
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

------------------------------------------------------------
-- Manager access by machine/client region
------------------------------------------------------------

create policy "Managers can read regional machine meter readings"
on public.machine_meter_readings
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.machines m
    join public.clients c
      on c.id = m.client_id
    where m.id = machine_meter_readings.machine_id
      and c.region = public.current_user_region()
  )
);

------------------------------------------------------------
-- Driver access for assigned route stops
------------------------------------------------------------

create policy "Drivers can read assigned machine meter readings"
on public.machine_meter_readings
for select
to authenticated
using (
  public.is_driver()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.machine_id = machine_meter_readings.machine_id
      and r.driver_id = auth.uid()
  )
);

create policy "Drivers can insert assigned machine meter readings"
on public.machine_meter_readings
for insert
to authenticated
with check (
  public.is_driver()
  and recorded_by = auth.uid()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.id = machine_meter_readings.service_stop_id
      and s.machine_id = machine_meter_readings.machine_id
      and r.driver_id = auth.uid()
  )
);