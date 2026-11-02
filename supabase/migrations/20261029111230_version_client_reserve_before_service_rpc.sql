-- Forward-only compatibility migration for existing BrewTracker mobile installations.

CREATE OR REPLACE FUNCTION public.save_client_reserve_before_service_v2(p_source_visit_id text, p_client_id uuid, p_stop_id uuid, p_machine_id uuid, p_recorded_at timestamp with time zone, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_snapshot_id uuid;
  v_snapshot_exists boolean := false;

  v_item jsonb;
  v_product_id uuid;

  v_issue_quantity numeric;
  v_loose_quantity numeric;

  v_base_unit text;
  v_issue_unit text;
  v_units_per_issue_unit numeric;
  v_package_description text;

  v_allows_loose_units boolean;
  v_allows_partial_base_unit boolean;

  -- Packaging values recorded by the mobile application.
  v_expected_packaging jsonb;
  v_expected_base_unit text;
  v_expected_issue_unit text;
  v_expected_units_per_issue_unit numeric;
  v_expected_allows_loose_units boolean;
  v_expected_allows_partial_base_unit boolean;

  v_normalized_quantity numeric;

BEGIN
  -- ========================================================
  -- Authentication and required input validation
  -- ========================================================

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF p_source_visit_id IS NULL
     OR LENGTH(TRIM(p_source_visit_id)) = 0 THEN
    RAISE EXCEPTION 'A service visit ID is required';
  END IF;

  IF p_recorded_at IS NULL THEN
    RAISE EXCEPTION 'A recorded timestamp is required';
  END IF;

  IF p_items IS NULL
     OR JSONB_TYPEOF(p_items) <> 'array'
     OR JSONB_ARRAY_LENGTH(p_items) = 0 THEN
    RAISE EXCEPTION
      'At least one client reserve quantity is required';
  END IF;

  -- ========================================================
  -- Reject missing or duplicate product IDs
  -- ========================================================

  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_items) item
    WHERE JSONB_TYPEOF(item) <> 'object'
       OR NULLIF(TRIM(item ->> 'product_id'), '') IS NULL
  ) THEN
    RAISE EXCEPTION
      'Every client reserve item must have a product ID';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM JSONB_ARRAY_ELEMENTS(p_items)
  ) <> (
    SELECT COUNT(DISTINCT item ->> 'product_id')
    FROM JSONB_ARRAY_ELEMENTS(p_items) item
  ) THEN
    RAISE EXCEPTION
      'A product cannot appear more than once in a client reserve audit';
  END IF;

  -- ========================================================
  -- Validate stop, route, driver, client and machine
  -- ========================================================

  IF NOT EXISTS (
    SELECT 1
    FROM public.stops s
    JOIN public.routes r
      ON r.id = s.route_id
    WHERE s.id = p_stop_id
      AND s.client_id = p_client_id
      AND s.machine_id = p_machine_id
      AND r.driver_id = v_user_id
  ) THEN
    RAISE EXCEPTION
      'The service stop is not assigned to the current driver';
  END IF;

  -- Machine must belong to the selected client.

  IF NOT EXISTS (
    SELECT 1
    FROM public.machines m
    WHERE m.id = p_machine_id
      AND m.client_id = p_client_id
  ) THEN
    RAISE EXCEPTION
      'The selected machine does not belong to this client';
  END IF;

  -- ========================================================
  -- Serialize synchronization for the same visit
  -- ========================================================

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'client_reserve_before_service:' || TRIM(p_source_visit_id),
      0
    )
  );

  -- ========================================================
  -- Identify existing snapshot
  -- ========================================================

  SELECT EXISTS (
    SELECT 1
    FROM public.client_reserve_snapshots
    WHERE source_visit_id = TRIM(p_source_visit_id)
      AND stage = 'before_service'
  )
  INTO v_snapshot_exists;

  -- ========================================================
  -- Create or obtain before-service snapshot
  -- ========================================================

  INSERT INTO public.client_reserve_snapshots (
    source_visit_id,
    client_id,
    stop_id,
    machine_id,
    stage,
    recorded_by,
    recorded_at
  )
  VALUES (
    TRIM(p_source_visit_id),
    p_client_id,
    p_stop_id,
    p_machine_id,
    'before_service',
    v_user_id,
    p_recorded_at
  )
  ON CONFLICT (
    source_visit_id,
    stage
  )
  DO UPDATE SET
    recorded_at = client_reserve_snapshots.recorded_at
  WHERE
    client_reserve_snapshots.recorded_by = v_user_id
    AND client_reserve_snapshots.client_id = EXCLUDED.client_id
    AND client_reserve_snapshots.stop_id = EXCLUDED.stop_id
    AND client_reserve_snapshots.machine_id = EXCLUDED.machine_id
    AND client_reserve_snapshots.recorded_at = EXCLUDED.recorded_at
  RETURNING id
  INTO v_snapshot_id;

  IF v_snapshot_id IS NULL THEN
    RAISE EXCEPTION
      'The existing inventory audit has different ownership, client, stop, machine, or timestamp. Existing data was preserved.';
  END IF;

  -- ========================================================
  -- Prevent retries from omitting saved products
  -- ========================================================

  IF EXISTS (
    SELECT 1
    FROM public.client_reserve_snapshot_items existing
    WHERE existing.snapshot_id = v_snapshot_id
      AND NOT EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS(p_items) supplied
        WHERE supplied ->> 'product_id' = existing.product_id::text
      )
  ) THEN
    RAISE EXCEPTION
      'Inventory audit retry is missing previously saved products. Existing quantities were preserved.';
  END IF;

  -- ========================================================
  -- Prevent retries from adding products
  -- ========================================================

  IF v_snapshot_exists AND EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS supplied(value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.client_reserve_snapshot_items existing
      WHERE existing.snapshot_id = v_snapshot_id
        AND existing.product_id::text =
          supplied.value ->> 'product_id'
    )
  ) THEN
    RAISE EXCEPTION
      'Inventory audit retry contains products not present in the original snapshot. Existing data was preserved.';
  END IF;

  -- ========================================================
  -- Reject duplicate products in the request
  -- ========================================================

  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS item(value)
    GROUP BY item.value ->> 'product_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Inventory audit contains duplicate product IDs.';
  END IF;

  -- ========================================================
  -- Process inventory items
  -- ========================================================

  FOR v_item IN
    SELECT value
    FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP

    -- ------------------------------------------------------
    -- Parse quantities
    -- ------------------------------------------------------

    BEGIN
      v_product_id :=
        (v_item ->> 'product_id')::uuid;

      v_issue_quantity :=
        COALESCE(
          (v_item ->> 'issue_quantity')::numeric,
          0
        );

      v_loose_quantity :=
        COALESCE(
          (v_item ->> 'loose_quantity')::numeric,
          0
        );

    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION
          'Invalid client reserve item';
    END;

    IF v_issue_quantity < 0
       OR v_loose_quantity < 0 THEN
      RAISE EXCEPTION
        'Client reserve quantities cannot be negative';
    END IF;

    -- ======================================================
    -- NEW: Validate entered quantity precision
    -- ======================================================

    PERFORM public.assert_inventory_quantity_precision(
      v_issue_quantity,
      'Issue quantity'
    );

    PERFORM public.assert_inventory_quantity_precision(
      v_loose_quantity,
      'Loose quantity'
    );

    -- ------------------------------------------------------
    -- Product must be configured for this client
    -- ------------------------------------------------------

    SELECT
      ip.base_unit,
      ip.issue_unit,
      ip.units_per_issue_unit,
      ip.package_description,
      ip.allows_loose_units,
      ip.allows_partial_base_unit
    INTO
      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description,
      v_allows_loose_units,
      v_allows_partial_base_unit
    FROM public.inventory_products ip
    JOIN public.client_inventory_products cip
      ON cip.product_id = ip.id
    WHERE ip.id = v_product_id
      AND ip.is_active = true
      AND cip.client_id = p_client_id
      AND cip.is_active = true
    FOR SHARE OF ip, cip;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Product % is not configured for this client',
        v_product_id;
    END IF;

    -- ------------------------------------------------------
    -- Validate packaging recorded by the mobile audit
    -- ------------------------------------------------------

    v_expected_packaging :=
      v_item -> 'expected_packaging';

    IF v_expected_packaging IS NULL
       OR JSONB_TYPEOF(v_expected_packaging) <> 'object'
       OR NOT (
         v_expected_packaging ?& ARRAY[
           'base_unit',
           'issue_unit',
           'units_per_issue_unit',
           'allows_loose_units',
           'allows_partial_base_unit'
         ]
       ) THEN
      RAISE EXCEPTION
        'Original packaging information is required for product %',
        v_product_id;
    END IF;

    BEGIN
      v_expected_base_unit :=
        v_expected_packaging ->> 'base_unit';

      v_expected_issue_unit :=
        v_expected_packaging ->> 'issue_unit';

      v_expected_units_per_issue_unit :=
        (v_expected_packaging ->> 'units_per_issue_unit')::numeric;

      v_expected_allows_loose_units :=
        (v_expected_packaging ->> 'allows_loose_units')::boolean;

      v_expected_allows_partial_base_unit :=
        (v_expected_packaging ->> 'allows_partial_base_unit')::boolean;

    EXCEPTION
      WHEN invalid_text_representation
        OR numeric_value_out_of_range THEN
        RAISE EXCEPTION
          'Invalid original packaging information for product %',
          v_product_id;
    END;

    IF NULLIF(TRIM(v_expected_base_unit), '') IS NULL
       OR NULLIF(TRIM(v_expected_issue_unit), '') IS NULL
       OR v_expected_units_per_issue_unit IS NULL
       OR v_expected_units_per_issue_unit <= 0
       OR v_expected_allows_loose_units IS NULL
       OR v_expected_allows_partial_base_unit IS NULL THEN
      RAISE EXCEPTION
        'Incomplete original packaging information for product %',
        v_product_id;
    END IF;

    IF v_expected_base_unit IS DISTINCT FROM v_base_unit
       OR v_expected_issue_unit IS DISTINCT FROM v_issue_unit
       OR v_expected_units_per_issue_unit
            IS DISTINCT FROM v_units_per_issue_unit
       OR v_expected_allows_loose_units
            IS DISTINCT FROM v_allows_loose_units
       OR v_expected_allows_partial_base_unit
            IS DISTINCT FROM v_allows_partial_base_unit THEN
      RAISE EXCEPTION
        'Product % packaging changed since the inventory audit was recorded. Contact your manager before retrying.',
        v_product_id;
    END IF;

    -- ------------------------------------------------------
    -- Issue quantities must be whole packages
    -- ------------------------------------------------------

    IF TRUNC(v_issue_quantity)
       <> v_issue_quantity THEN
      RAISE EXCEPTION
        'Issue quantity must be a whole number';
    END IF;

    -- ------------------------------------------------------
    -- Validate loose-unit rules
    -- ------------------------------------------------------

    IF v_loose_quantity > 0
       AND NOT v_allows_loose_units THEN
      RAISE EXCEPTION
        'Loose units are not allowed for product %',
        v_product_id;
    END IF;

    IF NOT v_allows_partial_base_unit
       AND TRUNC(v_loose_quantity)
           <> v_loose_quantity THEN
      RAISE EXCEPTION
        'Partial base units are not allowed for product %',
        v_product_id;
    END IF;

    -- ======================================================
    -- Calculate normalized quantity
    -- ======================================================

    v_normalized_quantity :=
      (
        v_issue_quantity
        * v_units_per_issue_unit
      )
      + v_loose_quantity;

    -- ======================================================
    -- NEW: Reject normalized quantity rounding
    -- ======================================================

    PERFORM public.assert_inventory_quantity_precision(
      v_normalized_quantity,
      'Normalized reserve quantity'
    );

    -- ------------------------------------------------------
    -- Preserve retry conflict protection
    -- ------------------------------------------------------

    IF EXISTS (
      SELECT 1
      FROM public.client_reserve_snapshot_items existing
      WHERE existing.snapshot_id = v_snapshot_id
        AND existing.product_id = v_product_id
        AND (
          existing.normalized_quantity
            IS DISTINCT FROM v_normalized_quantity::numeric(12,3)
          OR existing.normalized_unit
            IS DISTINCT FROM v_base_unit
          OR existing.entered_issue_quantity
            IS DISTINCT FROM v_issue_quantity::numeric(12,3)
          OR existing.entered_loose_quantity
            IS DISTINCT FROM v_loose_quantity::numeric(12,3)
          OR existing.base_unit_snapshot
            IS DISTINCT FROM v_base_unit
          OR existing.issue_unit_snapshot
            IS DISTINCT FROM v_issue_unit
          OR existing.units_per_issue_unit_snapshot
            IS DISTINCT FROM v_units_per_issue_unit
        )
    ) THEN
      RAISE EXCEPTION
        'Inventory audit retry conflicts with previously saved quantities or packaging. Existing data was preserved.';
    END IF;

    -- ------------------------------------------------------
    -- Save snapshot item
    -- ------------------------------------------------------

    INSERT INTO public.client_reserve_snapshot_items (
      snapshot_id,
      product_id,
      normalized_quantity,
      normalized_unit,
      entered_issue_quantity,
      entered_loose_quantity,
      base_unit_snapshot,
      issue_unit_snapshot,
      units_per_issue_unit_snapshot,
      package_description_snapshot
    )
    VALUES (
      v_snapshot_id,
      v_product_id,
      v_normalized_quantity,
      v_base_unit,
      v_issue_quantity,
      v_loose_quantity,
      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description
    )
    ON CONFLICT (
      snapshot_id,
      product_id
    )
    DO NOTHING;

  END LOOP;

  RETURN v_snapshot_id;
END;
$function$
;


-- Legacy entry point. New submissions must provide expected_packaging.
-- Older clients may only replay an existing, identical snapshot.
CREATE OR REPLACE FUNCTION public.save_client_reserve_before_service(
  p_source_visit_id text,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_recorded_at timestamptz,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $legacy$
DECLARE
  v_user_id uuid := auth.uid();
  v_snapshot public.client_reserve_snapshots%ROWTYPE;
  v_item jsonb;
  v_product_id uuid;
  v_issue_quantity numeric;
  v_loose_quantity numeric;
  v_saved public.client_reserve_snapshot_items%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF p_source_visit_id IS NULL OR btrim(p_source_visit_id) = ''
     OR p_recorded_at IS NULL
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A valid service visit, timestamp and nonempty inventory list are required';
  END IF;

  -- Any payload with packaging metadata uses the strict V2 implementation.
  -- V2 also rejects incomplete/mixed packaging payloads.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS e(value)
    WHERE e.value ? 'expected_packaging'
  ) THEN
    RETURN public.save_client_reserve_before_service_v2(
      p_source_visit_id, p_client_id, p_stop_id,
      p_machine_id, p_recorded_at, p_items
    );
  END IF;

  -- Legacy payloads must not create new snapshots. Serialize with V2.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('client_reserve_before_service:' || btrim(p_source_visit_id), 0)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.stops s
    JOIN public.routes r ON r.id = s.route_id
    WHERE s.id = p_stop_id AND s.client_id = p_client_id
      AND s.machine_id = p_machine_id AND r.driver_id = v_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.machines m
    WHERE m.id = p_machine_id AND m.client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'The service stop or machine is not assigned to the current driver and client';
  END IF;

  SELECT * INTO v_snapshot
  FROM public.client_reserve_snapshots
  WHERE source_visit_id = btrim(p_source_visit_id)
    AND stage = 'before_service';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This app version cannot submit a new inventory audit. Update BrewTracker and retry.';
  END IF;

  IF v_snapshot.recorded_by IS DISTINCT FROM v_user_id
     OR v_snapshot.client_id IS DISTINCT FROM p_client_id
     OR v_snapshot.stop_id IS DISTINCT FROM p_stop_id
     OR v_snapshot.machine_id IS DISTINCT FROM p_machine_id
     OR v_snapshot.recorded_at IS DISTINCT FROM p_recorded_at THEN
    RAISE EXCEPTION 'Inventory audit retry metadata conflicts with the saved snapshot. Existing data was preserved.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Invalid client reserve item';
    END IF;

    BEGIN
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_issue_quantity := coalesce((v_item ->> 'issue_quantity')::numeric, 0);
      v_loose_quantity := coalesce((v_item ->> 'loose_quantity')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid client reserve item';
    END;

    IF v_product_id IS NULL OR v_issue_quantity < 0 OR v_loose_quantity < 0
       OR trunc(v_issue_quantity) <> v_issue_quantity THEN
      RAISE EXCEPTION 'Invalid client reserve quantities';
    END IF;

    PERFORM public.assert_inventory_quantity_precision(v_issue_quantity, 'Issue quantity');
    PERFORM public.assert_inventory_quantity_precision(v_loose_quantity, 'Loose quantity');

    SELECT * INTO v_saved
    FROM public.client_reserve_snapshot_items
    WHERE snapshot_id = v_snapshot.id AND product_id = v_product_id;

    IF NOT FOUND
       OR v_saved.entered_issue_quantity IS DISTINCT FROM v_issue_quantity
       OR v_saved.entered_loose_quantity IS DISTINCT FROM v_loose_quantity THEN
      RAISE EXCEPTION 'Legacy inventory retry conflicts with the saved snapshot. Existing data was preserved.';
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Count alone is insufficient without duplicate detection.
  IF (SELECT count(DISTINCT e.value ->> 'product_id')
      FROM jsonb_array_elements(p_items) e(value)) <> v_count
     OR (SELECT count(*) FROM public.client_reserve_snapshot_items
         WHERE snapshot_id = v_snapshot.id) <> v_count THEN
    RAISE EXCEPTION 'Legacy inventory retry product list differs from the saved snapshot. Existing data was preserved.';
  END IF;

  RETURN v_snapshot.id;
END;
$legacy$;

-- Match normal Supabase RPC execution permissions while preventing anonymous access.
REVOKE ALL ON FUNCTION public.save_client_reserve_before_service_v2(text, uuid, uuid, uuid, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_reserve_before_service(text, uuid, uuid, uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_client_reserve_before_service_v2(text, uuid, uuid, uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_reserve_before_service(text, uuid, uuid, uuid, timestamptz, jsonb) TO authenticated;
