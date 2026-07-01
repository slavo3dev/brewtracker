------------------------------------------------------------
-- BrewTracker Development Seed
-- Purpose:
--   Demo data for staging/development.
--   Safe to execute multiple times.
------------------------------------------------------------

------------------------------------------------------------
-- WAREHOUSES
------------------------------------------------------------

update public.warehouses
set
  latitude = 44.8125,
  longitude = 20.4612,
  geofence_radius_meters = 150
where id = '1df74005-fb1f-48dc-8e72-d27401773795';

------------------------------------------------------------
-- TIME ENTRIES / REVIEW QUEUE
------------------------------------------------------------

-- Normal pending clock-in

insert into public.time_entries (
  id,
  driver_id,
  warehouse_id,
  clock_in_at,
  clock_in_latitude,
  clock_in_longitude,
  clock_in_selfie_url,
  review_status,
  status
)
select
  gen_random_uuid(),
  '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6',
  '1df74005-fb1f-48dc-8e72-d27401773795',
  now() - interval '15 minutes',
  44.8125,
  20.4612,
  'https://picsum.photos/600/800',
  'pending',
  'open'
where not exists (
  select 1
  from public.time_entries
  where driver_id = '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6'
    and review_status = 'pending'
    and status = 'open'
    and is_geofence_override = false
);

------------------------------------------------------------
-- Outside geofence / manager override
------------------------------------------------------------

insert into public.time_entries (
  id,
  driver_id,
  warehouse_id,
  clock_in_at,
  clock_in_latitude,
  clock_in_longitude,
  is_geofence_override,
  override_reason,
  review_status,
  status
)
select
  gen_random_uuid(),
  '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6',
  '1df74005-fb1f-48dc-8e72-d27401773795',
  now() - interval '40 minutes',
  44.8500,
  20.5200,
  true,
  'GPS location outside warehouse geofence.',
  'pending',
  'manager_override'
where not exists (
  select 1
  from public.time_entries
  where driver_id = '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6'
    and review_status = 'pending'
    and status = 'manager_override'
    and is_geofence_override = true
);

------------------------------------------------------------
-- Missing selfie / flagged
------------------------------------------------------------

insert into public.time_entries (
  id,
  driver_id,
  warehouse_id,
  clock_in_at,
  review_reason,
  review_status,
  status
)
select
  gen_random_uuid(),
  '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6',
  '1df74005-fb1f-48dc-8e72-d27401773795',
  now() - interval '1 hour',
  'Driver failed selfie verification.',
  'pending',
  'flagged'
where not exists (
  select 1
  from public.time_entries
  where driver_id = '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6'
    and review_reason = 'Driver failed selfie verification.'
);

------------------------------------------------------------
-- Approved entry
-- Should NOT appear in review queue
------------------------------------------------------------

insert into public.time_entries (
  id,
  driver_id,
  warehouse_id,
  clock_in_at,
  review_status,
  reviewed_by,
  reviewed_at,
  review_note,
  status
)
select
  gen_random_uuid(),
  '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6',
  '1df74005-fb1f-48dc-8e72-d27401773795',
  now() - interval '2 hours',
  'approved',
  '03523b9b-50bf-499d-8081-d5dfd8bbb66a',
  now() - interval '90 minutes',
  'Clock-in verified.',
  'closed'
where not exists (
  select 1
  from public.time_entries
  where driver_id = '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6'
    and review_status = 'approved'
    and status = 'closed'
);

------------------------------------------------------------
-- REVIEW SUMMARY
------------------------------------------------------------
-- Pending review queue should show:
--   1. Normal open clock-in
--   2. Outside geofence manager override
--   3. Missing selfie flagged entry
--
-- Review queue should NOT show:
--   1. Approved closed entry
------------------------------------------------------------