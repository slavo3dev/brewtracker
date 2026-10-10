-- ============================================================
-- ROUTE-6
-- Prevent conflicting generated recurring routes
--
-- Extends ROUTE-2 generation while preserving ROUTE-4
-- exception behavior.
--
-- Conflict rule for the effective occurrence:
--
--   same route date
--   + same effective driver
--   + same machine
--
-- OR, when both stops have no machine:
--
--   same route date
--   + same effective driver
--   + same client
--
-- Effective occurrence includes:
--   - template weekday schedule
--   - route skip exception
--   - driver override
--   - removed recurring stops
--   - added one-off stops
--
-- Conflicting template occurrence is skipped rather than
-- generating a duplicate operational assignment.
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

  v_conflict record;
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
    -- Resolve effective occurrence driver
    -- --------------------------------------------------------

    v_driver_id := coalesce(
      v_template.override_driver_id,
      v_template.driver_id
    );


    -- --------------------------------------------------------
    -- Validate resulting stop set
    --
    -- Generate only when:
    --
    --   A. at least one recurring stop remains after REMOVE
    --
    -- OR
    --
    --   B. at least one one-off ADD stop exists.
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
    -- ROUTE-6:
    -- Check effective occurrence against already generated
    -- operational routes for the same date and driver.
    --
    -- This intentionally happens AFTER:
    --
    --   - skip resolution
    --   - driver override resolution
    --   - REMOVE exception resolution
    --   - ADD exception resolution
    --
    -- Therefore we compare the route that would actually be
    -- generated, not merely the base template configuration.
    -- --------------------------------------------------------

    v_conflict := null;


    select
      existing_route.id as conflicting_route_id,
      existing_stop.id as conflicting_stop_id,
      existing_stop.client_id,
      existing_stop.machine_id

    into v_conflict

    from public.routes existing_route

    join public.stops existing_stop
      on existing_stop.route_id =
        existing_route.id

    where existing_route.route_date =
        p_route_date

      and existing_route.driver_id =
        v_driver_id

      -- Cancelled routes are no longer actionable and therefore
      -- should not block a replacement occurrence.
      and existing_route.status <>
        'cancelled'::public.route_status

      and (

        -- ----------------------------------------------------
        -- Compare existing operational stop against effective
        -- recurring stops after REMOVE exceptions.
        -- ----------------------------------------------------

        exists (

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

            and (

              (
                rts.machine_id is not null
                and existing_stop.machine_id =
                  rts.machine_id
              )

              or

              (
                rts.machine_id is null
                and existing_stop.machine_id is null
                and existing_stop.client_id =
                  rts.client_id
              )

            )
        )


        or


        -- ----------------------------------------------------
        -- Compare existing operational stop against one-off
        -- ADD stops for this occurrence.
        -- ----------------------------------------------------

        exists (

          select 1

          from public.route_template_stop_exceptions rtse

          where rtse.route_template_id =
              v_template.id

            and rtse.exception_date =
              p_route_date

            and rtse.exception_type =
              'add'::public.route_stop_exception_type

            and (

              (
                rtse.machine_id is not null
                and existing_stop.machine_id =
                  rtse.machine_id
              )

              or

              (
                rtse.machine_id is null
                and existing_stop.machine_id is null
                and existing_stop.client_id =
                  rtse.client_id
              )

            )
        )

      )

    limit 1;


    -- --------------------------------------------------------
    -- A matching operational assignment already exists.
    --
    -- Do not create another route occurrence containing the
    -- same assignment for the same driver/date.
    -- --------------------------------------------------------

    if found then
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


    -- Already generated for this template/date.
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
-- Preserve generator security
-- ============================================================

revoke all
on function public.generate_routes_from_templates(date)
from public;

grant execute
on function public.generate_routes_from_templates(date)
to service_role;