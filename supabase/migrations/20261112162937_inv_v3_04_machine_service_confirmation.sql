
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

  -- Never create a confirmation-only record when historical
  -- quantity-based machine refill movements already exist.
  IF EXISTS (
    SELECT 1
    FROM public.inventory_movements m
    WHERE m.source_visit_id = v_visit_id
      AND m.movement_type = 'machine_refill'
  ) THEN
    RAISE EXCEPTION
      'This visit already contains legacy machine refill inventory movements';
  END IF;

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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
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
DECLARE
  v_visit_id text;
BEGIN
  SELECT refill.source_visit_id
  INTO v_visit_id
  FROM public.machine_refills refill
  WHERE refill.id = NEW.machine_refill_id;

  IF v_visit_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(btrim(v_visit_id), 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.machine_refills refill
      WHERE refill.id = NEW.machine_refill_id
        AND refill.outcome IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'Quantity-based refill items are not allowed for machine service confirmations';
    END IF;
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
  IF NEW.movement_type = 'machine_refill' THEN
    IF NEW.source_visit_id IS NULL
       OR length(btrim(NEW.source_visit_id)) = 0 THEN
      RAISE EXCEPTION
        'A service visit ID is required for machine refill movements';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(btrim(NEW.source_visit_id), 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.machine_refills refill
      WHERE refill.source_visit_id = btrim(NEW.source_visit_id)
        AND refill.outcome IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'Inventory movements are not allowed for machine service confirmations';
    END IF;
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
  v_user_id uuid := auth.uid();
  v_visit_id text := NULLIF(btrim(p_source_visit_id), '');
  v_existing public.machine_refills%ROWTYPE;
  v_refill_id uuid;
  v_input_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF v_visit_id IS NULL THEN
    RAISE EXCEPTION 'A service visit ID is required';
  END IF;

  IF p_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'A confirmation timestamp is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Machine refill items must be a JSON array';
  END IF;

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_deliveries d
    WHERE d.source_visit_id = v_visit_id
      AND d.client_id = p_client_id
      AND d.stop_id = p_stop_id
      AND d.machine_id = p_machine_id
      AND d.delivered_by = v_user_id
  ) THEN
    RAISE EXCEPTION
      'A synced client delivery confirmation is required before machine refill';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_visit_id, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.machine_refills
  WHERE source_visit_id = v_visit_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.outcome IS NOT NULL THEN
      RAISE EXCEPTION
        'This visit already has a machine service confirmation';
    END IF;

    IF v_existing.refilled_by IS DISTINCT FROM v_user_id
       OR v_existing.client_id IS DISTINCT FROM p_client_id
       OR v_existing.stop_id IS DISTINCT FROM p_stop_id
       OR v_existing.machine_id IS DISTINCT FROM p_machine_id
       OR v_existing.confirmed_at IS DISTINCT FROM p_confirmed_at THEN
      RAISE EXCEPTION
        'Existing legacy machine refill does not match this visit';
    END IF;

    v_input_count := jsonb_array_length(p_items);

    -- An empty payload is valid only when the historical
    -- refill also contains no items and no inventory movements.
    IF v_input_count = 0 THEN
      IF EXISTS (
        SELECT 1
        FROM public.machine_refill_items i
        WHERE i.machine_refill_id = v_existing.id
      ) OR EXISTS (
        SELECT 1
        FROM public.inventory_movements m
        WHERE m.source_visit_id = v_visit_id
          AND m.movement_type = 'machine_refill'
      ) THEN
        RAISE EXCEPTION
          'Empty legacy refill does not match historical inventory';
      END IF;

      RETURN v_existing.id;
    END IF;

    -- Every incoming product must be unique and valid.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS entry(value)
      WHERE jsonb_typeof(entry.value) <> 'object'
        OR NOT (entry.value ? 'product_id')
        OR entry.value ->> 'product_id' IS NULL
    ) THEN
      RAISE EXCEPTION 'Invalid legacy refill payload';
    END IF;

    -- Validate quantities using the same rules as the legacy RPC.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS entry(value)
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(
            (entry.value ->> 'issue_quantity')::numeric,
            0
          ) AS issue_qty,
          COALESCE(
            (entry.value ->> 'loose_quantity')::numeric,
            0
          ) AS loose_qty
      ) quantities
      WHERE quantities.issue_qty < 0
         OR quantities.loose_qty < 0
         OR trunc(quantities.issue_qty) <> quantities.issue_qty
    ) THEN
      RAISE EXCEPTION
        'Invalid legacy machine refill quantities';
    END IF;

    -- Preserve the legacy three-decimal-place precision limit.
    PERFORM public.assert_inventory_quantity_precision(
      COALESCE(
        (entry.value ->> 'issue_quantity')::numeric,
        0
      ),
      'Issue quantity'
    )
    FROM jsonb_array_elements(p_items) AS entry(value);

    PERFORM public.assert_inventory_quantity_precision(
      COALESCE(
        (entry.value ->> 'loose_quantity')::numeric,
        0
      ),
      'Loose quantity'
    )
    FROM jsonb_array_elements(p_items) AS entry(value);

    -- Compare the incoming product set against stored items.
    -- Invalid UUID/numeric casts fail the transaction safely.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS entry(value)
      GROUP BY (entry.value ->> 'product_id')::uuid
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Duplicate legacy refill products';
    END IF;

    IF (
      SELECT count(*)
      FROM public.machine_refill_items i
      WHERE i.machine_refill_id = v_existing.id
    ) <> v_input_count THEN
      RAISE EXCEPTION
        'Existing legacy refill item count differs';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS entry(value)
      LEFT JOIN public.machine_refill_items i
        ON i.machine_refill_id = v_existing.id
       AND i.product_id = (entry.value ->> 'product_id')::uuid
      WHERE i.id IS NULL
         OR i.entered_issue_quantity IS DISTINCT FROM
            COALESCE(
              (entry.value ->> 'issue_quantity')::numeric,
              0
            )
        OR i.entered_loose_quantity IS DISTINCT FROM
            COALESCE(
              (entry.value ->> 'loose_quantity')::numeric,
              0
            )
        OR i.zero_reason IS DISTINCT FROM
            NULLIF(btrim(entry.value ->> 'zero_reason'), '')
        OR i.zero_reason_note IS DISTINCT FROM
            NULLIF(btrim(entry.value ->> 'zero_reason_note'), '')
    ) THEN
      RAISE EXCEPTION
        'Existing legacy refill quantities or reasons differ';
    END IF;

    -- Verify movement links for positive quantities and
    -- ensure zero-quantity items have no movements.
    IF EXISTS (
      SELECT 1
      FROM public.machine_refill_items i
      LEFT JOIN public.inventory_movements m
        ON m.id = i.movement_id
      WHERE i.machine_refill_id = v_existing.id
        AND (
          (
            i.actual_quantity = 0
            AND i.movement_id IS NOT NULL
          )
          OR
          (
            i.actual_quantity > 0
            AND (
              m.id IS NULL
              OR m.movement_type <> 'machine_refill'
              OR m.product_id IS DISTINCT FROM i.product_id
              OR m.normalized_quantity IS DISTINCT FROM i.actual_quantity
              OR m.normalized_unit IS DISTINCT FROM i.normalized_unit
              OR m.entered_issue_quantity IS DISTINCT FROM i.entered_issue_quantity
              OR m.entered_loose_quantity IS DISTINCT FROM i.entered_loose_quantity
              OR m.base_unit_snapshot IS DISTINCT FROM i.base_unit_snapshot
              OR m.issue_unit_snapshot IS DISTINCT FROM i.issue_unit_snapshot
              OR m.units_per_issue_unit_snapshot IS DISTINCT FROM i.units_per_issue_unit_snapshot
              OR m.package_description_snapshot IS DISTINCT FROM i.package_description_snapshot
              OR m.source_visit_id IS DISTINCT FROM v_visit_id
              OR m.stop_id IS DISTINCT FROM p_stop_id
              OR m.machine_id IS DISTINCT FROM p_machine_id
              OR m.recorded_by IS DISTINCT FROM v_user_id
              OR m.occurred_at IS DISTINCT FROM p_confirmed_at
            )
          )
        )
    ) THEN
      RAISE EXCEPTION
        'Existing legacy inventory movements require reconciliation';
    END IF;

    -- Verify that every positive refill movement transferred
    -- inventory from the assigned driver to the machine.
    IF EXISTS (
      SELECT 1
      FROM public.machine_refill_items i
      JOIN public.inventory_movements m
        ON m.id = i.movement_id
      LEFT JOIN public.inventory_locations source_location
        ON source_location.id = m.from_location_id
      LEFT JOIN public.inventory_locations destination_location
        ON destination_location.id = m.to_location_id
      WHERE i.machine_refill_id = v_existing.id
        AND i.actual_quantity > 0
        AND (
          source_location.id IS NULL
          OR source_location.location_type <> 'driver'
          OR source_location.driver_id IS DISTINCT FROM v_user_id
          OR destination_location.id IS NULL
          OR destination_location.location_type <> 'machine'
          OR destination_location.machine_id IS DISTINCT FROM p_machine_id
        )
    ) THEN
      RAISE EXCEPTION
        'Existing legacy refill custody locations require reconciliation';
    END IF;

    -- Reject duplicate references to the same inventory movement.
    IF EXISTS (
      SELECT 1
      FROM public.machine_refill_items i
      WHERE i.movement_id IS NOT NULL
      GROUP BY i.movement_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION
        'Duplicate inventory movement references require reconciliation';
    END IF;

    -- Reject machine refill movements for this visit that are
    -- not linked to a corresponding historical refill item.
    IF EXISTS (
      SELECT 1
      FROM public.inventory_movements m
      WHERE m.source_visit_id = v_visit_id
        AND m.movement_type = 'machine_refill'
        AND NOT EXISTS (
          SELECT 1
          FROM public.machine_refill_items i
          WHERE i.machine_refill_id = v_existing.id
            AND i.movement_id = m.id
        )
    ) THEN
      RAISE EXCEPTION
        'Unlinked legacy machine refill movements require reconciliation';
    END IF;

    RETURN v_existing.id;
  END IF;

  -- No historical record exists: use the original logic.
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
