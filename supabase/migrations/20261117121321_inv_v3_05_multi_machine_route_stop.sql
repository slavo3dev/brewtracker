
CREATE FUNCTION public.create_multi_machine_route_stop(
  p_route_id uuid,
  p_client_id uuid,
  p_machines jsonb,
  p_scheduled_start_at timestamptz DEFAULT NULL,
  p_scheduled_end_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_route_status public.route_status;
  v_stop_id uuid;
  v_next_sequence integer;
  v_machine jsonb;
  v_machine_id uuid;
  v_machine_client_id uuid;
  v_sequence integer := 0;
  v_drink_count_required boolean;
BEGIN
  -- Lock the route to serialize stop creation.
  SELECT status
  INTO v_route_status
  FROM public.routes
  WHERE id = p_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route not found';
  END IF;

  IF v_route_status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION
      'Stops can only be added to draft or scheduled routes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF p_machines IS NULL
     OR jsonb_typeof(p_machines) <> 'array'
     OR jsonb_array_length(p_machines) = 0 THEN
    RAISE EXCEPTION 'At least one machine is required';
  END IF;

  IF p_scheduled_start_at IS NOT NULL
     AND p_scheduled_end_at IS NOT NULL
     AND p_scheduled_end_at <= p_scheduled_start_at THEN
    RAISE EXCEPTION 'Scheduled end must be after start';
  END IF;

  -- Validate every machine before creating the stop.
  FOR v_machine IN
    SELECT value FROM jsonb_array_elements(p_machines)
  LOOP
    IF jsonb_typeof(v_machine) <> 'object'
       OR jsonb_typeof(v_machine->'machine_id') <> 'string'
       OR jsonb_typeof(v_machine->'drink_count_required') <> 'boolean'
    THEN
      RAISE EXCEPTION 'Invalid machine assignment';
    END IF;

    v_machine_id := (v_machine->>'machine_id')::uuid;

    SELECT client_id
    INTO v_machine_client_id
    FROM public.machines
    WHERE id = v_machine_id
    FOR SHARE;

    IF NOT FOUND OR v_machine_client_id IS DISTINCT FROM p_client_id THEN
      RAISE EXCEPTION 'Machine does not belong to client';
    END IF;
  END LOOP;

  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_next_sequence
  FROM public.stops
  WHERE route_id = p_route_id;

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
    p_route_id,
    p_client_id,
    NULL,
    v_next_sequence,
    'pending',
    p_scheduled_start_at,
    p_scheduled_end_at,
    p_notes,
    false
  )
  RETURNING id INTO v_stop_id;

  FOR v_machine IN
    SELECT value FROM jsonb_array_elements(p_machines)
  LOOP
    v_sequence := v_sequence + 1;
    v_machine_id := (v_machine->>'machine_id')::uuid;
    v_drink_count_required :=
      (v_machine->>'drink_count_required')::boolean;

    INSERT INTO public.stop_machines (
      stop_id,
      machine_id,
      sequence_number,
      drink_count_required
    )
    VALUES (
      v_stop_id,
      v_machine_id,
      v_sequence,
      v_drink_count_required
    );
  END LOOP;

  RETURN v_stop_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_multi_machine_route_stop(
  uuid, uuid, jsonb, timestamptz, timestamptz, text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_multi_machine_route_stop(
  uuid, uuid, jsonb, timestamptz, timestamptz, text
)
TO service_role;
