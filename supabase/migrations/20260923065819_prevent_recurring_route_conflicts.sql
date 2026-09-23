-- ============================================================
-- ROUTE-6
-- Prevent Conflicting Recurring Route Schedules
--
-- Rules:
-- 1. Inactive templates may overlap.
-- 2. Active templates for the same driver may not overlap when:
--      - they share at least one service weekday, and
--      - they contain the same machine
-- 3. For stops without a machine, same client is used instead.
-- 4. Activation, active-template edits, and stop additions are
--    validated atomically.
-- ============================================================


-- ============================================================
-- 1. SHARED CONFLICT VALIDATION
-- ============================================================

create or replace function public.assert_route_template_has_no_conflicts(
  p_route_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.route_templates%rowtype;
  v_conflict record;
begin
  select *
  into v_template
  from public.route_templates
  where id = p_route_template_id;

  if not found then
    raise exception 'Route template was not found.';
  end if;

  -- Inactive templates do not generate operational routes.
  if not v_template.is_active then
    return;
  end if;

  select
    other_template.id as conflicting_template_id,
    other_template.name as conflicting_template_name,

    other_stop.client_id,
    other_stop.machine_id,

    machine.serial_number as machine_serial_number,
    client.name as client_name,

    case
      when v_template.monday
       and other_template.monday then 'Monday'

      when v_template.tuesday
       and other_template.tuesday then 'Tuesday'

      when v_template.wednesday
       and other_template.wednesday then 'Wednesday'

      when v_template.thursday
       and other_template.thursday then 'Thursday'

      when v_template.friday
       and other_template.friday then 'Friday'

      when v_template.saturday
       and other_template.saturday then 'Saturday'

      when v_template.sunday
       and other_template.sunday then 'Sunday'

      else null
    end as conflicting_day

  into v_conflict

  from public.route_template_stops current_stop

  join public.route_templates other_template
    on other_template.id <> v_template.id
   and other_template.is_active = true
   and other_template.driver_id = v_template.driver_id

  join public.route_template_stops other_stop
    on other_stop.route_template_id = other_template.id

  left join public.machines machine
    on machine.id = other_stop.machine_id

  left join public.clients client
    on client.id = other_stop.client_id

  where current_stop.route_template_id = v_template.id

    -- Templates must share at least one service weekday.
    and (
      (v_template.monday and other_template.monday)
      or
      (v_template.tuesday and other_template.tuesday)
      or
      (v_template.wednesday and other_template.wednesday)
      or
      (v_template.thursday and other_template.thursday)
      or
      (v_template.friday and other_template.friday)
      or
      (v_template.saturday and other_template.saturday)
      or
      (v_template.sunday and other_template.sunday)
    )

    -- Same machine is the primary conflict rule.
    --
    -- If both stops have no machine, fall back to the client.
    and (
      (
        current_stop.machine_id is not null
        and other_stop.machine_id = current_stop.machine_id
      )
      or
      (
        current_stop.machine_id is null
        and other_stop.machine_id is null
        and other_stop.client_id = current_stop.client_id
      )
    )

  limit 1;

  if found then
    if v_conflict.machine_id is not null then
      raise exception
        '% is already assigned to this driver on % by route template "%".',
        coalesce(
          v_conflict.machine_serial_number,
          'This machine'
        ),
        v_conflict.conflicting_day,
        v_conflict.conflicting_template_name;
    else
      raise exception
        '% is already assigned to this driver on % by route template "%".',
        coalesce(
          v_conflict.client_name,
          'This client'
        ),
        v_conflict.conflicting_day,
        v_conflict.conflicting_template_name;
    end if;
  end if;
end;
$$;


-- ============================================================
-- 2. ATOMIC TEMPLATE ACTIVATION / DEACTIVATION
-- ============================================================

create or replace function public.set_route_template_active(
  p_route_template_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.route_templates%rowtype;
  v_stop_count integer;
begin
  select *
  into v_template
  from public.route_templates
  where id = p_route_template_id
  for update;

  if not found then
    raise exception 'Route template was not found.';
  end if;

  -- Deactivation is always allowed.
  if not p_is_active then
    update public.route_templates
    set
      is_active = false,
      updated_at = now()
    where id = p_route_template_id;

    return;
  end if;

  -- Active templates require at least one service day.
  if not (
    v_template.monday
    or v_template.tuesday
    or v_template.wednesday
    or v_template.thursday
    or v_template.friday
    or v_template.saturday
    or v_template.sunday
  ) then
    raise exception
      'Select at least one service day before activating the template.';
  end if;

  -- Active templates require at least one stop.
  select count(*)
  into v_stop_count
  from public.route_template_stops
  where route_template_id = p_route_template_id;

  if v_stop_count = 0 then
    raise exception
      'Add at least one stop before activating the template.';
  end if;

  /*
   * Mark active inside this transaction.
   *
   * The shared conflict checker only validates active templates.
   * If the validation below raises an exception, PostgreSQL rolls
   * this UPDATE back automatically.
   */
  update public.route_templates
  set
    is_active = true,
    updated_at = now()
  where id = p_route_template_id;

  perform public.assert_route_template_has_no_conflicts(
    p_route_template_id
  );
end;
$$;


-- ============================================================
-- 3. ATOMIC TEMPLATE STOP INSERTION
-- ============================================================

create or replace function public.add_route_template_stop_checked(
  p_route_template_id uuid,
  p_client_id uuid,
  p_machine_id uuid,
  p_scheduled_start_time time,
  p_scheduled_end_time time,
  p_drink_count_required boolean,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_sequence integer;
begin
  -- Validate template.
  if not exists (
    select 1
    from public.route_templates
    where id = p_route_template_id
  ) then
    raise exception 'Route template was not found.';
  end if;

  -- Validate client.
  if not exists (
    select 1
    from public.clients
    where id = p_client_id
  ) then
    raise exception 'Client was not found.';
  end if;

  -- If machine is supplied, it must belong to selected client.
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

  -- Validate scheduled time range.
  if p_scheduled_start_time is not null
     and p_scheduled_end_time is not null
     and p_scheduled_end_time <= p_scheduled_start_time then
    raise exception
      'Scheduled end time must be after scheduled start time.';
  end if;

  -- Determine the next stop sequence.
  select coalesce(max(sequence_number), 0) + 1
  into v_next_sequence
  from public.route_template_stops
  where route_template_id = p_route_template_id;

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
    coalesce(p_drink_count_required, false),
    nullif(trim(p_notes), '')
  );

  /*
   * For an inactive template this returns immediately.
   *
   * For an active template, any conflict raises an exception,
   * which also rolls back the INSERT above.
   */
  perform public.assert_route_template_has_no_conflicts(
    p_route_template_id
  );
end;
$$;


-- ============================================================
-- 4. ATOMIC TEMPLATE UPDATE
-- ============================================================

create or replace function public.update_route_template_checked(
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
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_active boolean;
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'Template name is required.';
  end if;

  select is_active
  into v_is_active
  from public.route_templates
  where id = p_route_template_id
  for update;

  if not found then
    raise exception 'Route template was not found.';
  end if;

  -- Active templates must retain at least one service day.
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

    notes = nullif(trim(p_notes), ''),

    updated_at = now()

  where id = p_route_template_id;

  /*
   * Inactive templates are allowed to overlap.
   *
   * Active templates are validated against all other
   * active recurring templates.
   *
   * If validation fails, the UPDATE above is rolled back.
   */
  perform public.assert_route_template_has_no_conflicts(
    p_route_template_id
  );
end;
$$;


-- ============================================================
-- 5. PERMISSIONS
-- ============================================================

revoke all
on function public.assert_route_template_has_no_conflicts(uuid)
from public;

revoke all
on function public.set_route_template_active(uuid, boolean)
from public;

revoke all
on function public.add_route_template_stop_checked(
  uuid,
  uuid,
  uuid,
  time,
  time,
  boolean,
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
on function public.assert_route_template_has_no_conflicts(uuid)
to service_role;

grant execute
on function public.set_route_template_active(uuid, boolean)
to service_role;

grant execute
on function public.add_route_template_stop_checked(
  uuid,
  uuid,
  uuid,
  time,
  time,
  boolean,
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