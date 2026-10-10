-- ============================================================
-- ROUTE-6
-- Fix nullable parameters for recurring route conflict RPCs
--
-- The original RPC signatures generated non-null TypeScript
-- parameters for optional values such as:
--   - machine_id
--   - scheduled start/end time
--   - notes
--
-- Recreate the affected RPCs with optional parameters declared
-- using DEFAULT NULL.
-- ============================================================


-- ============================================================
-- 1. DROP ORIGINAL RPC SIGNATURES
-- ============================================================

drop function if exists public.add_route_template_stop_checked(
  uuid,
  uuid,
  uuid,
  time,
  time,
  boolean,
  text
);

drop function if exists public.update_route_template_checked(
  uuid,
  text,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text
);


-- ============================================================
-- 2. RECREATE ADD TEMPLATE STOP RPC
-- ============================================================
--
-- Required parameters come first.
-- Optional parameters use DEFAULT NULL so generated Supabase
-- types allow null values.
-- ============================================================

create function public.add_route_template_stop_checked(
  p_route_template_id uuid,
  p_client_id uuid,
  p_drink_count_required boolean,
  p_machine_id uuid default null,
  p_scheduled_start_time time default null,
  p_scheduled_end_time time default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_sequence integer;
begin
  -- ----------------------------------------------------------
  -- Validate template
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.route_templates
    where id = p_route_template_id
  ) then
    raise exception
      'Route template was not found.';
  end if;


  -- ----------------------------------------------------------
  -- Validate client
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.clients
    where id = p_client_id
  ) then
    raise exception
      'Client was not found.';
  end if;


  -- ----------------------------------------------------------
  -- Validate machine/client relationship
  -- ----------------------------------------------------------

  if p_machine_id is not null
     and not exists (
       select 1
       from public.machines
       where id = p_machine_id
         and client_id = p_client_id
     ) then
    raise exception
      'The selected machine does not belong to this client.';
  end if;


  -- ----------------------------------------------------------
  -- Validate scheduled time
  -- ----------------------------------------------------------

  if p_scheduled_start_time is not null
     and p_scheduled_end_time is not null
     and p_scheduled_end_time <= p_scheduled_start_time then
    raise exception
      'Scheduled end time must be after scheduled start time.';
  end if;


  -- ----------------------------------------------------------
  -- Determine next sequence number
  -- ----------------------------------------------------------

  select
    coalesce(max(sequence_number), 0) + 1
  into v_next_sequence
  from public.route_template_stops
  where route_template_id =
    p_route_template_id;


  -- ----------------------------------------------------------
  -- Insert stop
  -- ----------------------------------------------------------

  insert into public.route_template_stops (
    route_template_id,
    client_id,
    machine_id,
    sequence_number,
    scheduled_start_time,
    scheduled_end_time,
    drink_count_required,
    notes
  )
  values (
    p_route_template_id,
    p_client_id,
    p_machine_id,
    v_next_sequence,
    p_scheduled_start_time,
    p_scheduled_end_time,
    coalesce(
      p_drink_count_required,
      false
    ),
    nullif(trim(p_notes), '')
  );


  -- ----------------------------------------------------------
  -- Validate recurring conflict
  --
  -- Inactive template:
  --   assertion returns immediately.
  --
  -- Active template:
  --   conflict raises an exception and PostgreSQL rolls back
  --   the INSERT above.
  -- ----------------------------------------------------------

  perform
    public.assert_route_template_has_no_conflicts(
      p_route_template_id
    );
end;
$$;


-- ============================================================
-- 3. RECREATE UPDATE TEMPLATE RPC
-- ============================================================

create function public.update_route_template_checked(
  p_route_template_id uuid,
  p_name text,
  p_driver_id uuid,
  p_warehouse_id uuid,
  p_monday boolean,
  p_tuesday boolean,
  p_wednesday boolean,
  p_thursday boolean,
  p_friday boolean,
  p_saturday boolean,
  p_sunday boolean,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_active boolean;
begin
  -- ----------------------------------------------------------
  -- Validate template name
  -- ----------------------------------------------------------

  if nullif(trim(p_name), '') is null then
    raise exception
      'Template name is required.';
  end if;


  -- ----------------------------------------------------------
  -- Lock and load template
  -- ----------------------------------------------------------

  select is_active
  into v_is_active
  from public.route_templates
  where id = p_route_template_id
  for update;

  if not found then
    raise exception
      'Route template was not found.';
  end if;


  -- ----------------------------------------------------------
  -- Active templates require at least one service day
  -- ----------------------------------------------------------

  if v_is_active
     and not (
       p_monday
       or p_tuesday
       or p_wednesday
       or p_thursday
       or p_friday
       or p_saturday
       or p_sunday
     ) then
    raise exception
      'An active route template must have at least one service day.';
  end if;


  -- ----------------------------------------------------------
  -- Update template
  -- ----------------------------------------------------------

  update public.route_templates
  set
    name = trim(p_name),

    driver_id = p_driver_id,
    warehouse_id = p_warehouse_id,

    monday = p_monday,
    tuesday = p_tuesday,
    wednesday = p_wednesday,
    thursday = p_thursday,
    friday = p_friday,
    saturday = p_saturday,
    sunday = p_sunday,

    notes = nullif(
      trim(p_notes),
      ''
    ),

    updated_at = now()

  where id = p_route_template_id;


  -- ----------------------------------------------------------
  -- Validate recurring conflict
  --
  -- If this is an active template and the update introduces
  -- a conflict, the exception rolls back the UPDATE.
  -- ----------------------------------------------------------

  perform
    public.assert_route_template_has_no_conflicts(
      p_route_template_id
    );
end;
$$;


-- ============================================================
-- 4. SECURITY
-- ============================================================

revoke all
on function public.add_route_template_stop_checked(
  uuid,
  uuid,
  boolean,
  uuid,
  time,
  time,
  text
)
from public;

revoke all
on function public.update_route_template_checked(
  uuid,
  text,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text
)
from public;


grant execute
on function public.add_route_template_stop_checked(
  uuid,
  uuid,
  boolean,
  uuid,
  time,
  time,
  text
)
to service_role;

grant execute
on function public.update_route_template_checked(
  uuid,
  text,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text
)
to service_role;