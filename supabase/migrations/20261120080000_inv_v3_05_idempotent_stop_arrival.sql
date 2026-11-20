-- INV-V3-05: Idempotent stop arrival synchronization.
-- Preserve the first arrival timestamp and never reopen closed stops.

CREATE OR REPLACE FUNCTION public.mark_service_stop_arrived(
  p_stop_id uuid,
  p_arrived_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_route_id uuid;
  v_route_status public.route_status;
  v_stop_status public.stop_status;
  v_existing_arrival timestamptz;
BEGIN
  IF p_stop_id IS NULL OR p_arrived_at IS NULL THEN
    RAISE EXCEPTION 'Stop ID and arrival timestamp are required';
  END IF;

  -- Resolve the parent route before acquiring locks.
  SELECT s.route_id
  INTO v_route_id
  FROM public.stops s
  WHERE s.id = p_stop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service stop not found';
  END IF;

  -- Match existing field-staff route authorization.
  IF NOT (
    public.is_field_staff()
    AND public.current_user_has_route(v_route_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this service stop'
      USING ERRCODE = '42501';
  END IF;

  -- Match route-before-stop lock ordering.
  SELECT r.status
  INTO v_route_status
  FROM public.routes r
  WHERE r.id = v_route_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service route not found';
  END IF;

  SELECT s.status, s.arrived_at
  INTO v_stop_status, v_existing_arrival
  FROM public.stops s
  WHERE s.id = p_stop_id
    AND s.route_id = v_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service stop changed during arrival synchronization';
  END IF;

  IF v_route_status = 'cancelled'
     OR v_stop_status = 'skipped' THEN
    RAISE EXCEPTION
      'Cannot synchronize arrival for a cancelled route or skipped stop';
  END IF;

  IF v_existing_arrival IS NOT NULL THEN
    -- Accept only a retry of the original arrival verification.
    IF v_existing_arrival = p_arrived_at THEN
      RETURN;
    END IF;

    RAISE EXCEPTION
      'Stop already has a different arrival timestamp';
  END IF;

  IF v_route_status = 'cancelled'
     OR v_stop_status IN ('completed', 'skipped') THEN
    RAISE EXCEPTION 'Cannot record arrival for a closed route or stop';
  END IF;

  UPDATE public.stops
  SET status = 'in_progress',
      arrived_at = p_arrived_at
  WHERE id = p_stop_id
    AND arrived_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_service_stop_arrived(
  uuid, timestamptz
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mark_service_stop_arrived(
  uuid, timestamptz
) TO authenticated;
