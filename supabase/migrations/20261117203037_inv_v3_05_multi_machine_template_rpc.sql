CREATE FUNCTION public.create_multi_machine_template_stop(
  p_route_template_id uuid,
  p_client_id uuid,
  p_machines jsonb,
  p_scheduled_start_time time DEFAULT NULL,
  p_scheduled_end_time time DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_sequence integer;
  v_template_stop_id uuid;
  v_machine_count integer;
  v_valid_machine_count integer;
BEGIN
  -- Serialize modifications through the parent template.
  PERFORM 1
  FROM public.route_templates
  WHERE id = p_route_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route template was not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Client was not found.';
  END IF;

  IF p_machines IS NULL
     OR jsonb_typeof(p_machines) <> 'array'
     OR jsonb_array_length(p_machines) = 0 THEN
    RAISE EXCEPTION 'At least one machine is required.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_machines) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
       OR jsonb_typeof(item.value -> 'machine_id') <> 'string'
       OR jsonb_typeof(item.value -> 'drink_count_required') <> 'boolean'
       OR (item.value ->> 'machine_id') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) THEN
    RAISE EXCEPTION 'Invalid machine assignment payload.';
  END IF;

  SELECT count(*)
  INTO v_machine_count
  FROM jsonb_array_elements(p_machines);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_machines) AS item(value)
    GROUP BY (item.value ->> 'machine_id')::uuid
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate machine assignments are not allowed.';
  END IF;

  -- Lock machine rows and validate client ownership.
  SELECT count(*)
  INTO v_valid_machine_count
  FROM (
    SELECT m.id
    FROM public.machines m
    JOIN jsonb_array_elements(p_machines) AS item(value)
      ON m.id = (item.value ->> 'machine_id')::uuid
    WHERE m.client_id = p_client_id
    FOR SHARE OF m
  ) AS valid_machines;

  IF v_valid_machine_count <> v_machine_count THEN
    RAISE EXCEPTION 'One or more machines do not belong to this client.';
  END IF;

  IF p_scheduled_start_time IS NOT NULL
     AND p_scheduled_end_time IS NOT NULL
     AND p_scheduled_end_time <= p_scheduled_start_time THEN
    RAISE EXCEPTION 'Scheduled end time must be after scheduled start time.';
  END IF;

  SELECT coalesce(max(sequence_number), 0) + 1
  INTO v_next_sequence
  FROM public.route_template_stops
  WHERE route_template_id = p_route_template_id;

  INSERT INTO public.route_template_stops (
    route_template_id,
    client_id,
    machine_id,
    sequence_number,
    scheduled_start_time,
    scheduled_end_time,
    drink_count_required,
    notes
  )
  VALUES (
    p_route_template_id,
    p_client_id,
    NULL,
    v_next_sequence,
    p_scheduled_start_time,
    p_scheduled_end_time,
    false,
    nullif(trim(p_notes), '')
  )
  RETURNING id INTO v_template_stop_id;

  INSERT INTO public.route_template_stop_machines (
    route_template_stop_id,
    machine_id,
    sequence_number,
    drink_count_required
  )
  SELECT
    v_template_stop_id,
    (item.value ->> 'machine_id')::uuid,
    item.ordinality::integer,
    (item.value ->> 'drink_count_required')::boolean
  FROM jsonb_array_elements(p_machines)
    WITH ORDINALITY AS item(value, ordinality)
  ORDER BY item.ordinality;

  -- Validate the complete assignment set.
  PERFORM public.assert_route_template_has_no_conflicts(
    p_route_template_id
  );

  RETURN v_template_stop_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_multi_machine_template_stop(
  uuid, uuid, jsonb, time, time, text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_multi_machine_template_stop(
  uuid, uuid, jsonb, time, time, text
)
TO service_role;