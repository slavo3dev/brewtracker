-- INV-V3-05: Multi-machine recurring route assignments

CREATE TABLE public.route_template_stop_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  route_template_stop_id uuid NOT NULL
    REFERENCES public.route_template_stops(id)
    ON DELETE CASCADE,

  machine_id uuid NOT NULL
    REFERENCES public.machines(id)
    ON DELETE RESTRICT,

  sequence_number integer NOT NULL
    CHECK (sequence_number > 0),

  drink_count_required boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT route_template_stop_machines_unique_machine
    UNIQUE (route_template_stop_id, machine_id),

  CONSTRAINT route_template_stop_machines_unique_sequence
    UNIQUE (route_template_stop_id, sequence_number)
);

CREATE INDEX route_template_stop_machines_machine_idx
  ON public.route_template_stop_machines(machine_id);


CREATE TABLE public.route_template_stop_exception_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  route_template_stop_exception_id uuid NOT NULL
    REFERENCES public.route_template_stop_exceptions(id)
    ON DELETE CASCADE,

  machine_id uuid NOT NULL
    REFERENCES public.machines(id)
    ON DELETE RESTRICT,

  sequence_number integer NOT NULL
    CHECK (sequence_number > 0),

  drink_count_required boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT route_template_stop_exception_machines_unique_machine
    UNIQUE (route_template_stop_exception_id, machine_id),

  CONSTRAINT route_template_stop_exception_machines_unique_sequence
    UNIQUE (route_template_stop_exception_id, sequence_number)
);

CREATE INDEX route_template_stop_exception_machines_machine_idx
  ON public.route_template_stop_exception_machines(machine_id);

-- ============================================================
-- INV-V3-05: Machine assignment table security
-- ============================================================

ALTER TABLE public.route_template_stop_machines
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.route_template_stop_exception_machines
  ENABLE ROW LEVEL SECURITY;

-- Prevent direct client-side modifications.
REVOKE ALL ON public.route_template_stop_machines
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.route_template_stop_exception_machines
  FROM PUBLIC, anon, authenticated;

-- Allow authorized users to read assignments.
GRANT SELECT ON public.route_template_stop_machines
  TO authenticated;

GRANT SELECT ON public.route_template_stop_exception_machines
  TO authenticated;

-- Server-side RPCs use service_role.
GRANT ALL ON public.route_template_stop_machines
  TO service_role;

GRANT ALL ON public.route_template_stop_exception_machines
  TO service_role;

CREATE POLICY "Authorized users can read template machine assignments"
ON public.route_template_stop_machines
FOR SELECT
TO authenticated
USING (
  public.is_ceo()
  OR (
    public.is_manager()
    AND EXISTS (
      SELECT 1
      FROM public.route_template_stops rts
      JOIN public.route_templates rt
        ON rt.id = rts.route_template_id
      WHERE rts.id = route_template_stop_machines.route_template_stop_id
        AND public.warehouse_is_in_current_user_region(
          rt.warehouse_id
        )
    )
  )
);

CREATE POLICY "Authorized users can read exception machine assignments"
ON public.route_template_stop_exception_machines
FOR SELECT
TO authenticated
USING (
  public.is_ceo()
  OR (
    public.is_manager()
    AND EXISTS (
      SELECT 1
      FROM public.route_template_stop_exceptions rtse
      JOIN public.route_templates rt
        ON rt.id = rtse.route_template_id
      WHERE rtse.id =
        route_template_stop_exception_machines.route_template_stop_exception_id
        AND public.warehouse_is_in_current_user_region(
          rt.warehouse_id
        )
    )
  )
);

-- Validate recurring-template machine assignments.
CREATE FUNCTION public.inv_v3_05_validate_template_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id uuid;
  v_legacy_machine_id uuid;
  v_machine_client_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1
    FROM public.route_template_stops
    WHERE id = OLD.route_template_stop_id
    FOR UPDATE;

    RETURN OLD;
  END IF;

  -- Prevent moving an assignment without locking its original parent.
  IF TG_OP = 'UPDATE'
     AND NEW.route_template_stop_id IS DISTINCT FROM OLD.route_template_stop_id THEN
    PERFORM 1
    FROM public.route_template_stops
    WHERE id = OLD.route_template_stop_id
    FOR UPDATE;
  END IF;

  SELECT client_id, machine_id
  INTO v_client_id, v_legacy_machine_id
  FROM public.route_template_stops
  WHERE id = NEW.route_template_stop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route template stop does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_legacy_machine_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot mix legacy and multi-machine assignments'
      USING ERRCODE = '23514';
  END IF;

  SELECT client_id
  INTO v_machine_client_id
  FROM public.machines
  WHERE id = NEW.machine_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_machine_client_id IS DISTINCT FROM v_client_id THEN
    RAISE EXCEPTION 'Machine does not belong to the template stop client'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_05_validate_template_machine_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON public.route_template_stop_machines
FOR EACH ROW
EXECUTE FUNCTION public.inv_v3_05_validate_template_machine();


-- Validate ADD-exception machine assignments.
CREATE FUNCTION public.inv_v3_05_validate_exception_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id uuid;
  v_legacy_machine_id uuid;
  v_exception_type text;
  v_machine_client_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1
    FROM public.route_template_stop_exceptions
    WHERE id = OLD.route_template_stop_exception_id
    FOR UPDATE;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.route_template_stop_exception_id
         IS DISTINCT FROM OLD.route_template_stop_exception_id THEN
    PERFORM 1
    FROM public.route_template_stop_exceptions
    WHERE id = OLD.route_template_stop_exception_id
    FOR UPDATE;
  END IF;

  SELECT client_id, machine_id, exception_type::text
  INTO v_client_id, v_legacy_machine_id, v_exception_type
  FROM public.route_template_stop_exceptions
  WHERE id = NEW.route_template_stop_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route template exception does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_exception_type <> 'add' THEN
    RAISE EXCEPTION 'Machine assignments are allowed only for ADD exceptions'
      USING ERRCODE = '23514';
  END IF;

  IF v_legacy_machine_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot mix legacy and multi-machine exception assignments'
      USING ERRCODE = '23514';
  END IF;

  SELECT client_id
  INTO v_machine_client_id
  FROM public.machines
  WHERE id = NEW.machine_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_machine_client_id IS DISTINCT FROM v_client_id THEN
    RAISE EXCEPTION 'Machine does not belong to the exception client'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_05_validate_exception_machine_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON public.route_template_stop_exception_machines
FOR EACH ROW
EXECUTE FUNCTION public.inv_v3_05_validate_exception_machine();

REVOKE ALL
ON FUNCTION public.inv_v3_05_validate_template_machine()
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION public.inv_v3_05_validate_exception_machine()
FROM PUBLIC, anon, authenticated;

-- Protect multi-machine template stops when parent fields change.
CREATE FUNCTION public.inv_v3_05_guard_template_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.machine_id IS DISTINCT FROM OLD.machine_id THEN

    IF NEW.machine_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.route_template_stop_machines
      WHERE route_template_stop_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot mix legacy and multi-machine assignments'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.route_template_stop_machines rtsm
      JOIN public.machines m ON m.id = rtsm.machine_id
      WHERE rtsm.route_template_stop_id = NEW.id
        AND m.client_id IS DISTINCT FROM NEW.client_id
    ) THEN
      RAISE EXCEPTION 'Template stop contains machines belonging to another client'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_05_guard_template_stop_trigger
BEFORE UPDATE OF client_id, machine_id
ON public.route_template_stops
FOR EACH ROW
EXECUTE FUNCTION public.inv_v3_05_guard_template_stop();


-- Protect ADD exceptions when parent fields change.
CREATE FUNCTION public.inv_v3_05_guard_exception()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.route_template_stop_exception_machines
    WHERE route_template_stop_exception_id = NEW.id
  ) THEN

    IF NEW.exception_type <> 'add' THEN
      RAISE EXCEPTION 'Machine assignments require an ADD exception'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.machine_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot mix legacy and multi-machine exception assignments'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.route_template_stop_exception_machines rtsem
      JOIN public.machines m ON m.id = rtsem.machine_id
      WHERE rtsem.route_template_stop_exception_id = NEW.id
        AND m.client_id IS DISTINCT FROM NEW.client_id
    ) THEN
      RAISE EXCEPTION 'Exception contains machines belonging to another client'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_05_guard_exception_trigger
BEFORE UPDATE OF client_id, machine_id, exception_type
ON public.route_template_stop_exceptions
FOR EACH ROW
EXECUTE FUNCTION public.inv_v3_05_guard_exception();


REVOKE ALL ON FUNCTION public.inv_v3_05_guard_template_stop()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.inv_v3_05_guard_exception()
FROM PUBLIC, anon, authenticated;

-- ============================================================
-- INV-V3-05: Multi-machine recurring template conflict checker
-- ============================================================

CREATE OR REPLACE FUNCTION public.assert_route_template_has_no_conflicts(
  p_route_template_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.route_templates%ROWTYPE;
  v_conflict record;
BEGIN
  SELECT *
  INTO v_template
  FROM public.route_templates
  WHERE id = p_route_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route template was not found.';
  END IF;

  -- Reject duplicate machine assignments within this template.
  IF EXISTS (
    WITH template_machines AS (
      SELECT rts.machine_id
      FROM public.route_template_stops rts
      WHERE rts.route_template_id = p_route_template_id
        AND rts.machine_id IS NOT NULL

      UNION ALL

      SELECT rtsm.machine_id
      FROM public.route_template_stops rts
      JOIN public.route_template_stop_machines rtsm
        ON rtsm.route_template_stop_id = rts.id
      WHERE rts.route_template_id = p_route_template_id
    )
    SELECT 1
    FROM template_machines
    GROUP BY machine_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'The same machine cannot be assigned to multiple stops in one recurring template.';
  END IF;

  -- Inactive templates require internal validation only.
  -- Cross-template conflicts are checked upon activation.
  IF NOT v_template.is_active THEN
    RETURN;
  END IF;

  WITH effective_assignments AS (
    -- Legacy single-machine assignments.
    SELECT
      rts.route_template_id,
      rts.id AS stop_id,
      rts.client_id,
      rts.machine_id
    FROM public.route_template_stops rts
    WHERE rts.machine_id IS NOT NULL

    UNION ALL

    -- New multi-machine assignments.
    SELECT
      rts.route_template_id,
      rts.id AS stop_id,
      rts.client_id,
      rtsm.machine_id
    FROM public.route_template_stops rts
    JOIN public.route_template_stop_machines rtsm
      ON rtsm.route_template_stop_id = rts.id

    UNION ALL

    -- Truly machine-less stops.
    SELECT
      rts.route_template_id,
      rts.id AS stop_id,
      rts.client_id,
      NULL::uuid AS machine_id
    FROM public.route_template_stops rts
    WHERE rts.machine_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_template_stop_machines rtsm
        WHERE rtsm.route_template_stop_id = rts.id
      )
  )
  SELECT
    other_template.name AS conflicting_template_name,
    other_assignment.machine_id,
    machine.serial_number AS machine_serial_number,
    client.name AS client_name,
    CASE
      WHEN v_template.monday AND other_template.monday THEN 'Monday'
      WHEN v_template.tuesday AND other_template.tuesday THEN 'Tuesday'
      WHEN v_template.wednesday AND other_template.wednesday THEN 'Wednesday'
      WHEN v_template.thursday AND other_template.thursday THEN 'Thursday'
      WHEN v_template.friday AND other_template.friday THEN 'Friday'
      WHEN v_template.saturday AND other_template.saturday THEN 'Saturday'
      WHEN v_template.sunday AND other_template.sunday THEN 'Sunday'
    END AS conflicting_day
  INTO v_conflict
  FROM effective_assignments current_assignment
  JOIN public.route_templates other_template
    ON other_template.id <> v_template.id
   AND other_template.is_active = true
   AND other_template.driver_id = v_template.driver_id
  JOIN effective_assignments other_assignment
    ON other_assignment.route_template_id = other_template.id
  LEFT JOIN public.machines machine
    ON machine.id = other_assignment.machine_id
  LEFT JOIN public.clients client
    ON client.id = other_assignment.client_id
  WHERE current_assignment.route_template_id = v_template.id
    AND (
      (v_template.monday AND other_template.monday)
      OR (v_template.tuesday AND other_template.tuesday)
      OR (v_template.wednesday AND other_template.wednesday)
      OR (v_template.thursday AND other_template.thursday)
      OR (v_template.friday AND other_template.friday)
      OR (v_template.saturday AND other_template.saturday)
      OR (v_template.sunday AND other_template.sunday)
    )
    AND (
      (
        current_assignment.machine_id IS NOT NULL
        AND current_assignment.machine_id = other_assignment.machine_id
      )
      OR (
        current_assignment.machine_id IS NULL
        AND other_assignment.machine_id IS NULL
        AND current_assignment.client_id = other_assignment.client_id
      )
    )
  LIMIT 1;

  IF FOUND THEN
    IF v_conflict.machine_id IS NOT NULL THEN
      RAISE EXCEPTION
        '% is already assigned to this driver on % by route template "%".',
        COALESCE(v_conflict.machine_serial_number, 'This machine'),
        v_conflict.conflicting_day,
        v_conflict.conflicting_template_name;
    ELSE
      RAISE EXCEPTION
        '% is already assigned to this driver on % by route template "%".',
        COALESCE(v_conflict.client_name, 'This client'),
        v_conflict.conflicting_day,
        v_conflict.conflicting_template_name;
    END IF;
  END IF;
END;
$$;