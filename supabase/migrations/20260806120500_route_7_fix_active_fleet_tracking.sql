-- ROUTE-7: Fix active fleet tracking
--
-- This migration:
-- 1. Restricts location inserts to clocked-in field staff.
-- 2. Creates an RLS-respecting view of active fleet locations.
-- 3. Returns only the latest recent ping for each active driver.
-- 4. Includes driver and route display information.
-- 5. Adds an index for efficient latest-location queries.


-- ============================================================
-- 1. Improve latest-ping lookup performance
-- ============================================================

create index if not exists location_pings_driver_recorded_at_idx
on public.location_pings (
  driver_id,
  recorded_at desc
);


-- ============================================================
-- 2. Harden the location-ping INSERT policy
-- ============================================================

-- Remove the old policy, which allowed field staff to insert
-- location pings even when they were not clocked in.
drop policy if exists
  "Field staff can insert own location pings"
on public.location_pings;

-- Also remove this policy if this migration is reapplied after
-- a previous development attempt.
drop policy if exists
  "Clocked-in field staff can insert own location pings"
on public.location_pings;

create policy "Clocked-in field staff can insert own location pings"
on public.location_pings
for insert
to authenticated
with check (
  public.is_field_staff()
  and driver_id = auth.uid()
  and exists (
    select 1
    from public.time_entries
    where time_entries.driver_id = auth.uid()
      and time_entries.status in (
        'open'::public.time_entry_status,
        'manager_override'::public.time_entry_status
      )
      and time_entries.clock_out_at is null
  )
);


-- ============================================================
-- 3. Create the active-fleet view
-- ============================================================

drop view if exists public.active_fleet_locations;

create view public.active_fleet_locations
with (security_invoker = true)
as
select distinct on (ping.driver_id)
  ping.id,
  ping.driver_id,
  ping.route_id,
  ping.latitude,
  ping.longitude,
  ping.accuracy_meters,
  ping.heading,
  ping.speed_meters_per_second,
  ping.recorded_at,
  ping.created_at,

  driver.full_name as driver_full_name,
  driver.email as driver_email,
  driver.region as driver_region,

  fleet_route.route_date,
  fleet_route.status as route_status

from public.location_pings as ping

join public.users as driver
  on driver.id = ping.driver_id

left join public.routes as fleet_route
  on fleet_route.id = ping.route_id

where
  -- Do not display stale positions.
  ping.recorded_at >= now() - interval '10 minutes'

  -- Only display drivers with an active clock-in entry.
  and exists (
    select 1
    from public.time_entries as active_entry
    where active_entry.driver_id = ping.driver_id
      and active_entry.status in (
        'open'::public.time_entry_status,
        'manager_override'::public.time_entry_status
      )
      and active_entry.clock_out_at is null
  )

-- DISTINCT ON keeps the first row for each driver.
-- Descending recorded_at therefore selects their latest ping.
order by
  ping.driver_id,
  ping.recorded_at desc,
  ping.created_at desc;


-- ============================================================
-- 4. Configure view access
-- ============================================================

-- The fleet view must never be publicly accessible.
revoke all
on public.active_fleet_locations
from anon;

-- Authenticated access still remains subject to the underlying
-- location_pings, users, routes, and time_entries RLS policies
-- because the view uses security_invoker = true.
grant select
on public.active_fleet_locations
to authenticated;


-- ============================================================
-- 5. Document the view
-- ============================================================

comment on view public.active_fleet_locations is
  'Latest location ping from the previous 10 minutes for each clocked-in driver. Uses security_invoker so underlying RLS policies restrict managers by region while allowing CEOs company-wide visibility.';