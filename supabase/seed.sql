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

------------------------------------------------------------
-- Forgotten clock-out / auto-close candidate
------------------------------------------------------------

insert into public.time_entries (
  id,
  driver_id,
  warehouse_id,
  clock_in_at,
  clock_out_at,
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
  now() - interval '1 hour',
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
-- LOCATION PINGS / FLEET MAP
------------------------------------------------------------

insert into public.location_pings (
  driver_id,
  route_id,
  latitude,
  longitude,
  accuracy_meters,
  heading,
  speed_meters_per_second,
  recorded_at
)
values (
  '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6',
  '44444444-4444-4444-8444-444444444444',
  44.8176,
  20.4569,
  12,
  90,
  8.5,
  now()
);
-- CLIENTS
------------------------------------------------------------

insert into public.clients (
  id,
  name,
  address,
  city,
  region,
  latitude,
  longitude,
  geofence_radius_meters
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Downtown Coffee Office',
    'Knez Mihailova 10',
    'Belgrade',
    'Belgrade',
    44.8176,
    20.4569,
    120
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Riverside Hotel',
    'Karađorđeva 48',
    'Belgrade',
    'Belgrade',
    44.8132,
    20.4499,
    120
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Tech Park Cafe',
    'Bulevar Milutina Milankovića 11',
    'Belgrade',
    'Belgrade',
    44.8111,
    20.4098,
    120
  )
on conflict (id) do update
set
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  region = excluded.region,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  geofence_radius_meters = excluded.geofence_radius_meters,
  updated_at = now();

------------------------------------------------------------
-- MACHINES
------------------------------------------------------------

insert into public.machines (
  id,
  client_id,
  name,
  model,
  serial_number,
  qr_code,
  status
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'Lobby Espresso Machine',
    'La Marzocco Linea Mini',
    'LM-001',
    'QR-LM-001',
    'active'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'Hotel Breakfast Machine',
    'Rancilio Classe 5',
    'RC-002',
    'QR-RC-002',
    'active'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '33333333-3333-4333-8333-333333333333',
    'Cafe Service Machine',
    'Nuova Simonelli Appia',
    'NS-003',
    'QR-NS-003',
    'active'
  )
on conflict (id) do update
set
  client_id = excluded.client_id,
  name = excluded.name,
  model = excluded.model,
  serial_number = excluded.serial_number,
  qr_code = excluded.qr_code,
  status = excluded.status,
  updated_at = now();

------------------------------------------------------------
-- ROUTES
------------------------------------------------------------

insert into public.routes (
  id,
  driver_id,
  warehouse_id,
  route_date,
  status,
  notes,
  created_by
)
values (
  '44444444-4444-4444-8444-444444444444',
  '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6',
  '1df74005-fb1f-48dc-8e72-d27401773795',
  current_date,
  'scheduled',
  'Demo route for ROUTE-2 testing.',
  '03523b9b-50bf-499d-8081-d5dfd8bbb66a'
)
on conflict (id) do update
set
  driver_id = excluded.driver_id,
  warehouse_id = excluded.warehouse_id,
  route_date = excluded.route_date,
  status = excluded.status,
  notes = excluded.notes,
  created_by = excluded.created_by,
  updated_at = now();

------------------------------------------------------------
-- STOPS
------------------------------------------------------------

insert into public.stops (
  id,
  route_id,
  client_id,
  machine_id,
  sequence_number,
  scheduled_start_at,
  scheduled_end_at,
  status,
  notes
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    1,
    now() + interval '1 hour',
    now() + interval '2 hours',
    'pending',
    'First demo stop.'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    2,
    now() + interval '2 hours',
    now() + interval '3 hours',
    'pending',
    'Second demo stop.'
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    '44444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    3,
    now() + interval '3 hours',
    now() + interval '4 hours',
    'pending',
    'Third demo stop.'
  )
on conflict (id) do update
set
  route_id = excluded.route_id,
  client_id = excluded.client_id,
  machine_id = excluded.machine_id,
  sequence_number = excluded.sequence_number,
  scheduled_start_at = excluded.scheduled_start_at,
  scheduled_end_at = excluded.scheduled_end_at,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

------------------------------------------------------------
-- AUTH-4 MOBILE CLOCK-IN TEST DATA
------------------------------------------------------------

-- Ensure the demo driver starts with NO open shift.

delete from public.time_entries
where driver_id = '0d6aa3f3-63ec-4262-b811-3e28edf6384e'
  and status in ('open', 'manager_override');

------------------------------------------------------------
-- Ensure today's route exists
------------------------------------------------------------

insert into public.routes (
  id,
  driver_id,
  warehouse_id,
  route_date,
  status,
  notes,
  created_by
)
values (
  '44444444-4444-4444-8444-444444444444',
  '9bbd5f7d-d80f-48bd-a259-d9da7f89b0f6',
  '1df74005-fb1f-48dc-8e72-d27401773795',
  current_date,
  'scheduled',
  'AUTH-4 mobile testing route.',
  '03523b9b-50bf-499d-8081-d5dfd8bbb66a'
)
on conflict (id) do update
set
  route_date = current_date,
  status = 'scheduled',
  updated_at = now();