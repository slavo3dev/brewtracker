------------------------------------------------------------
-- AUTH-4 Clock-in/out foundation
------------------------------------------------------------

------------------------------------------------------------
-- FIELD STAFF WAREHOUSE ACCESS
------------------------------------------------------------

drop policy if exists
  "Drivers can read assigned route warehouse"
on public.warehouses;

create policy "Field staff can read assigned route warehouse"
on public.warehouses
for select
to authenticated
using (
  public.is_field_staff()
  and exists (
    select 1
    from public.routes
    where routes.warehouse_id = warehouses.id
      and routes.driver_id = auth.uid()
  )
);

------------------------------------------------------------
-- FIELD STAFF CLIENT ACCESS
------------------------------------------------------------

drop policy if exists
  "Drivers can read clients on assigned stops"
on public.clients;

create policy "Field staff can read clients on assigned stops"
on public.clients
for select
to authenticated
using (
  public.is_field_staff()
  and exists (
    select 1
    from public.stops
    join public.routes
      on routes.id = stops.route_id
    where stops.client_id = clients.id
      and routes.driver_id = auth.uid()
  )
);

------------------------------------------------------------
-- FIELD STAFF MACHINE ACCESS
------------------------------------------------------------

drop policy if exists
  "Drivers can read machines on assigned stops"
on public.machines;

create policy "Field staff can read machines on assigned stops"
on public.machines
for select
to authenticated
using (
  public.is_field_staff()
  and exists (
    select 1
    from public.stops
    join public.routes
      on routes.id = stops.route_id
    where stops.machine_id = machines.id
      and routes.driver_id = auth.uid()
  )
);

------------------------------------------------------------
-- FIELD STAFF TIME ENTRY POLICIES
------------------------------------------------------------

drop policy if exists
  "Drivers can read own time entries"
on public.time_entries;

drop policy if exists
  "Drivers can insert own time entries"
on public.time_entries;

drop policy if exists
  "Drivers can update own open time entries"
on public.time_entries;

create policy "Field staff can read own time entries"
on public.time_entries
for select
to authenticated
using (
  public.is_field_staff()
  and driver_id = auth.uid()
);

create policy "Field staff can insert own time entries"
on public.time_entries
for insert
to authenticated
with check (
  public.is_field_staff()
  and driver_id = auth.uid()
);

create policy "Field staff can update own open time entries"
on public.time_entries
for update
to authenticated
using (
  public.is_field_staff()
  and driver_id = auth.uid()
  and status = 'open'
)
with check (
  public.is_field_staff()
  and driver_id = auth.uid()
);

------------------------------------------------------------
-- PREVENT MULTIPLE OPEN SHIFTS
------------------------------------------------------------

create unique index if not exists
  time_entries_one_open_entry_per_driver_idx
on public.time_entries(driver_id)
where status = 'open';

------------------------------------------------------------
-- GEOFENCE OVERRIDE VALIDATION
------------------------------------------------------------

alter table public.time_entries
drop constraint if exists
  time_entries_override_requires_reason;

alter table public.time_entries
add constraint time_entries_override_requires_reason
check (
  is_geofence_override = false
  or nullif(trim(override_reason), '') is not null
);

------------------------------------------------------------
-- TIMESTAMP VALIDATION
------------------------------------------------------------

alter table public.time_entries
drop constraint if exists
  time_entries_clock_out_after_clock_in;

alter table public.time_entries
add constraint time_entries_clock_out_after_clock_in
check (
  clock_out_at is null
  or clock_out_at >= clock_in_at
);