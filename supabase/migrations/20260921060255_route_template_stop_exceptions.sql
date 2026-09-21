-- ============================================================
-- ROUTE-4
-- Route Stop Exceptions and Exception Reconciliation
-- ============================================================
--
-- Extends ROUTE-4 with:
--
--   1. Add a one-off stop for a specific date
--   2. Remove a recurring template stop for a specific date
--   3. Apply stop changes to an already-generated mutable route
--   4. Extend automatic route generation with stop exceptions
--   5. Reconcile Skip -> Driver Override on generated routes
--
-- Existing route-level behavior remains:
--
--   - Skip occurrence
--   - Temporary driver override
--   - No recurring-template mutation
--   - In-progress/completed routes are protected
--
-- ============================================================


-- ============================================================
-- 1. Stop exception type
-- ============================================================

create type public.route_stop_exception_type
as enum (
  'add',
  'remove'
);


-- ============================================================
-- 2. Stop exception table
-- ============================================================

create table public.route_template_stop_exceptions (
  id uuid primary key default gen_random_uuid(),

  route_template_id uuid not null
    references public.route_templates(id)
    on delete cascade,

  exception_date date not null,

  exception_type public.route_stop_exception_type not null,

  -- REMOVE only:
  -- identifies the recurring template stop omitted on this date.
  route_template_stop_id uuid
    references public.route_template_stops(id)
    on delete cascade,

  -- ADD only:
  -- describes the temporary one-off stop.
  client_id uuid
    references public.clients(id),

  machine_id uuid
    references public.machines(id),

  scheduled_start_time time,
  scheduled_end_time time,

  drink_count_required boolean not null default false,

  notes text,

  created_by uuid
    references public.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint route_stop_exception_shape_check
  check (
    (
      exception_type = 'remove'
      and route_template_stop_id is not null
      and client_id is null
      and machine_id is null
    )
    or
    (
      exception_type = 'add'
      and route_template_stop_id is null
      and client_id is not null
    )
  ),

  constraint route_stop_exception_time_check
  check (
    scheduled_start_time is null
    or scheduled_end_time is null
    or scheduled_end_time > scheduled_start_time
  )
);


-- A recurring stop can only be removed once for one date.

create unique index route_stop_exception_remove_unique_idx
on public.route_template_stop_exceptions (
  route_template_id,
  exception_date,
  route_template_stop_id
)
where exception_type = 'remove';


create index route_stop_exception_template_date_idx
on public.route_template_stop_exceptions (
  route_template_id,
  exception_date
);


-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.route_template_stop_exceptions
enable row level security;


-- CEO

create policy
"CEOs can read route stop exceptions"
on public.route_template_stop_exceptions
for select
to authenticated
using (
  public.is_ceo()
);


create policy
"CEOs can manage route stop exceptions"
on public.route_template_stop_exceptions
for all
to authenticated
using (
  public.is_ceo()
)
with check (
  public.is_ceo()
);


-- Managers

create policy
"Managers can read regional route stop exceptions"
on public.route_template_stop_exceptions
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates rt
    where rt.id =
      route_template_stop_exceptions.route_template_id

      and public.warehouse_is_in_current_user_region(
        rt.warehouse_id
      )
  )
);


create policy
"Managers can manage regional route stop exceptions"
on public.route_template_stop_exceptions
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates rt
    where rt.id =
      route_template_stop_exceptions.route_template_id

      and public.warehouse_is_in_current_user_region(
        rt.warehouse_id
      )
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates rt
    where rt.id =
      route_template_stop_exceptions.route_template_id

      and public.warehouse_is_in_current_user_region(
        rt.warehouse_id
      )
  )
);


-- ============================================================
-- 4. Reconcile route-level exceptions
-- ============================================================
--
-- Replaces the RPC from Migration 2.
--
-- Main addition:
--
-- If a generated route was cancelled because of a Skip
-- exception and the admin changes that exception to a Driver
-- Override, restore the operational route to scheduled.
--
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

  -- ----------------------------------------------------------
  -- Validate input
  -- ----------------------------------------------------------

  if p_route_template_id is null then
    raise exception
      'Route template is required.';
  end if;


  if p_exception_date is null then
    raise exception
      'Exception date is required.';
  end if;


  if p_is_skipped
     and p_override_driver_id is not null then
    raise exception
      'A skipped route cannot also have a replacement driver.';
  end if;


  if not p_is_skipped
     and p_override_driver_id is null then
    raise exception
      'A replacement driver is required for a driver override.';
  end if;


  -- ----------------------------------------------------------
  -- Validate template
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.route_templates rt
    where rt.id =
      p_route_template_id
  ) then
    raise exception
      'Route template does not exist.';
  end if;


  -- ----------------------------------------------------------
  -- Validate replacement driver
  -- ----------------------------------------------------------

  if p_override_driver_id is not null
     and not exists (
       select 1
       from public.users u
       where u.id =
         p_override_driver_id

         and u.role =
           'driver'

         and u.is_active =
           true
     ) then

    raise exception
      'Replacement driver must be an active driver.';

  end if;


  -- ----------------------------------------------------------
  -- Find and lock generated route
  -- ----------------------------------------------------------

  select r.*
  into v_route

  from public.routes r

  where r.source_route_template_id =
      p_route_template_id

    and r.route_date =
      p_exception_date

  for update;


  v_route_exists := found;


  -- ----------------------------------------------------------
  -- Protect started/completed work
  -- ----------------------------------------------------------

  if v_route_exists then

    if v_route.status in (
      'in_progress'::public.route_status,
      'completed'::public.route_status
    ) then

      raise exception
        'This route has already started and can no longer be changed through a schedule exception.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Save/upsert route-level exception
  -- ----------------------------------------------------------

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
      else
        p_override_driver_id
    end,

    nullif(
      trim(p_notes),
      ''
    ),

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


  -- ----------------------------------------------------------
  -- Nothing operational exists yet.
  -- Generator will apply the exception later.
  -- ----------------------------------------------------------

  if not v_route_exists then
    return v_exception_id;
  end if;


  -- ----------------------------------------------------------
  -- Apply to generated operational snapshot
  -- ----------------------------------------------------------

  if p_is_skipped then

    update public.routes
    set
      status =
        'cancelled'::public.route_status,

      updated_at =
        now()

    where id =
      v_route.id;

  else

    update public.routes
    set
      driver_id =
        p_override_driver_id,

      -- A route cancelled by the previous Skip exception
      -- becomes scheduled again when Skip is replaced by a
      -- driver override.
      status =
        case
          when v_route.status =
            'cancelled'::public.route_status
          then
            'scheduled'::public.route_status
          else
            v_route.status
        end,

      updated_at =
        now()

    where id =
      v_route.id;

  end if;


  return v_exception_id;

end;
$$;


-- Permissions already existed from Migration 2, but repeat them
-- here so the final function privileges are explicit.

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


-- ============================================================
-- 5. Add one-off stop
-- ============================================================

create or replace function public.add_route_stop_exception(
  p_route_template_id uuid,
  p_exception_date date,
  p_client_id uuid,
  p_machine_id uuid default null,
  p_scheduled_start_time time default null,
  p_scheduled_end_time time default null,
  p_drink_count_required boolean default false,
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
  v_next_sequence integer;
begin

  -- ----------------------------------------------------------
  -- Validate input
  -- ----------------------------------------------------------

  if p_route_template_id is null then
    raise exception
      'Route template is required.';
  end if;


  if p_exception_date is null then
    raise exception
      'Exception date is required.';
  end if;


  if p_client_id is null then
    raise exception
      'Client is required.';
  end if;


  if (
    p_scheduled_start_time is not null
    and p_scheduled_end_time is not null
    and p_scheduled_end_time <=
      p_scheduled_start_time
  ) then

    raise exception
      'Scheduled end time must be after start time.';

  end if;


  -- ----------------------------------------------------------
  -- Validate template
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.route_templates rt
    where rt.id =
      p_route_template_id
  ) then

    raise exception
      'Route template does not exist.';

  end if;


  -- ----------------------------------------------------------
  -- Validate client
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.clients c
    where c.id =
      p_client_id
  ) then

    raise exception
      'Client does not exist.';

  end if;


  -- ----------------------------------------------------------
  -- Validate optional machine
  -- ----------------------------------------------------------

  if p_machine_id is not null then

    if not exists (
      select 1
      from public.machines m

      where m.id =
        p_machine_id

        and m.client_id =
          p_client_id
    ) then

      raise exception
        'The selected machine does not belong to this client.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Find and lock generated route
  -- ----------------------------------------------------------

  select r.*
  into v_route

  from public.routes r

  where r.source_route_template_id =
      p_route_template_id

    and r.route_date =
      p_exception_date

  for update;


  v_route_exists := found;


  -- ----------------------------------------------------------
  -- Protect immutable operational states
  -- ----------------------------------------------------------

  if v_route_exists then

    if v_route.status in (
      'in_progress'::public.route_status,
      'completed'::public.route_status
    ) then

      raise exception
        'This route has already started and its stops can no longer be changed.';

    end if;


    if v_route.status =
      'cancelled'::public.route_status then

      raise exception
        'Stops cannot be added to a cancelled route.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Save ADD exception
  -- ----------------------------------------------------------

  insert into public.route_template_stop_exceptions (
    route_template_id,
    exception_date,
    exception_type,
    client_id,
    machine_id,
    scheduled_start_time,
    scheduled_end_time,
    drink_count_required,
    notes,
    created_by
  )
  values (
    p_route_template_id,
    p_exception_date,
    'add'::public.route_stop_exception_type,
    p_client_id,
    p_machine_id,
    p_scheduled_start_time,
    p_scheduled_end_time,
    p_drink_count_required,

    nullif(
      trim(p_notes),
      ''
    ),

    p_created_by
  )

  returning id
  into v_exception_id;


  -- ----------------------------------------------------------
  -- No generated route yet.
  -- Generator will materialize the stop later.
  -- ----------------------------------------------------------

  if not v_route_exists then
    return v_exception_id;
  end if;


  -- ----------------------------------------------------------
  -- Generated route exists.
  -- Append one-off stop to operational snapshot.
  -- ----------------------------------------------------------

  select
    coalesce(
      max(s.sequence_number),
      0
    ) + 1

  into v_next_sequence

  from public.stops s

  where s.route_id =
    v_route.id;


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
  values (
    v_route.id,
    p_client_id,
    p_machine_id,
    v_next_sequence,

    'pending'::public.stop_status,

    case
      when p_scheduled_start_time is null
        then null
      else
        p_exception_date::timestamp
        + p_scheduled_start_time
    end,

    case
      when p_scheduled_end_time is null
        then null
      else
        p_exception_date::timestamp
        + p_scheduled_end_time
    end,

    nullif(
      trim(p_notes),
      ''
    ),

    p_drink_count_required
  );


  return v_exception_id;

end;
$$;


-- ============================================================
-- 6. Remove recurring template stop for one date
-- ============================================================

create or replace function public.remove_route_stop_exception(
  p_route_template_id uuid,
  p_exception_date date,
  p_route_template_stop_id uuid,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_stop public.route_template_stops%rowtype;
  v_route public.routes%rowtype;

  v_route_exists boolean := false;
  v_exception_id uuid;
begin

  -- ----------------------------------------------------------
  -- Validate input
  -- ----------------------------------------------------------

  if p_route_template_id is null then
    raise exception
      'Route template is required.';
  end if;


  if p_exception_date is null then
    raise exception
      'Exception date is required.';
  end if;


  if p_route_template_stop_id is null then
    raise exception
      'Route template stop is required.';
  end if;


  -- ----------------------------------------------------------
  -- Validate template stop
  -- ----------------------------------------------------------

  select rts.*
  into v_template_stop

  from public.route_template_stops rts

  where rts.id =
      p_route_template_stop_id

    and rts.route_template_id =
      p_route_template_id;


  if not found then

    raise exception
      'Template stop does not belong to this route template.';

  end if;


  -- ----------------------------------------------------------
  -- Find and lock generated route
  -- ----------------------------------------------------------

  select r.*
  into v_route

  from public.routes r

  where r.source_route_template_id =
      p_route_template_id

    and r.route_date =
      p_exception_date

  for update;


  v_route_exists := found;


  -- ----------------------------------------------------------
  -- Protect immutable operational states
  -- ----------------------------------------------------------

  if v_route_exists then

    if v_route.status in (
      'in_progress'::public.route_status,
      'completed'::public.route_status
    ) then

      raise exception
        'This route has already started and its stops can no longer be changed.';

    end if;


    if v_route.status =
      'cancelled'::public.route_status then

      raise exception
        'Stops cannot be changed on a cancelled route.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Save REMOVE exception
  -- ----------------------------------------------------------

  insert into public.route_template_stop_exceptions (
    route_template_id,
    exception_date,
    exception_type,
    route_template_stop_id,
    notes,
    created_by
  )
  values (
    p_route_template_id,
    p_exception_date,
    'remove'::public.route_stop_exception_type,
    p_route_template_stop_id,

    nullif(
      trim(p_notes),
      ''
    ),

    p_created_by
  )

  on conflict (
    route_template_id,
    exception_date,
    route_template_stop_id
  )

  where exception_type =
    'remove'::public.route_stop_exception_type

  do update set

    notes =
      excluded.notes,

    updated_at =
      now()

  returning id
  into v_exception_id;


  -- ----------------------------------------------------------
  -- No generated route yet.
  -- Generator will exclude this template stop later.
  -- ----------------------------------------------------------

  if not v_route_exists then
    return v_exception_id;
  end if;


  -- ----------------------------------------------------------
  -- Generated route exists.
  -- Remove matching pending operational snapshot.
  -- ----------------------------------------------------------

  delete from public.stops s

  where s.route_id =
      v_route.id

    and s.sequence_number =
      v_template_stop.sequence_number

    and s.client_id =
      v_template_stop.client_id

    and s.machine_id is not distinct from
      v_template_stop.machine_id

    and s.status =
      'pending'::public.stop_status;


  if not found then

    raise exception
      'The generated stop could not be removed. It may already have operational activity.';

  end if;


  -- ----------------------------------------------------------
  -- Normalize remaining sequence numbers
  -- ----------------------------------------------------------
  --
  -- Move them temporarily above the normal sequence range to
  -- avoid collisions with UNIQUE(route_id, sequence_number).
  -- ----------------------------------------------------------

  with ordered as (
    select
      s.id,

      row_number() over (
        order by
          s.sequence_number,
          s.created_at,
          s.id
      )::integer as new_sequence

    from public.stops s

    where s.route_id =
      v_route.id
  )

  update public.stops s

  set sequence_number =
    ordered.new_sequence + 1000

  from ordered

  where s.id =
    ordered.id;


  update public.stops

  set sequence_number =
    sequence_number - 1000

  where route_id =
    v_route.id;


  return v_exception_id;

end;
$$;


-- ============================================================
-- 7. Stop RPC permissions
-- ============================================================

revoke all
on function public.add_route_stop_exception(
  uuid,
  date,
  uuid,
  uuid,
  time,
  time,
  boolean,
  text,
  uuid
)
from public;


revoke all
on function public.add_route_stop_exception(
  uuid,
  date,
  uuid,
  uuid,
  time,
  time,
  boolean,
  text,
  uuid
)
from anon;


revoke all
on function public.add_route_stop_exception(
  uuid,
  date,
  uuid,
  uuid,
  time,
  time,
  boolean,
  text,
  uuid
)
from authenticated;


grant execute
on function public.add_route_stop_exception(
  uuid,
  date,
  uuid,
  uuid,
  time,
  time,
  boolean,
  text,
  uuid
)
to service_role;


revoke all
on function public.remove_route_stop_exception(
  uuid,
  date,
  uuid,
  text,
  uuid
)
from public;


revoke all
on function public.remove_route_stop_exception(
  uuid,
  date,
  uuid,
  text,
  uuid
)
from anon;


revoke all
on function public.remove_route_stop_exception(
  uuid,
  date,
  uuid,
  text,
  uuid
)
from authenticated;


grant execute
on function public.remove_route_stop_exception(
  uuid,
  date,
  uuid,
  text,
  uuid
)
to service_role;


-- ============================================================
-- 8. Extend automatic route generation
-- ============================================================
--
-- Existing behavior retained:
--
--   - Active template/day matching
--   - Skip route exception
--   - Driver override
--   - Idempotent route generation
--
-- New behavior:
--
--   - REMOVE exceptions exclude template stops
--   - ADD exceptions append one-off stops
--   - stops_created counts both
--
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
  v_driver_id uuid;

  v_template_stops_created integer := 0;
  v_added_stops_created integer := 0;
  v_stops_created integer := 0;

  v_day_of_week integer;
begin

  if p_route_date is null then
    raise exception
      'Route date is required.';
  end if;


  v_day_of_week :=
    extract(dow from p_route_date)::integer;


  for v_template in

    select
      rt.id,
      rt.driver_id,
      rt.warehouse_id,
      rt.notes,

      coalesce(
        rte.is_skipped,
        false
      ) as is_skipped,

      rte.override_driver_id

    from public.route_templates rt

    left join public.route_template_exceptions rte
      on rte.route_template_id =
        rt.id

      and rte.exception_date =
        p_route_date

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

    order by
      rt.created_at,
      rt.id

  loop

    -- --------------------------------------------------------
    -- Skip entire occurrence
    -- --------------------------------------------------------

    if v_template.is_skipped then
      continue;
    end if;


    -- --------------------------------------------------------
    -- Resolve occurrence driver
    -- --------------------------------------------------------

    v_driver_id := coalesce(
      v_template.override_driver_id,
      v_template.driver_id
    );


    -- --------------------------------------------------------
    -- Validate resulting stop set
    -- --------------------------------------------------------
    --
    -- Generate the route only when:
    --
    --   A. at least one recurring stop remains after REMOVE
    --
    -- OR
    --
    --   B. at least one one-off ADD stop exists.
    --
    -- --------------------------------------------------------

    if not exists (

      select 1

      from public.route_template_stops rts

      where rts.route_template_id =
        v_template.id

        and not exists (

          select 1

          from public.route_template_stop_exceptions rtse

          where rtse.route_template_id =
              v_template.id

            and rtse.exception_date =
              p_route_date

            and rtse.exception_type =
              'remove'::public.route_stop_exception_type

            and rtse.route_template_stop_id =
              rts.id
        )

    )

    and not exists (

      select 1

      from public.route_template_stop_exceptions rtse

      where rtse.route_template_id =
          v_template.id

        and rtse.exception_date =
          p_route_date

        and rtse.exception_type =
          'add'::public.route_stop_exception_type

    )

    then
      continue;
    end if;


    -- --------------------------------------------------------
    -- Generate operational route
    -- --------------------------------------------------------

    v_route_id := null;


    insert into public.routes (
      driver_id,
      warehouse_id,
      route_date,
      status,
      notes,
      source_route_template_id
    )
    values (
      v_driver_id,
      v_template.warehouse_id,
      p_route_date,
      'scheduled'::public.route_status,
      v_template.notes,
      v_template.id
    )

    on conflict do nothing

    returning id
    into v_route_id;


    -- Already generated.
    if v_route_id is null then
      continue;
    end if;


    -- Reset per-route counters.

    v_template_stops_created := 0;
    v_added_stops_created := 0;
    v_stops_created := 0;


    -- --------------------------------------------------------
    -- Snapshot recurring template stops
    -- excluding REMOVE exceptions
    -- --------------------------------------------------------

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

      row_number() over (
        order by
          rts.sequence_number,
          rts.id
      )::integer,

      'pending'::public.stop_status,

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

      and not exists (

        select 1

        from public.route_template_stop_exceptions rtse

        where rtse.route_template_id =
            v_template.id

          and rtse.exception_date =
            p_route_date

          and rtse.exception_type =
            'remove'::public.route_stop_exception_type

          and rtse.route_template_stop_id =
            rts.id
      )

    order by
      rts.sequence_number,
      rts.id;


    get diagnostics
      v_template_stops_created = row_count;


    -- --------------------------------------------------------
    -- Append one-off ADD stops
    -- --------------------------------------------------------

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
      rtse.client_id,
      rtse.machine_id,

      (
        v_template_stops_created
        + row_number() over (
            order by
              rtse.created_at,
              rtse.id
          )
      )::integer,

      'pending'::public.stop_status,

      case
        when rtse.scheduled_start_time is null
          then null
        else
          p_route_date::timestamp
          + rtse.scheduled_start_time
      end,

      case
        when rtse.scheduled_end_time is null
          then null
        else
          p_route_date::timestamp
          + rtse.scheduled_end_time
      end,

      rtse.notes,
      rtse.drink_count_required

    from public.route_template_stop_exceptions rtse

    where rtse.route_template_id =
      v_template.id

      and rtse.exception_date =
        p_route_date

      and rtse.exception_type =
        'add'::public.route_stop_exception_type

    order by
      rtse.created_at,
      rtse.id;


    get diagnostics
      v_added_stops_created = row_count;


    v_stops_created :=
      v_template_stops_created
      + v_added_stops_created;


    -- --------------------------------------------------------
    -- Return generated occurrence
    -- --------------------------------------------------------

    return query

    select
      v_route_id,
      v_template.id::uuid,
      v_driver_id,
      p_route_date,
      v_stops_created;

  end loop;

end;
$$;


-- ============================================================
-- 9. Generator permissions
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