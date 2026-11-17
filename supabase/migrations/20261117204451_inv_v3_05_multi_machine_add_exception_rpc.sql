
-- INV-V3-05: Multi-machine ADD exception
-- One client stop with multiple machine assignments.

CREATE OR REPLACE FUNCTION public.create_multi_machine_add_exception(
  p_route_template_id uuid,
  p_exception_date date,
  p_client_id uuid,
  p_machines jsonb,
  p_scheduled_start_time time DEFAULT NULL,
  p_scheduled_end_time time DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.route_templates%ROWTYPE;
  v_driver_id uuid;
  v_route public.routes%ROWTYPE;
  v_route_exists boolean := false;
  v_exception_id uuid;
  v_stop_id uuid;
  v_next_sequence integer;
  v_machine_count integer;
  v_valid_machine_count integer;
  v_duplicate_count integer;
BEGIN
  -- Validate required inputs.
  IF p_route_template_id IS NULL
     OR p_exception_date IS NULL
     OR p_client_id IS NULL THEN
    RAISE EXCEPTION
      'Template, exception date, and client are required.';
  END IF;

  IF p_scheduled_start_time IS NOT NULL
     AND p_scheduled_end_time IS NOT NULL
     AND p_scheduled_end_time <= p_scheduled_start_time THEN
    RAISE EXCEPTION
      'Scheduled end time must be after start time.';
  END IF;

  IF p_machines IS NULL
     OR jsonb_typeof(p_machines) <> 'array'
     OR jsonb_array_length(p_machines) = 0 THEN
    RAISE EXCEPTION
      'At least one machine is required.';
  END IF;

  -- Validate each JSON item before casting its values.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_machines) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
       OR jsonb_typeof(item.value -> 'machine_id') <> 'string'
       OR jsonb_typeof(item.value -> 'drink_count_required') <> 'boolean'
       OR (item.value ->> 'machine_id') IS NULL
       OR (item.value ->> 'drink_count_required') IS NULL
  ) THEN
    RAISE EXCEPTION
      'Each machine requires machine_id and boolean drink_count_required.';
  END IF;

  -- Acquire the occurrence lock before checking route existence.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'brewtracker:template-occurrence:'
      || p_route_template_id::text
      || ':'
      || p_exception_date::text,
      0
    )
  );

  -- Lock and validate the template.
  SELECT *
  INTO v_template
  FROM public.route_templates
  WHERE id = p_route_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route template does not exist.';
  END IF;

  -- Resolve the effective driver, including a date-specific override.
  SELECT COALESCE(rte.override_driver_id, v_template.driver_id)
  INTO v_driver_id
  FROM (SELECT 1) AS base
  LEFT JOIN public.route_template_exceptions rte
    ON rte.route_template_id = p_route_template_id
   AND rte.exception_date = p_exception_date;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'An effective driver is required.';
  END IF;

  -- Coordinate assignments across templates for this driver/date.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'brewtracker:route-assignment:'
      || v_driver_id::text
      || ':'
      || p_exception_date::text,
      0
    )
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Client does not exist.';
  END IF;

  -- Validate machine UUIDs, ownership and uniqueness.
  SELECT count(*)
  INTO v_machine_count
  FROM jsonb_array_elements(p_machines);

  SELECT count(DISTINCT (item.value ->> 'machine_id')::uuid)
  INTO v_duplicate_count
  FROM jsonb_array_elements(p_machines) AS item(value);

  IF v_duplicate_count <> v_machine_count THEN
    RAISE EXCEPTION
      'Duplicate machine assignments are not allowed.';
  END IF;

  SELECT count(*)
  INTO v_valid_machine_count
  FROM (
    SELECT m.id
    FROM jsonb_array_elements(p_machines) AS item(value)
    JOIN public.machines m
      ON m.id = (item.value ->> 'machine_id')::uuid
    WHERE m.client_id = p_client_id
    FOR SHARE OF m
  ) AS locked_machines;

  IF v_valid_machine_count <> v_machine_count THEN
    RAISE EXCEPTION
      'Every selected machine must belong to the client.';
  END IF;

  -- Check whether this occurrence already has an operational route.
  SELECT *
  INTO v_route
  FROM public.routes
  WHERE source_route_template_id = p_route_template_id
    AND route_date = p_exception_date
  FOR UPDATE;

  v_route_exists := FOUND;

  IF v_route_exists THEN
    IF v_route.status NOT IN (
      'draft'::public.route_status,
      'scheduled'::public.route_status
    ) THEN
      RAISE EXCEPTION
        'Stops cannot be added to a started, completed, or cancelled route.';
    END IF;

    -- Prevent reassigning a machine already on this route.
    IF EXISTS (
      SELECT 1
      FROM public.stops s
      LEFT JOIN public.stop_machines sm
        ON sm.stop_id = s.id
      JOIN jsonb_array_elements(p_machines) AS item(value)
        ON (
          s.machine_id = (item.value ->> 'machine_id')::uuid
          OR sm.machine_id = (item.value ->> 'machine_id')::uuid
        )
      WHERE s.route_id = v_route.id
    ) THEN
      RAISE EXCEPTION
        'One or more machines are already assigned to this route.';
    END IF;
  END IF;


  -- Prevent duplicate machine assignments in existing
  -- ADD exceptions for this template occurrence.
  IF EXISTS (
    SELECT 1
    FROM public.route_template_stop_exceptions e
    LEFT JOIN public.route_template_stop_exception_machines em
      ON em.route_template_stop_exception_id = e.id
    JOIN jsonb_array_elements(p_machines) AS item(value)
      ON (
        e.machine_id = (item.value ->> 'machine_id')::uuid
        OR em.machine_id = (item.value ->> 'machine_id')::uuid
      )
    WHERE e.route_template_id = p_route_template_id
      AND e.exception_date = p_exception_date
      AND e.exception_type = 'add'::public.route_stop_exception_type
  ) THEN
    RAISE EXCEPTION
      'One or more machines are already assigned to an ADD exception for this date.';
  END IF;


  -- Prevent conflicts with effective recurring assignments.
  -- A REMOVE exception excludes its recurring stop for this date.
  IF EXISTS (
    SELECT 1
    FROM public.route_template_stops ts
    LEFT JOIN public.route_template_stop_machines tsm
      ON tsm.route_template_stop_id = ts.id
    JOIN jsonb_array_elements(p_machines) AS item(value)
      ON (
        ts.machine_id = (item.value ->> 'machine_id')::uuid
        OR tsm.machine_id = (item.value ->> 'machine_id')::uuid
      )
    WHERE ts.route_template_id = p_route_template_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_template_stop_exceptions re
        WHERE re.route_template_id = p_route_template_id
          AND re.exception_date = p_exception_date
          AND re.exception_type =
            'remove'::public.route_stop_exception_type
          AND re.route_template_stop_id = ts.id
      )
  ) THEN
    RAISE EXCEPTION
      'One or more machines are already assigned to a recurring stop for this date.';
  END IF;


  -- Persist the ADD exception.
  INSERT INTO public.route_template_stop_exceptions (
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
  VALUES (
    p_route_template_id,
    p_exception_date,
    'add'::public.route_stop_exception_type,
    p_client_id,
    NULL,
    p_scheduled_start_time,
    p_scheduled_end_time,
    false,
    nullif(trim(p_notes), ''),
    p_created_by
  )
  RETURNING id INTO v_exception_id;

  -- Save the machine assignments for future route generation.
  INSERT INTO public.route_template_stop_exception_machines (
    route_template_stop_exception_id,
    machine_id,
    sequence_number,
    drink_count_required
  )
  SELECT
    v_exception_id,
    (item.value ->> 'machine_id')::uuid,
    item.ordinality::integer,
    (item.value ->> 'drink_count_required')::boolean
  FROM jsonb_array_elements(p_machines)
    WITH ORDINALITY AS item(value, ordinality)
  ORDER BY item.ordinality;

  -- Validate the complete occurrence after inserting
  -- the proposed ADD exception and machine assignments.
  -- Any validation failure rolls back the transaction.
  PERFORM public.assert_route_occurrence_has_no_conflicts(
    p_route_template_id,
    p_exception_date
  );

  -- No operational route yet: generator will apply this exception.
  IF NOT v_route_exists THEN
    RETURN v_exception_id;
  END IF;

  -- Append a single operational client stop.
  SELECT coalesce(max(sequence_number), 0) + 1
  INTO v_next_sequence
  FROM public.stops
  WHERE route_id = v_route.id;

  INSERT INTO public.stops (
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
  VALUES (
    v_route.id,
    p_client_id,
    NULL,
    v_next_sequence,
    'pending'::public.stop_status,
    CASE
      WHEN p_scheduled_start_time IS NULL THEN NULL
      ELSE p_exception_date::timestamp + p_scheduled_start_time
    END,
    CASE
      WHEN p_scheduled_end_time IS NULL THEN NULL
      ELSE p_exception_date::timestamp + p_scheduled_end_time
    END,
    nullif(trim(p_notes), ''),
    false
  )
  RETURNING id INTO v_stop_id;

  -- Snapshot all machine assignments on the operational stop.
  INSERT INTO public.stop_machines (
    stop_id,
    machine_id,
    sequence_number,
    drink_count_required
  )
  SELECT
    v_stop_id,
    (item.value ->> 'machine_id')::uuid,
    item.ordinality::integer,
    (item.value ->> 'drink_count_required')::boolean
  FROM jsonb_array_elements(p_machines)
    WITH ORDINALITY AS item(value, ordinality)
  ORDER BY item.ordinality;

  RETURN v_exception_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_multi_machine_add_exception(
  uuid, date, uuid, jsonb, time, time, text, uuid
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_multi_machine_add_exception(
  uuid, date, uuid, jsonb, time, time, text, uuid
)
TO service_role;
