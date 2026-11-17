-- ============================================================
-- Scope generate_routes_from_templates to an optional template
--
-- The daily cron calls this with ONLY a date (current_date),
-- and must keep processing every active template, unchanged.
--
-- Tests that exercise ROUTE-6 conflict behavior for a single
-- QA fixture template previously had no way to avoid also
-- generating real operational routes for every OTHER active
-- template scheduled for that same date. p_template_id is a
-- new, optional, default-null parameter: when null, behavior
-- is identical to before (every caller that only passes
-- p_route_date, including the cron job, is unaffected); when
-- set, generation is scoped to exactly that one template.
-- ============================================================

create or replace function public.generate_routes_from_templates(
  p_route_date date,
  p_template_id uuid default null
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
        p_template_id is null
        or rt.id = p_template_id
      )

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

    -- Serialize operations for this template occurrence
    -- before acquiring the template row lock.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'brewtracker:template-occurrence:'
        || v_template.id::text
        || ':'
        || p_route_date::text,
        0
      )
    );

    -- Refresh template configuration under a row lock.
    -- Prevent concurrent template updates while generating.
    SELECT
      rt.id,
      rt.driver_id,
      rt.warehouse_id,
      rt.notes,
      COALESCE(rte.is_skipped, false) AS is_skipped,
      rte.override_driver_id
    INTO v_template
    FROM public.route_templates rt
    LEFT JOIN public.route_template_exceptions rte
      ON rte.route_template_id = rt.id
     AND rte.exception_date = p_route_date
    WHERE rt.id = v_template.id
      AND rt.is_active = true
      AND (
        (v_day_of_week = 0 AND rt.sunday)
        OR (v_day_of_week = 1 AND rt.monday)
        OR (v_day_of_week = 2 AND rt.tuesday)
        OR (v_day_of_week = 3 AND rt.wednesday)
        OR (v_day_of_week = 4 AND rt.thursday)
        OR (v_day_of_week = 5 AND rt.friday)
        OR (v_day_of_week = 6 AND rt.saturday)
      )
    FOR UPDATE OF rt;

    -- The template may have been disabled or rescheduled
    -- since the initial selection.
    IF NOT FOUND THEN
      CONTINUE;
    END IF;


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

    -- Serialize route generation for the effective driver and date.
    -- The lock is held until the surrounding transaction completes.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'brewtracker:route-assignment:'
        || v_driver_id::text
        || ':'
        || p_route_date::text,
        0
      )
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

    -- An operational route already exists for this occurrence.
    -- Do not regenerate or revalidate its historical snapshot.
    IF EXISTS (
      SELECT 1
      FROM public.routes r
      WHERE r.source_route_template_id = v_template.id
        AND r.route_date = p_route_date
    ) THEN
      CONTINUE;
    END IF;

    -- --------------------------------------------------------
    -- INV-V3-05: Reject duplicate machines within an occurrence
    -- --------------------------------------------------------

    if exists (
      with planned_machines as (
        -- Legacy recurring machine assignments
        select rts.machine_id
        from public.route_template_stops rts
        where rts.route_template_id = v_template.id
          and rts.machine_id is not null
          and not exists (
            select 1
            from public.route_template_stop_exceptions rtse
            where rtse.route_template_id = v_template.id
              and rtse.exception_date = p_route_date
              and rtse.exception_type =
                'remove'::public.route_stop_exception_type
              and rtse.route_template_stop_id = rts.id
          )

        union all

        -- Multi-machine recurring assignments
        select rtsm.machine_id
        from public.route_template_stops rts
        join public.route_template_stop_machines rtsm
          on rtsm.route_template_stop_id = rts.id
        where rts.route_template_id = v_template.id
          and not exists (
            select 1
            from public.route_template_stop_exceptions rtse
            where rtse.route_template_id = v_template.id
              and rtse.exception_date = p_route_date
              and rtse.exception_type =
                'remove'::public.route_stop_exception_type
              and rtse.route_template_stop_id = rts.id
          )

        union all

        -- Legacy ADD exception assignments
        select rtse.machine_id
        from public.route_template_stop_exceptions rtse
        where rtse.route_template_id = v_template.id
          and rtse.exception_date = p_route_date
          and rtse.exception_type =
            'add'::public.route_stop_exception_type
          and rtse.machine_id is not null

        union all

        -- Multi-machine ADD exception assignments
        select rtsem.machine_id
        from public.route_template_stop_exceptions rtse
        join public.route_template_stop_exception_machines rtsem
          on rtsem.route_template_stop_exception_id = rtse.id
        where rtse.route_template_id = v_template.id
          and rtse.exception_date = p_route_date
          and rtse.exception_type =
            'add'::public.route_stop_exception_type
      )
      select 1
      from planned_machines
      group by machine_id
      having count(*) > 1
    )
    then
      raise exception
        'Route template % assigns the same machine more than once on %',
        v_template.id,
        p_route_date;
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


    WITH existing_assignments AS (
      -- Legacy and multi-machine operational assignments.
      SELECT
        r.id AS route_id,
        s.id AS stop_id,
        s.client_id,
        COALESCE(sm.machine_id, s.machine_id) AS machine_id
      FROM public.routes r
      JOIN public.stops s ON s.route_id = r.id
      LEFT JOIN public.stop_machines sm ON sm.stop_id = s.id
      WHERE r.route_date = p_route_date
        AND r.driver_id = v_driver_id
        AND r.status <> 'cancelled'::public.route_status
    ),
    planned_assignments AS (
      -- Recurring template stops, excluding REMOVE exceptions.
      SELECT
        rts.client_id,
        COALESCE(rtsm.machine_id, rts.machine_id) AS machine_id
      FROM public.route_template_stops rts
      LEFT JOIN public.route_template_stop_machines rtsm
        ON rtsm.route_template_stop_id = rts.id
      WHERE rts.route_template_id = v_template.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.route_template_stop_exceptions rtse
          WHERE rtse.route_template_id = v_template.id
            AND rtse.exception_date = p_route_date
            AND rtse.exception_type =
              'remove'::public.route_stop_exception_type
            AND rtse.route_template_stop_id = rts.id
        )

      UNION ALL

      -- One-off ADD exceptions for this date.
      SELECT
        rtse.client_id,
        COALESCE(rtsem.machine_id, rtse.machine_id) AS machine_id
      FROM public.route_template_stop_exceptions rtse
      LEFT JOIN public.route_template_stop_exception_machines rtsem
        ON rtsem.route_template_stop_exception_id = rtse.id
      WHERE rtse.route_template_id = v_template.id
        AND rtse.exception_date = p_route_date
        AND rtse.exception_type =
          'add'::public.route_stop_exception_type
    )
    SELECT
      ea.route_id AS conflicting_route_id,
      ea.stop_id AS conflicting_stop_id,
      ea.client_id,
      ea.machine_id
    INTO v_conflict
    FROM existing_assignments ea
    JOIN planned_assignments pa
      ON (
        (
          ea.machine_id IS NOT NULL
          AND ea.machine_id = pa.machine_id
        )
        OR (
          ea.machine_id IS NULL
          AND pa.machine_id IS NULL
          AND ea.client_id = pa.client_id
        )
      )
    LIMIT 1;


    -- --------------------------------------------------------
    -- A matching operational assignment already exists.
    --
    -- Do not create another route occurrence containing the
    -- same assignment for the same driver/date.
    -- --------------------------------------------------------

    if found then
      continue;
    end if;

    -- INV-V3-05: Validate the complete planned occurrence.
    -- Existing operational conflicts were handled above.
    -- Remaining conflicts indicate an invalid recurring schedule.
    PERFORM public.assert_route_occurrence_has_no_conflicts(
      v_template.id,
      p_route_date
    );

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
    -- Snapshot recurring template machine assignments
    -- --------------------------------------------------------

    with numbered_template_stops as (
      select
        rts.id as template_stop_id,
        row_number() over (
          order by rts.sequence_number, rts.id
        )::integer as generated_sequence_number
      from public.route_template_stops rts
      where rts.route_template_id = v_template.id
        and not exists (
          select 1
          from public.route_template_stop_exceptions rtse
          where rtse.route_template_id = v_template.id
            and rtse.exception_date = p_route_date
            and rtse.exception_type =
              'remove'::public.route_stop_exception_type
            and rtse.route_template_stop_id = rts.id
        )
    )
    insert into public.stop_machines (
      stop_id,
      machine_id,
      sequence_number,
      drink_count_required
    )
    select
      s.id,
      rtsm.machine_id,
      rtsm.sequence_number,
      rtsm.drink_count_required
    from numbered_template_stops nts
    join public.stops s
      on s.route_id = v_route_id
      and s.sequence_number = nts.generated_sequence_number
    join public.route_template_stop_machines rtsm
      on rtsm.route_template_stop_id = nts.template_stop_id
    order by
      nts.generated_sequence_number,
      rtsm.sequence_number;


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

    -- --------------------------------------------------------
    -- Snapshot ADD exception machine assignments
    -- --------------------------------------------------------

    with numbered_add_exceptions as (
      select
        rtse.id as exception_id,
        (
          v_template_stops_created
          + row_number() over (
              order by rtse.created_at, rtse.id
            )
        )::integer as generated_sequence_number
      from public.route_template_stop_exceptions rtse
      where rtse.route_template_id = v_template.id
        and rtse.exception_date = p_route_date
        and rtse.exception_type =
          'add'::public.route_stop_exception_type
    )
    insert into public.stop_machines (
      stop_id,
      machine_id,
      sequence_number,
      drink_count_required
    )
    select
      s.id,
      rtsem.machine_id,
      rtsem.sequence_number,
      rtsem.drink_count_required
    from numbered_add_exceptions nae
    join public.stops s
      on s.route_id = v_route_id
      and s.sequence_number = nae.generated_sequence_number
    join public.route_template_stop_exception_machines rtsem
      on rtsem.route_template_stop_exception_id = nae.exception_id
    order by
      nae.generated_sequence_number,
      rtsem.sequence_number;


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
on function public.generate_routes_from_templates(date, uuid)
from public, anon, authenticated;

grant execute
on function public.generate_routes_from_templates(date, uuid)
to service_role;
