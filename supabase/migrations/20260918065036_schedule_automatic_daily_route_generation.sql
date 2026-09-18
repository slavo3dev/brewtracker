-- ROUTE
-- Automatic Daily Route Generation
--
-- Responsibilities:
-- 1. Keep generation idempotent even if two processes invoke it.
-- 2. Prevent application users from invoking the generator directly.
-- 3. Schedule generation once per day.
--
-- Existing unique index remains the final database-level duplicate guard:
--
-- routes_template_generation_unique_idx
--   (source_route_template_id, route_date)
--   where source_route_template_id is not null;


-- ============================================================
-- 1. Harden the generator against concurrent execution
-- ============================================================

create or replace function public.generate_routes_from_templates(
  p_route_date date
)
returns table (
  route_id uuid,
  route_template_id uuid,
  driver_id uuid,
  route_date date,
  stops_created integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_route_id uuid;
  v_stops_created integer;
  v_day_of_week integer;
begin
  if p_route_date is null then
    raise exception 'Route date is required.';
  end if;

  v_day_of_week :=
    extract(dow from p_route_date)::integer;

  for v_template in
    select
      rt.id,
      rt.driver_id,
      rt.warehouse_id,
      rt.notes
    from public.route_templates rt
    where rt.is_active = true
      and (
        (v_day_of_week = 0 and rt.sunday)
        or
        (v_day_of_week = 1 and rt.monday)
        or
        (v_day_of_week = 2 and rt.tuesday)
        or
        (v_day_of_week = 3 and rt.wednesday)
        or
        (v_day_of_week = 4 and rt.thursday)
        or
        (v_day_of_week = 5 and rt.friday)
        or
        (v_day_of_week = 6 and rt.saturday)
      )
    order by rt.created_at, rt.id
  loop

    -- An active template must have at least one stop.
    -- This is defensive because ROUTE-1 already prevents
    -- activation without stops.
    if not exists (
      select 1
      from public.route_template_stops rts
      where rts.route_template_id =
        v_template.id
    ) then
      continue;
    end if;

    -- Insert the operational route.
    --
    -- The partial unique index on:
    --
    --   source_route_template_id + route_date
    --
    -- is the authoritative idempotency guard.
    --
    -- ON CONFLICT DO NOTHING also makes concurrent invocations safe.
    insert into public.routes (
      driver_id,
      warehouse_id,
      route_date,
      status,
      notes,
      source_route_template_id
    )
    values (
      v_template.driver_id,
      v_template.warehouse_id,
      p_route_date,
      'scheduled',
      v_template.notes,
      v_template.id
    )
    on conflict do nothing
    returning id
    into v_route_id;

    -- No row was inserted.
    --
    -- This means this template/date has already been generated
    -- or another concurrent invocation generated it first.
    if v_route_id is null then
      continue;
    end if;

    -- Copy template stops into operational stops.
    --
    -- These become snapshots. Future edits to the template
    -- do not modify this generated route.
    insert into public.stops (
      route_id,
      client_id,
      machine_id,
      sequence_number,
      status,
      scheduled_start_at,
      scheduled_end_at,
      notes,
      drink_count_required
    )
    select
      v_route_id,
      rts.client_id,
      rts.machine_id,
      rts.sequence_number,
      'pending',

      case
        when rts.scheduled_start_time is null
          then null
        else
          p_route_date::timestamp
          + rts.scheduled_start_time
      end,

      case
        when rts.scheduled_end_time is null
          then null
        else
          p_route_date::timestamp
          + rts.scheduled_end_time
      end,

      rts.notes,
      rts.drink_count_required
    from public.route_template_stops rts
    where rts.route_template_id =
      v_template.id
    order by rts.sequence_number;

    get diagnostics
      v_stops_created = row_count;

    return query
    select
      v_route_id,
      v_template.id::uuid,
      v_template.driver_id::uuid,
      p_route_date,
      v_stops_created;

  end loop;
end;
$$;


-- ============================================================
-- 2. Do not expose generator to normal application users
-- ============================================================

revoke all
on function public.generate_routes_from_templates(date)
from public;

revoke all
on function public.generate_routes_from_templates(date)
from anon;

revoke all
on function public.generate_routes_from_templates(date)
from authenticated;

grant execute
on function public.generate_routes_from_templates(date)
to service_role;


-- ============================================================
-- 3. Enable pg_cron
-- ============================================================

create extension if not exists pg_cron
with schema pg_catalog;


-- ============================================================
-- 4. Remove an old job with the same name if it exists
-- ============================================================

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'generate-daily-routes'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;


-- ============================================================
-- 5. Generate today's routes every day
-- ============================================================
--
-- pg_cron uses UTC.
--
-- 05:00 UTC is intentionally early enough for routes to exist
-- before the working day.
--
-- IMPORTANT:
-- The generator itself receives CURRENT_DATE from the database.
-- If BrewTracker later supports warehouses across multiple
-- business time zones, generation should become timezone-aware
-- rather than relying on one global schedule.

select cron.schedule(
  'generate-daily-routes',
  '0 5 * * *',
  $$
    select *
    from public.generate_routes_from_templates(
      current_date
    );
  $$
);