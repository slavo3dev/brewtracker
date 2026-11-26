
-- INV-V3-05: Validate effective route occurrence assignments.
-- Call after acquiring the appropriate occurrence/driver locks.
-- This function validates data; it does not acquire locks.

CREATE OR REPLACE FUNCTION public.assert_route_occurrence_has_no_conflicts(
  p_route_template_id uuid,
  p_route_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_driver_id uuid;
  v_conflicting_machine uuid;
BEGIN
  IF p_route_template_id IS NULL OR p_route_date IS NULL THEN
    RAISE EXCEPTION 'Template and route date are required.';
  END IF;

  -- Resolve the effective driver for this occurrence.
  SELECT COALESCE(rte.override_driver_id, rt.driver_id)
  INTO v_driver_id
  FROM public.route_templates rt
  LEFT JOIN public.route_template_exceptions rte
    ON rte.route_template_id = rt.id
   AND rte.exception_date = p_route_date
  
  WHERE rt.id = p_route_template_id
    AND rt.is_active = true
    AND COALESCE(rte.is_skipped, false) = false
    AND (
      (EXTRACT(DOW FROM p_route_date) = 0 AND rt.sunday)
      OR (EXTRACT(DOW FROM p_route_date) = 1 AND rt.monday)
      OR (EXTRACT(DOW FROM p_route_date) = 2 AND rt.tuesday)
      OR (EXTRACT(DOW FROM p_route_date) = 3 AND rt.wednesday)
      OR (EXTRACT(DOW FROM p_route_date) = 4 AND rt.thursday)
      OR (EXTRACT(DOW FROM p_route_date) = 5 AND rt.friday)
      OR (EXTRACT(DOW FROM p_route_date) = 6 AND rt.saturday)
    );


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Template occurrence is inactive, skipped, or missing.';
  END IF;

  -- Detect duplicate machines within the selected occurrence.
  WITH effective_machines AS (
    SELECT rts.machine_id
    FROM public.route_template_stops rts
    WHERE rts.route_template_id = p_route_template_id
      AND rts.machine_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_template_stop_exceptions re
        WHERE re.route_template_id = p_route_template_id
          AND re.exception_date = p_route_date
          AND re.exception_type = 'remove'::public.route_stop_exception_type
          AND re.route_template_stop_id = rts.id
      )

    UNION ALL

    SELECT rtsm.machine_id
    FROM public.route_template_stops rts
    JOIN public.route_template_stop_machines rtsm
      ON rtsm.route_template_stop_id = rts.id
    WHERE rts.route_template_id = p_route_template_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_template_stop_exceptions re
        WHERE re.route_template_id = p_route_template_id
          AND re.exception_date = p_route_date
          AND re.exception_type = 'remove'::public.route_stop_exception_type
          AND re.route_template_stop_id = rts.id
      )

    UNION ALL

    SELECT e.machine_id
    FROM public.route_template_stop_exceptions e
    WHERE e.route_template_id = p_route_template_id
      AND e.exception_date = p_route_date
      AND e.exception_type = 'add'::public.route_stop_exception_type
      AND e.machine_id IS NOT NULL

    UNION ALL

    SELECT em.machine_id
    FROM public.route_template_stop_exceptions e
    JOIN public.route_template_stop_exception_machines em
      ON em.route_template_stop_exception_id = e.id
    WHERE e.route_template_id = p_route_template_id
      AND e.exception_date = p_route_date
      AND e.exception_type = 'add'::public.route_stop_exception_type
  )
  SELECT machine_id
  INTO v_conflicting_machine
  FROM effective_machines
  GROUP BY machine_id
  HAVING count(*) > 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Machine % is assigned more than once for this occurrence.',
      v_conflicting_machine;
  END IF;

  -- Check effective assignments against other generated routes.
  -- Exclude this template's own operational route.
  IF EXISTS (
    WITH planned AS (
      SELECT rts.client_id, COALESCE(rtsm.machine_id, rts.machine_id) AS machine_id
      FROM public.route_template_stops rts
      LEFT JOIN public.route_template_stop_machines rtsm
        ON rtsm.route_template_stop_id = rts.id
      WHERE rts.route_template_id = p_route_template_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.route_template_stop_exceptions re
          WHERE re.route_template_id = p_route_template_id
            AND re.exception_date = p_route_date
            AND re.exception_type = 'remove'::public.route_stop_exception_type
            AND re.route_template_stop_id = rts.id
        )

      UNION ALL

      SELECT e.client_id, COALESCE(em.machine_id, e.machine_id)
      FROM public.route_template_stop_exceptions e
      LEFT JOIN public.route_template_stop_exception_machines em
        ON em.route_template_stop_exception_id = e.id
      WHERE e.route_template_id = p_route_template_id
        AND e.exception_date = p_route_date
        AND e.exception_type = 'add'::public.route_stop_exception_type
    ),
    operational AS (
      SELECT s.client_id, COALESCE(sm.machine_id, s.machine_id) AS machine_id
      FROM public.routes r
      JOIN public.stops s ON s.route_id = r.id
      LEFT JOIN public.stop_machines sm ON sm.stop_id = s.id
      WHERE r.route_date = p_route_date
        AND r.driver_id = v_driver_id
        AND r.status <> 'cancelled'::public.route_status
        AND r.source_route_template_id IS DISTINCT FROM p_route_template_id
    )
    SELECT 1
    FROM planned p
    JOIN operational o
      ON (
        (p.machine_id IS NOT NULL AND p.machine_id = o.machine_id)
        OR
        (p.machine_id IS NULL AND o.machine_id IS NULL
          AND p.client_id = o.client_id)
      )
  ) THEN
    RAISE EXCEPTION
      'This occurrence conflicts with another operational route.';
  END IF;

  -- Check other active templates scheduled for this date,
  -- using effective drivers, skips, REMOVE and ADD exceptions.
  IF EXISTS (
    WITH planned AS (
      SELECT
        rts.client_id,
        COALESCE(rtsm.machine_id, rts.machine_id) AS machine_id
      FROM public.route_template_stops rts
      LEFT JOIN public.route_template_stop_machines rtsm
        ON rtsm.route_template_stop_id = rts.id
      WHERE rts.route_template_id = p_route_template_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.route_template_stop_exceptions re
          WHERE re.route_template_id = p_route_template_id
            AND re.exception_date = p_route_date
            AND re.exception_type =
              'remove'::public.route_stop_exception_type
            AND re.route_template_stop_id = rts.id
        )

      UNION ALL

      SELECT
        e.client_id,
        COALESCE(em.machine_id, e.machine_id)
      FROM public.route_template_stop_exceptions e
      LEFT JOIN public.route_template_stop_exception_machines em
        ON em.route_template_stop_exception_id = e.id
      WHERE e.route_template_id = p_route_template_id
        AND e.exception_date = p_route_date
        AND e.exception_type =
          'add'::public.route_stop_exception_type
    ),
    other_templates AS (
      SELECT rt.id
      FROM public.route_templates rt
      LEFT JOIN public.route_template_exceptions rte
        ON rte.route_template_id = rt.id
       AND rte.exception_date = p_route_date
      WHERE rt.id <> p_route_template_id
        AND rt.is_active = true
        AND COALESCE(rte.is_skipped, false) = false
        AND COALESCE(rte.override_driver_id, rt.driver_id) =
          v_driver_id
        AND (
          (EXTRACT(DOW FROM p_route_date) = 0 AND rt.sunday)
          OR (EXTRACT(DOW FROM p_route_date) = 1 AND rt.monday)
          OR (EXTRACT(DOW FROM p_route_date) = 2 AND rt.tuesday)
          OR (EXTRACT(DOW FROM p_route_date) = 3 AND rt.wednesday)
          OR (EXTRACT(DOW FROM p_route_date) = 4 AND rt.thursday)
          OR (EXTRACT(DOW FROM p_route_date) = 5 AND rt.friday)
          OR (EXTRACT(DOW FROM p_route_date) = 6 AND rt.saturday)
        )
    ),
    other_assignments AS (
      SELECT
        rts.client_id,
        COALESCE(rtsm.machine_id, rts.machine_id) AS machine_id
      FROM other_templates ot
      JOIN public.route_template_stops rts
        ON rts.route_template_id = ot.id
      LEFT JOIN public.route_template_stop_machines rtsm
        ON rtsm.route_template_stop_id = rts.id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.route_template_stop_exceptions re
        WHERE re.route_template_id = ot.id
          AND re.exception_date = p_route_date
          AND re.exception_type =
            'remove'::public.route_stop_exception_type
          AND re.route_template_stop_id = rts.id
      )

      UNION ALL

      SELECT
        e.client_id,
        COALESCE(em.machine_id, e.machine_id)
      FROM other_templates ot
      JOIN public.route_template_stop_exceptions e
        ON e.route_template_id = ot.id
      LEFT JOIN public.route_template_stop_exception_machines em
        ON em.route_template_stop_exception_id = e.id
      WHERE e.exception_date = p_route_date
        AND e.exception_type =
          'add'::public.route_stop_exception_type
    )
    SELECT 1
    FROM planned p
    JOIN other_assignments o
      ON (
        (p.machine_id IS NOT NULL AND p.machine_id = o.machine_id)
        OR (
          p.machine_id IS NULL
          AND o.machine_id IS NULL
          AND p.client_id = o.client_id
        )
      )
  ) THEN
    RAISE EXCEPTION
      'This occurrence conflicts with another recurring template for the same driver and date.';
  END IF;

END;
$$;

REVOKE ALL
ON FUNCTION public.assert_route_occurrence_has_no_conflicts(uuid, date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.assert_route_occurrence_has_no_conflicts(uuid, date)
TO service_role;
