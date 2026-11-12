
-- INV-V3-04: Machine Service Confirmation
--
-- Preserve historical quantity-based machine refill records.
-- New confirmations store an outcome and optional reason.
-- No inventory movements are created by these schema changes.

ALTER TABLE public.machine_refills
  ADD COLUMN outcome text,
  ADD COLUMN reason text;

-- Only the three approved outcomes are accepted.
-- NULL remains valid for historical machine refill records.

ALTER TABLE public.machine_refills
  ADD CONSTRAINT machine_refills_outcome_check
  CHECK (
    outcome IS NULL
    OR outcome IN (
      'refilled',
      'not_needed',
      'unable_to_refill'
    )
  );

-- Require a meaningful reason when a refill cannot be completed.
-- Other outcomes must not contain a reason.

ALTER TABLE public.machine_refills
  ADD CONSTRAINT machine_refills_reason_check
  CHECK (
    (outcome IS NULL AND reason IS NULL)
    OR
    (
      outcome IN ('refilled', 'not_needed')
      AND reason IS NULL
    )
    OR
    (
      outcome = 'unable_to_refill'
      AND reason IS NOT NULL
      AND length(trim(reason)) > 0
    )
  );

COMMENT ON COLUMN public.machine_refills.outcome IS
  'INV-V3-04 machine service outcome. NULL for legacy records.';

COMMENT ON COLUMN public.machine_refills.reason IS
  'Required when the driver is unable to refill the machine.';


-- ==========================================================
-- INV-V3-04: Save Machine Service Confirmation
-- ==========================================================

CREATE OR REPLACE FUNCTION public.save_machine_service_confirmation(
  p_source_visit_id text,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_confirmed_at timestamptz,
  p_outcome text,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_visit_id text := NULLIF(btrim(p_source_visit_id), '');
  v_reason text := NULLIF(btrim(p_reason), '');

  v_existing public.machine_refills%ROWTYPE;
  v_confirmation_id uuid;
BEGIN
  -- Authentication and input validation.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF v_visit_id IS NULL THEN
    RAISE EXCEPTION 'A service visit ID is required';
  END IF;

  IF p_client_id IS NULL
     OR p_stop_id IS NULL
     OR p_machine_id IS NULL THEN
    RAISE EXCEPTION 'Client, stop and machine IDs are required';
  END IF;

  IF p_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'A confirmation timestamp is required';
  END IF;

  IF p_outcome IS DISTINCT FROM 'refilled'
   AND p_outcome IS DISTINCT FROM 'not_needed'
   AND p_outcome IS DISTINCT FROM 'unable_to_refill' THEN
    RAISE EXCEPTION 'Invalid machine service outcome';
  END IF;

  IF p_outcome = 'unable_to_refill' THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required when unable to refill';
    END IF;
  ELSIF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'A reason is only allowed when unable to refill';
  END IF;

  -- Validate stop assignment.
  IF NOT EXISTS (
    SELECT 1
    FROM public.stops s
    JOIN public.routes r ON r.id = s.route_id
    WHERE s.id = p_stop_id
      AND s.client_id = p_client_id
      AND s.machine_id = p_machine_id
      AND r.driver_id = v_user_id
  ) THEN
    RAISE EXCEPTION
      'The service stop is not assigned to the current driver';
  END IF;

  -- Require the completed Client Reserve After snapshot.
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_reserve_snapshots snapshot
    WHERE snapshot.source_visit_id = v_visit_id
      AND snapshot.client_id = p_client_id
      AND snapshot.stop_id = p_stop_id
      AND snapshot.machine_id = p_machine_id
      AND snapshot.stage = 'after_service'
      AND snapshot.recorded_by = v_user_id
  ) THEN
    RAISE EXCEPTION
      'Client reserve after delivery must be synced before machine service confirmation';
  END IF;

  -- Serialize concurrent attempts for this service visit.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_visit_id, 0)
  );

  -- Check for an existing confirmation or legacy refill.
  SELECT *
  INTO v_existing
  FROM public.machine_refills
  WHERE source_visit_id = v_visit_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.refilled_by IS DISTINCT FROM v_user_id
       OR v_existing.client_id IS DISTINCT FROM p_client_id
       OR v_existing.stop_id IS DISTINCT FROM p_stop_id
       OR v_existing.machine_id IS DISTINCT FROM p_machine_id THEN
      RAISE EXCEPTION
        'An existing machine service record belongs to a different visit or driver';
    END IF;

    -- Do not reinterpret historical quantity-based records.
    IF v_existing.outcome IS NULL
       OR EXISTS (
         SELECT 1
         FROM public.machine_refill_items item
         WHERE item.machine_refill_id = v_existing.id
       ) THEN
      RAISE EXCEPTION
        'An existing legacy machine refill cannot be replaced by a service confirmation';
    END IF;

    -- Identical retry returns the original ID.
    IF v_existing.outcome = p_outcome
       AND v_existing.reason IS NOT DISTINCT FROM v_reason
       AND v_existing.confirmed_at = p_confirmed_at THEN
      RETURN v_existing.id;
    END IF;

    RAISE EXCEPTION
      'A different machine service confirmation already exists for this visit';
  END IF;

  -- Confirmation only: no items and no inventory movements.
  INSERT INTO public.machine_refills (
    source_visit_id,
    client_id,
    stop_id,
    machine_id,
    refilled_by,
    confirmed_at,
    outcome,
    reason
  )
  VALUES (
    v_visit_id,
    p_client_id,
    p_stop_id,
    p_machine_id,
    v_user_id,
    p_confirmed_at,
    p_outcome,
    v_reason
  )
  RETURNING id INTO v_confirmation_id;

  RETURN v_confirmation_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_machine_service_confirmation(
  text, uuid, uuid, uuid, timestamptz, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.save_machine_service_confirmation(
  text, uuid, uuid, uuid, timestamptz, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.save_machine_service_confirmation(
  text, uuid, uuid, uuid, timestamptz, text, text
) TO authenticated;


-- ==========================================================
-- INV-V3-04: Protect confirmation-only service records
-- ==========================================================

CREATE OR REPLACE FUNCTION public.guard_machine_service_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.outcome IS NOT NULL THEN
    RAISE EXCEPTION
      'Machine service confirmations cannot be deleted';
  END IF;
  -- A confirmation-only record cannot be converted back
  -- into a quantity-based machine refill.
  IF TG_OP = 'UPDATE' AND OLD.outcome IS NOT NULL THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION
        'Machine service confirmations cannot be modified';
    END IF;
  END IF;

  -- Prevent converting historical quantity-based records
  -- into confirmation-only records through an update.
  IF TG_OP = 'UPDATE'
     AND OLD.outcome IS NULL
     AND NEW.outcome IS NOT NULL THEN
    RAISE EXCEPTION
      'Legacy machine refills cannot be converted into service confirmations';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_machine_service_confirmation
BEFORE UPDATE OR DELETE ON public.machine_refills
FOR EACH ROW
EXECUTE FUNCTION public.guard_machine_service_confirmation();


-- Prevent adding quantity-based items to new confirmations.

CREATE OR REPLACE FUNCTION public.guard_machine_service_confirmation_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.machine_refills refill
    WHERE refill.id = NEW.machine_refill_id
      AND refill.outcome IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Quantity-based refill items are not allowed for machine service confirmations';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_machine_service_confirmation_items
BEFORE INSERT OR UPDATE ON public.machine_refill_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_machine_service_confirmation_items();


-- Prevent legacy machine refill movements for visits
-- already recorded as confirmation-only.

CREATE OR REPLACE FUNCTION public.guard_machine_service_confirmation_movements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.movement_type = 'machine_refill'
     AND EXISTS (
       SELECT 1
       FROM public.machine_refills refill
       WHERE refill.source_visit_id = NEW.source_visit_id
         AND refill.outcome IS NOT NULL
     ) THEN
    RAISE EXCEPTION
      'Inventory movements are not allowed for machine service confirmations';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_machine_service_confirmation_movements
BEFORE INSERT OR UPDATE ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.guard_machine_service_confirmation_movements();


-- ==========================================================
-- INV-V3-04: Serialize machine service record creation
-- ==========================================================

CREATE OR REPLACE FUNCTION public.lock_machine_service_visit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(btrim(NEW.source_visit_id), 0)
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER lock_machine_service_visit
BEFORE INSERT ON public.machine_refills
FOR EACH ROW
EXECUTE FUNCTION public.lock_machine_service_visit();

-- ==========================================================
-- INV-V3-04: Legacy machine refill RPC compatibility
-- ==========================================================

-- Preserve the existing implementation for older clients.
ALTER FUNCTION public.save_machine_refill(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
)
RENAME TO save_machine_refill_legacy_impl;


-- Prevent API roles from directly invoking the internal RPC.
REVOKE ALL ON FUNCTION public.save_machine_refill_legacy_impl(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
) FROM PUBLIC, anon, authenticated;


-- Recreate the original RPC signature as a guarded wrapper.
CREATE FUNCTION public.save_machine_refill(
  p_source_visit_id text,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_confirmed_at timestamptz,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_visit_id text;
  v_refill_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  v_visit_id := btrim(p_source_visit_id);

  IF v_visit_id IS NULL OR v_visit_id = '' THEN
    RAISE EXCEPTION 'A service visit ID is required';
  END IF;

  -- Use the same advisory lock as the new confirmation RPC.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_visit_id, 0)
  );

  -- A confirmation-only visit cannot be processed by
  -- the legacy quantity-based refill workflow.
  IF EXISTS (
    SELECT 1
    FROM public.machine_refills
    WHERE source_visit_id = v_visit_id
      AND outcome IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'This visit already has a machine service confirmation';
  END IF;

  -- Preserve the existing validation and inventory logic.
  SELECT public.save_machine_refill_legacy_impl(
    v_visit_id,
    p_client_id,
    p_stop_id,
    p_machine_id,
    p_confirmed_at,
    p_items
  )
  INTO v_refill_id;

  RETURN v_refill_id;
END;
$function$;


-- Restrict the public API entry point.
REVOKE ALL ON FUNCTION public.save_machine_refill(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_machine_refill(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
) TO authenticated;
