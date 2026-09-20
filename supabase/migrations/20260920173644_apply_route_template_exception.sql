-- ============================================================
-- ROUTE
-- Apply Route Template Exception
-- ============================================================
--
-- Applies a route-template exception atomically.
--
-- Behavior:
--
-- 1. If the operational route has NOT been generated yet:
--    - save the exception
--    - the daily route generator will apply it later
--
-- 2. If the operational route already exists and is
--    draft/scheduled:
--    - skip exception:
--        route.status -> cancelled
--    - driver override:
--        route.driver_id -> replacement driver
--
-- 3. If the operational route is in_progress/completed:
--    - reject the exception
--
-- The recurring route template itself is never modified.
-- ============================================================


create or replace function public.apply_route_template_exception(
  p_route_template_id uuid,
  p_exception_date date,
  p_is_skipped boolean,
  p_override_driver_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.routes%rowtype;
  v_route_exists boolean := false;
  v_exception_id uuid;
begin

  -- ==========================================================
  -- Validate input
  -- ==========================================================

  if p_route_template_id is null then
    raise exception
      'Route template is required.';
  end if;


  if p_exception_date is null then
    raise exception
      'Exception date is required.';
  end if;


  -- Skip and driver override are mutually exclusive.
  if p_is_skipped
     and p_override_driver_id is not null then
    raise exception
      'A skipped route cannot also have a replacement driver.';
  end if;


  -- Every non-skip exception must identify the replacement
  -- driver.
  if not p_is_skipped
     and p_override_driver_id is null then
    raise exception
      'A replacement driver is required for a driver override.';
  end if;


  -- ==========================================================
  -- Validate template
  -- ==========================================================

  if not exists (
    select 1
    from public.route_templates rt
    where rt.id = p_route_template_id
  ) then
    raise exception
      'Route template does not exist.';
  end if;


  -- ==========================================================
  -- Validate replacement driver
  -- ==========================================================

  if p_override_driver_id is not null
     and not exists (
       select 1
       from public.users u
       where u.id = p_override_driver_id
         and u.role = 'driver'
         and u.is_active = true
     ) then
    raise exception
      'Replacement driver must be an active driver.';
  end if;


  -- ==========================================================
  -- Find and lock existing generated route
  -- ==========================================================
  --
  -- The ROUTE-2 unique index guarantees at most one generated
  -- operational route per template/date.
  --
  -- Locking prevents the route lifecycle from changing while
  -- the exception is being applied.
  -- ==========================================================

  select r.*
  into v_route
  from public.routes r
  where r.source_route_template_id =
      p_route_template_id
    and r.route_date =
      p_exception_date
  for update;


  v_route_exists := found;


  -- ==========================================================
  -- Protect routes where operational work has begun
  -- ==========================================================

  if v_route_exists then

    if v_route.status in (
      'in_progress'::public.route_status,
      'completed'::public.route_status
    ) then
      raise exception
        'This route has already started and can no longer be changed through a schedule exception.';
    end if;

  end if;


  -- ==========================================================
  -- Save / update exception
  -- ==========================================================

  insert into public.route_template_exceptions (
    route_template_id,
    exception_date,
    is_skipped,
    override_driver_id,
    notes,
    created_by,
    updated_at
  )
  values (
    p_route_template_id,
    p_exception_date,
    p_is_skipped,

    case
      when p_is_skipped
        then null
      else p_override_driver_id
    end,

    nullif(trim(p_notes), ''),
    p_created_by,
    now()
  )

  on conflict (
    route_template_id,
    exception_date
  )

  do update set
    is_skipped =
      excluded.is_skipped,

    override_driver_id =
      excluded.override_driver_id,

    notes =
      excluded.notes,

    updated_at =
      now()

  returning id
  into v_exception_id;


  -- ==========================================================
  -- No generated route yet
  -- ==========================================================
  --
  -- Nothing else needs to happen.
  --
  -- generate_routes_from_templates() will read the exception
  -- when this date is generated.
  -- ==========================================================

  if not v_route_exists then
    return v_exception_id;
  end if;


  -- ==========================================================
  -- Apply exception to existing operational snapshot
  -- ==========================================================

  if p_is_skipped then

    -- Keep the operational record for history.
    -- Do not delete the route or its stops.

    update public.routes
    set
      status = 'cancelled',
      updated_at = now()
    where id = v_route.id;

  else

    -- Reassign only this generated operational occurrence.
    -- The recurring template driver remains unchanged.

    update public.routes
    set
      driver_id = p_override_driver_id,
      updated_at = now()
    where id = v_route.id;

  end if;


  return v_exception_id;

end;
$$;


-- ============================================================
-- Permissions
-- ============================================================
--
-- This is a SECURITY DEFINER business-operation RPC.
--
-- The web application invokes it through the server-side
-- service-role client after requireRouteManager().
-- ============================================================

revoke all
on function public.apply_route_template_exception(
  uuid,
  date,
  boolean,
  uuid,
  text,
  uuid
)
from public;


revoke all
on function public.apply_route_template_exception(
  uuid,
  date,
  boolean,
  uuid,
  text,
  uuid
)
from anon;


revoke all
on function public.apply_route_template_exception(
  uuid,
  date,
  boolean,
  uuid,
  text,
  uuid
)
from authenticated;


grant execute
on function public.apply_route_template_exception(
  uuid,
  date,
  boolean,
  uuid,
  text,
  uuid
)
to service_role;