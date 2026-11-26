-- INV-V3-05: Shared multi-machine stop synchronization.
--
-- Lock ordering: visit advisory lock, then stop advisory lock.
-- This protects against different visit IDs referencing the same stop.

CREATE OR REPLACE FUNCTION public.lock_multi_machine_inventory_stop(
  p_source_visit_id text,
  p_stop_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_visit_id text := NULLIF(btrim(p_source_visit_id), '');
  v_machine_id uuid;
  v_route_id uuid;
  v_status public.stop_status;
BEGIN
  IF v_visit_id IS NULL OR p_stop_id IS NULL THEN
    RAISE EXCEPTION 'Service visit and stop IDs are required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_visit_id, 0)
  );

  SELECT s.machine_id, s.status
  INTO v_machine_id, v_status
  FROM public.stops s
  WHERE s.id = p_stop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service stop not found';
  END IF;

  IF v_machine_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('multi_machine_stop:' || p_stop_id::text, 0)
    );

    -- Resolve the parent route before acquiring row locks.
    SELECT s.route_id
    INTO v_route_id
    FROM public.stops s
    WHERE s.id = p_stop_id;

    -- Match route-management lock ordering: route before stop.
    PERFORM 1
    FROM public.routes r
    WHERE r.id = v_route_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service route not found';
    END IF;

    -- Prevent completion while inventory persistence is active.
    SELECT s.status
    INTO v_status
    FROM public.stops s
    WHERE s.id = p_stop_id
    FOR SHARE;

    IF v_status = 'completed' THEN
      RAISE EXCEPTION
        'Inventory cannot be modified after multi-machine visit completion';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.lock_multi_machine_inventory_stop(
  text, uuid
) FROM PUBLIC, anon, authenticated;

-- INV-V3-05: Multi-Machine Service Visit Persistence
--
-- Allow one machine service confirmation per machine within
-- a shared service visit.
--
-- Existing single-machine visits remain supported.

-- INV-V3-05: One Drink Count per machine per service visit.
-- Preserve the historical migration and replace its uniqueness rule here.
DROP INDEX public.machine_meter_readings_source_visit_id_idx;

CREATE UNIQUE INDEX machine_meter_readings_visit_machine_unique_idx
  ON public.machine_meter_readings (source_visit_id, machine_id);

ALTER TABLE public.machine_refills
  DROP CONSTRAINT machine_refills_source_visit_id_key;

ALTER TABLE public.machine_refills
  ADD CONSTRAINT machine_refills_visit_machine_unique
  UNIQUE (source_visit_id, machine_id);

-- Shared client reserve snapshots belong to the client visit,
-- not to an individual machine.
--
-- Single-machine visits continue storing their machine_id.

ALTER TABLE public.client_reserve_snapshots
  ALTER COLUMN machine_id DROP NOT NULL;

-- A multi-machine stop has one shared client delivery.
-- Its machine_id is NULL; machine-specific confirmations
-- remain stored separately in machine_refills.

ALTER TABLE public.client_deliveries
  ALTER COLUMN machine_id DROP NOT NULL;
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
      AND r.driver_id = v_user_id
      AND (
        (
          p_machine_id IS NOT NULL
          AND s.machine_id = p_machine_id
          AND EXISTS (
            SELECT 1
            FROM public.machines m
            WHERE m.id = p_machine_id
              AND m.client_id = p_client_id
          )
        )
        OR
        (
          p_machine_id IS NULL
          AND s.machine_id IS NULL
          AND (
            SELECT COUNT(*)
            FROM public.stop_machines sm
            JOIN public.machines m
              ON m.id = sm.machine_id
            WHERE sm.stop_id = s.id
              AND m.client_id = p_client_id
          ) >= 2
        )
      )
  ) THEN
    RAISE EXCEPTION
      'The service stop or machine assignments are invalid for the current driver';
  END IF;

  -- ========================================================
  -- Serialize synchronization for the same visit
  -- ========================================================

  -- Serialize inventory writes by visit and multi-machine stop.
  PERFORM public.lock_multi_machine_inventory_stop(
    p_source_visit_id,
    p_stop_id
  );

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
    AND client_reserve_snapshots.machine_id IS NOT DISTINCT FROM EXCLUDED.machine_id
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
CREATE OR REPLACE FUNCTION public.save_client_delivery(p_source_visit_id text, p_client_id uuid, p_stop_id uuid, p_machine_id uuid, p_confirmed_at timestamp with time zone, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();

  v_snapshot_id uuid;
  v_delivery_id uuid;

  v_driver_location_id uuid;
  v_client_location_id uuid;

  v_item jsonb;

  v_product_id uuid;

  v_issue_quantity numeric;
  v_loose_quantity numeric;

  v_reserve_before numeric;
  v_par_level numeric;
  v_recommended_quantity numeric;
  v_actual_quantity numeric;

  v_base_unit text;
  v_issue_unit text;
  v_units_per_issue_unit numeric;
  v_package_description text;

  v_allows_loose_units boolean;
  v_allows_partial_base_unit boolean;

  v_movement_id uuid;

  -- Existing delivery retry handling
  v_existing_delivery_id uuid;

  -- Number of submitted and stored delivery products
  v_submitted_item_count integer;
  v_existing_item_count integer;
begin

  ----------------------------------------------------------
  -- Authentication
  ----------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_source_visit_id is null
     or length(trim(p_source_visit_id)) = 0 then
    raise exception 'A service visit ID is required';
  end if;

  if p_confirmed_at is null then
    raise exception 'A confirmation timestamp is required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Delivery items must be a JSON array';
  end if;

    ----------------------------------------------------------
  -- Serialize delivery requests for the same visit.
  --
  -- The lock is released automatically when the
  -- transaction completes or rolls back.
  ----------------------------------------------------------

  -- Serialize inventory writes by visit and multi-machine stop.
  perform public.lock_multi_machine_inventory_stop(
    p_source_visit_id,
    p_stop_id
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'client_delivery:' || trim(p_source_visit_id),
      0
    )
  );

  ----------------------------------------------------------
  -- Validate current stop
  ----------------------------------------------------------

  if not exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.id = p_stop_id
      and s.client_id = p_client_id
      and r.driver_id = v_user_id
      and (
        (
          p_machine_id is not null
          and s.machine_id = p_machine_id
          and exists (
            select 1
            from public.machines m
            where m.id = p_machine_id
              and m.client_id = p_client_id
          )
        )
        or
        (
          p_machine_id is null
          and s.machine_id is null
          and (
            select count(*)
            from public.stop_machines sm
            join public.machines m
              on m.id = sm.machine_id
            where sm.stop_id = s.id
              and m.client_id = p_client_id
          ) >= 2
        )
      )
  ) then
    raise exception
      'The service stop is not assigned to the current driver';
  end if;


  ----------------------------------------------------------
  -- FLOW-16 before-service reserve is mandatory
  ----------------------------------------------------------

  select snapshot.id
  into v_snapshot_id
  from public.client_reserve_snapshots snapshot
  where snapshot.source_visit_id =
      trim(p_source_visit_id)
    and snapshot.stage = 'before_service'
    and snapshot.client_id = p_client_id
    and snapshot.stop_id = p_stop_id
    and snapshot.machine_id is not distinct from p_machine_id
    and snapshot.recorded_by = v_user_id;


  if v_snapshot_id is null then
    raise exception
      'A synced client reserve count is required before delivery';
  end if;

    ----------------------------------------------------------
  -- Find an existing delivery for this service visit.
  --
  -- The advisory lock prevents concurrent requests
  -- using this function from processing the same visit.
  ----------------------------------------------------------

  select delivery.id
  into v_existing_delivery_id
  from public.client_deliveries delivery
  where delivery.source_visit_id = trim(p_source_visit_id)
    and delivery.client_id = p_client_id
    and delivery.stop_id = p_stop_id
    and delivery.machine_id is not distinct from p_machine_id
    and delivery.reserve_snapshot_id = v_snapshot_id
    and delivery.delivered_by = v_user_id;

      ----------------------------------------------------------
  -- Reject an existing delivery with mismatched ownership
  -- or service visit details.
  ----------------------------------------------------------

  if v_existing_delivery_id is null
     and exists (
       select 1
       from public.client_deliveries delivery
       where delivery.source_visit_id = trim(p_source_visit_id)
     )
  then
    raise exception
      'An existing delivery has different service visit details';
  end if;

    ----------------------------------------------------------
  -- Validate submitted delivery product IDs.
  -- Reject duplicates before comparing an existing delivery.
  ----------------------------------------------------------

  select count(*)
  into v_submitted_item_count
  from jsonb_array_elements(p_items);

    ----------------------------------------------------------
  -- Require at least one delivery item.
  -- Zero quantities are valid, but an empty list is not.
  ----------------------------------------------------------

    ----------------------------------------------------------
  -- Allow empty delivery only when no products need stock.
  -- Zero quantities remain valid for required products.
  ----------------------------------------------------------

  if v_submitted_item_count = 0 then
    if exists (
      select 1
      from public.client_reserve_snapshot_items snapshot_item
      join public.client_inventory_products cip
        on cip.product_id = snapshot_item.product_id
       and cip.client_id = p_client_id
       and cip.is_active = true
      where snapshot_item.snapshot_id = v_snapshot_id
        and cip.par_level is not null
        and cip.par_level > snapshot_item.normalized_quantity
    ) then
      raise exception
        'Delivery confirmation is required for products below par level';
    end if;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
       or (item ->> 'product_id') is null
       or (item ->> 'product_id') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) then
    raise exception 'Invalid delivery product ID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    group by (item ->> 'product_id')::uuid
    having count(*) > 1
  ) then
    raise exception
      'A product cannot appear more than once';
  end if;

    ----------------------------------------------------------
  -- Validate quantities before accepting an existing retry.
  ----------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      if (v_item ->> 'issue_quantity') is null
         or (v_item ->> 'loose_quantity') is null then
        raise exception 'Missing delivery quantity';
      end if;

      v_issue_quantity :=
        (v_item ->> 'issue_quantity')::numeric;

      v_loose_quantity :=
        (v_item ->> 'loose_quantity')::numeric;

    exception
      when invalid_text_representation
        or numeric_value_out_of_range then
        raise exception 'Invalid delivery quantity';
    end;

    if v_issue_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
       or v_loose_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
       or v_issue_quantity < 0
       or v_loose_quantity < 0
       or trunc(v_issue_quantity) <> v_issue_quantity then
      raise exception 'Invalid delivery quantity';
    end if;

    perform public.assert_inventory_quantity_precision(
      v_issue_quantity,
      'Issue quantity'
    );

    perform public.assert_inventory_quantity_precision(
      v_loose_quantity,
      'Loose quantity'
    );
  end loop;

    ----------------------------------------------------------
  -- Idempotent retry of an existing delivery.
  ----------------------------------------------------------

  if v_existing_delivery_id is not null then
  
      --------------------------------------------------------
    -- Preserve the original delivery confirmation.
    --------------------------------------------------------

    if not exists (
      select 1
      from public.client_deliveries delivery
      where delivery.id = v_existing_delivery_id
        and delivery.confirmed_at = p_confirmed_at
    ) then
      raise exception
        'Existing delivery has a different confirmation timestamp';
    end if;

    select count(*)
    into v_existing_item_count
    from public.client_delivery_items
    where delivery_id = v_existing_delivery_id;

    if v_existing_item_count <> v_submitted_item_count then
      raise exception
        'Existing delivery has different products or quantities';
    end if;

        --------------------------------------------------------
    -- Ensure positive deliveries have inventory movements.
    -- Zero-quantity items legitimately have no movement.
    --------------------------------------------------------

    if exists (
      select 1
      from public.client_delivery_items item
      where item.delivery_id = v_existing_delivery_id
        and item.actual_quantity > 0
        and item.movement_id is null
    ) then
      raise exception
        'Existing delivery has incomplete inventory movements';
    end if;

        --------------------------------------------------------
    -- Verify that saved movements match their delivery items.
    --------------------------------------------------------

    if exists (
      select 1
      from public.client_delivery_items item
      left join public.inventory_movements movement
        on movement.id = item.movement_id
      where item.delivery_id = v_existing_delivery_id
        and item.actual_quantity > 0
        and (
          movement.id is null
          or movement.movement_type is distinct from 'client_delivery'
          or movement.product_id is distinct from item.product_id
          or movement.normalized_quantity is distinct from item.actual_quantity
          or movement.normalized_unit is distinct from item.normalized_unit
          or movement.source_visit_id is distinct from
               trim(p_source_visit_id)
          or movement.stop_id is distinct from p_stop_id
          or movement.machine_id is distinct from p_machine_id
        )
    ) then
      raise exception
        'Existing delivery has inconsistent inventory movements';
    end if;

        --------------------------------------------------------
    -- Zero-quantity deliveries must not create movements.
    --------------------------------------------------------

    if exists (
      select 1
      from public.client_delivery_items item
      where item.delivery_id = v_existing_delivery_id
        and item.actual_quantity = 0
        and item.movement_id is not null
    ) then
      raise exception
        'Zero-quantity delivery has an unexpected inventory movement';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_items) item
      left join public.client_delivery_items saved
        on saved.delivery_id = v_existing_delivery_id
       and saved.product_id = (item ->> 'product_id')::uuid
      where saved.id is null
         or saved.entered_issue_quantity is distinct from
              (item ->> 'issue_quantity')::numeric
         or saved.entered_loose_quantity is distinct from
              (item ->> 'loose_quantity')::numeric
    ) then
      raise exception
        'Existing delivery has different products or quantities';
    end if;

        --------------------------------------------------------
    -- Prevent multiple delivery items sharing one movement.
    --------------------------------------------------------

    if exists (
      select 1
      from public.client_delivery_items
      where delivery_id = v_existing_delivery_id
        and movement_id is not null
      group by movement_id
      having count(*) > 1
    ) then
      raise exception
        'Existing delivery contains duplicate inventory movements';
    end if;

    return v_existing_delivery_id;

  end if;

  ----------------------------------------------------------
  -- Inventory custody locations
  ----------------------------------------------------------

  v_driver_location_id :=
    public.get_inventory_location_id(
      'driver',
      v_user_id
    );

  v_client_location_id :=
    public.get_inventory_location_id(
      'client_reserve',
      p_client_id
    );


  if v_driver_location_id is null then
    raise exception
      'The driver inventory location could not be found';
  end if;


  if v_client_location_id is null then
    raise exception
      'The client reserve inventory location could not be found';
  end if;


  ----------------------------------------------------------
  -- Create/update delivery confirmation
  ----------------------------------------------------------

  insert into public.client_deliveries (
    source_visit_id,
    reserve_snapshot_id,
    client_id,
    stop_id,
    machine_id,
    delivered_by,
    confirmed_at
  )
  values (
    trim(p_source_visit_id),
    v_snapshot_id,
    p_client_id,
    p_stop_id,
    p_machine_id,
    v_user_id,
    p_confirmed_at
  )
  returning id into v_delivery_id;

  if v_delivery_id is null then
    raise exception
      'This delivery belongs to another user';
  end if;

  ----------------------------------------------------------
  -- Process actual delivery
  ----------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    begin
      v_product_id :=
        (v_item ->> 'product_id')::uuid;

      v_issue_quantity :=
        coalesce(
          (v_item ->> 'issue_quantity')::numeric,
          0
        );

      v_loose_quantity :=
        coalesce(
          (v_item ->> 'loose_quantity')::numeric,
          0
        );

    exception
      when others then
        raise exception
          'Invalid delivery item';
    end;


    if v_issue_quantity < 0
       or v_loose_quantity < 0 then
      raise exception
        'Delivery quantities cannot be negative';
    end if;


    perform public.assert_inventory_quantity_precision(v_issue_quantity, 'Issue quantity');
    perform public.assert_inventory_quantity_precision(v_loose_quantity, 'Loose quantity');

    --------------------------------------------------------
    -- Load product packaging + par
    --------------------------------------------------------

    select
      ip.base_unit,
      ip.issue_unit,
      ip.units_per_issue_unit,
      ip.package_description,
      ip.allows_loose_units,
      ip.allows_partial_base_unit,
      cip.par_level
    into
      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description,
      v_allows_loose_units,
      v_allows_partial_base_unit,
      v_par_level
    from public.inventory_products ip
    join public.client_inventory_products cip
      on cip.product_id = ip.id
    where ip.id = v_product_id
      and ip.is_active = true
      and cip.client_id = p_client_id
      and cip.is_active = true;


    if not found then
      raise exception
        'Product % is not configured for this client',
        v_product_id;
    end if;


    if v_par_level is null then
      raise exception
        'Product % does not have a configured par level',
        v_product_id;
    end if;


    --------------------------------------------------------
    -- Validate packaging entry
    --------------------------------------------------------

    if trunc(v_issue_quantity)
       <> v_issue_quantity then
      raise exception
        'Issue quantity must be a whole number';
    end if;


    if not v_allows_loose_units
       and v_loose_quantity > 0 then
      raise exception
        'Loose units are not allowed for product %',
        v_product_id;
    end if;


    if not v_allows_partial_base_unit
       and trunc(v_loose_quantity)
         <> v_loose_quantity then
      raise exception
        'Partial base units are not allowed for product %',
        v_product_id;
    end if;


    v_actual_quantity :=
      (
        v_issue_quantity *
        v_units_per_issue_unit
      ) +
      v_loose_quantity;


    perform public.assert_inventory_quantity_precision(v_actual_quantity, 'Actual delivery quantity');

    --------------------------------------------------------
    -- Read FLOW-16 reserve before
    --------------------------------------------------------

    select item.normalized_quantity
    into v_reserve_before
    from public.client_reserve_snapshot_items item
    where item.snapshot_id = v_snapshot_id
      and item.product_id = v_product_id;


    if v_reserve_before is null then
      raise exception
        'Product % was not included in the client reserve count',
        v_product_id;
    end if;


    v_recommended_quantity :=
      greatest(
        v_par_level -
        v_reserve_before,
        0
      );


    if v_recommended_quantity <= 0 then
      raise exception
        'Product % does not require delivery',
        v_product_id;
    end if;


    --------------------------------------------------------
    -- Zero actual delivery is valid.
    --
    -- Driver may be out of stock.
    --------------------------------------------------------

    if v_actual_quantity > 0 then

      insert into public.inventory_movements (
        movement_type,
        product_id,

        from_location_id,
        to_location_id,

        normalized_quantity,
        normalized_unit,

        entered_issue_quantity,
        entered_loose_quantity,

        base_unit_snapshot,
        issue_unit_snapshot,
        units_per_issue_unit_snapshot,
        package_description_snapshot,

        source_visit_id,
        stop_id,
        machine_id,

        recorded_by,
        occurred_at
      )
      values (
        'client_delivery',
        v_product_id,

        v_driver_location_id,
        v_client_location_id,

        v_actual_quantity,
        v_base_unit,

        v_issue_quantity,
        v_loose_quantity,

        v_base_unit,
        v_issue_unit,
        v_units_per_issue_unit,
        v_package_description,

        trim(p_source_visit_id),
        p_stop_id,
        p_machine_id,

        v_user_id,
        p_confirmed_at
      )
      returning id into v_movement_id;

    else
      v_movement_id := null;
    end if;


    --------------------------------------------------------
    -- Save delivery item
    --------------------------------------------------------

    insert into public.client_delivery_items (
      delivery_id,
      product_id,

      reserve_before_quantity,
      par_level,
      recommended_quantity,
      actual_quantity,

      normalized_unit,

      entered_issue_quantity,
      entered_loose_quantity,

      base_unit_snapshot,
      issue_unit_snapshot,
      units_per_issue_unit_snapshot,
      package_description_snapshot,

      movement_id
    )
    values (
      v_delivery_id,
      v_product_id,

      v_reserve_before,
      v_par_level,
      v_recommended_quantity,
      v_actual_quantity,

      v_base_unit,

      v_issue_quantity,
      v_loose_quantity,

      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description,

      v_movement_id
    );

  end loop;


  return v_delivery_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_client_reserve_after_service(p_source_visit_id text, p_client_id uuid, p_stop_id uuid, p_machine_id uuid, p_calculated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();

  v_before_snapshot_id uuid;
  v_delivery_id uuid;
  v_after_snapshot_id uuid;

  v_before_item record;

  v_delivery_quantity numeric;
  v_after_quantity numeric;
begin
  ----------------------------------------------------------
  -- Authentication / input validation
  ----------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_source_visit_id is null
     or length(trim(p_source_visit_id)) = 0 then
    raise exception 'A service visit ID is required';
  end if;

  if p_client_id is null then
    raise exception 'A client ID is required';
  end if;

  if p_stop_id is null then
    raise exception 'A stop ID is required';
  end if;

  if p_calculated_at is null then
    raise exception 'A calculation timestamp is required';
  end if;


  ----------------------------------------------------------
  -- Validate that this stop belongs to the current driver
  -- and matches the supplied client/machine.
  ----------------------------------------------------------

  if not exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.id = p_stop_id
      and s.client_id = p_client_id
      and r.driver_id = v_user_id
      and (
        (
          p_machine_id is not null
          and s.machine_id = p_machine_id
          and exists (
            select 1
            from public.machines m
            where m.id = p_machine_id
              and m.client_id = p_client_id
          )
        )
        or
        (
          p_machine_id is null
          and s.machine_id is null
          and (
            select count(*)
            from public.stop_machines sm
            join public.machines m
              on m.id = sm.machine_id
            where sm.stop_id = s.id
              and m.client_id = p_client_id
          ) >= 2
        )
      )
  ) then
    raise exception
      'The service stop is not assigned to the current driver';
  end if;


  ----------------------------------------------------------
  -- INV-V3-05: Serialize after-service snapshot creation
  -- for the same service visit.
  ----------------------------------------------------------

  -- Serialize inventory writes by visit and multi-machine stop.
  perform public.lock_multi_machine_inventory_stop(
    p_source_visit_id,
    p_stop_id
  );


  ----------------------------------------------------------
  -- FLOW-16:
  -- Find this visit's before-service reserve snapshot.
  ----------------------------------------------------------

  select snapshot.id
  into v_before_snapshot_id
  from public.client_reserve_snapshots snapshot
  where snapshot.source_visit_id = trim(p_source_visit_id)
    and snapshot.client_id = p_client_id
    and snapshot.stop_id = p_stop_id
    and snapshot.machine_id is not distinct from p_machine_id
    and snapshot.stage = 'before_service'
    and snapshot.recorded_by = v_user_id
  limit 1;

  if v_before_snapshot_id is null then
    raise exception
      'A synced client reserve count is required before calculating reserve after service';
  end if;


  ----------------------------------------------------------
  -- FLOW-17:
  -- Require a delivery explicitly linked to that exact
  -- FLOW-16 reserve snapshot.
  ----------------------------------------------------------

  select delivery.id
  into v_delivery_id
  from public.client_deliveries delivery
  where delivery.source_visit_id = trim(p_source_visit_id)
    and delivery.reserve_snapshot_id = v_before_snapshot_id
    and delivery.client_id = p_client_id
    and delivery.stop_id = p_stop_id
    and delivery.machine_id is not distinct from p_machine_id
    and delivery.delivered_by = v_user_id
  limit 1;

  if v_delivery_id is null then
    raise exception
      'A synced client delivery for the before-service reserve snapshot is required';
  end if;


  ----------------------------------------------------------
  -- INV-V3-05: Every assigned machine must have a valid
  -- service confirmation before shared reserve-after.
  -- Legacy single-machine visits remain unchanged.
  ----------------------------------------------------------

  if p_machine_id is null then
    if exists (
      select 1
      from public.stop_machines sm
      where sm.stop_id = p_stop_id
        and not exists (
          select 1
          from public.machine_refills mr
          where mr.source_visit_id = trim(p_source_visit_id)
            and mr.client_id = p_client_id
            and mr.stop_id = p_stop_id
            and mr.machine_id = sm.machine_id
            and mr.refilled_by = v_user_id
            and mr.confirmed_at is not null
            and mr.outcome in (
              'refilled',
              'not_needed',
              'unable_to_refill'
            )
        )
    ) then
      raise exception
        'Every assigned machine requires a synced service confirmation before reserve after service';
    end if;
  end if;


  ----------------------------------------------------------
  -- Idempotency.
  --
  -- If FLOW-19 has already been persisted for this visit,
  -- return the existing snapshot.
  ----------------------------------------------------------

  select snapshot.id
  into v_after_snapshot_id
  from public.client_reserve_snapshots snapshot
  where snapshot.source_visit_id = trim(p_source_visit_id)
    and snapshot.client_id = p_client_id
    and snapshot.stop_id = p_stop_id
    and snapshot.machine_id is not distinct from p_machine_id
    and snapshot.stage = 'after_service'
    and snapshot.recorded_by = v_user_id
  limit 1;

  if v_after_snapshot_id is not null then
    return v_after_snapshot_id;
  end if;


  ----------------------------------------------------------
  -- Create derived after-service snapshot.
  ----------------------------------------------------------

  insert into public.client_reserve_snapshots (
    source_visit_id,
    client_id,
    stop_id,
    machine_id,
    stage,
    recorded_by,
    recorded_at
  )
  values (
    trim(p_source_visit_id),
    p_client_id,
    p_stop_id,
    p_machine_id,
    'after_service',
    v_user_id,
    p_calculated_at
  )
  returning id into v_after_snapshot_id;


  ----------------------------------------------------------
  -- Calculate:
  --
  -- Reserve After =
  --   Reserve Before + Actual Client Delivery
  --
  -- FLOW-18 machine refill is NOT involved.
  ----------------------------------------------------------

  for v_before_item in
    select
      item.product_id,
      item.normalized_quantity,
      item.normalized_unit,
      item.base_unit_snapshot,
      item.issue_unit_snapshot,
      item.units_per_issue_unit_snapshot,
      item.package_description_snapshot
    from public.client_reserve_snapshot_items item
    where item.snapshot_id = v_before_snapshot_id
  loop

    select delivery_item.actual_quantity
    into v_delivery_quantity
    from public.client_delivery_items delivery_item
    where delivery_item.delivery_id = v_delivery_id
      and delivery_item.product_id = v_before_item.product_id
    limit 1;

    v_delivery_quantity :=
      coalesce(v_delivery_quantity, 0);

    if v_delivery_quantity < 0 then
      raise exception
        'Client delivery quantity cannot be negative';
    end if;

    v_after_quantity :=
      v_before_item.normalized_quantity
      + v_delivery_quantity;

    perform public.assert_inventory_quantity_precision(
      v_after_quantity,
      'After-service reserve quantity'
    );


    --------------------------------------------------------
    -- This is a calculated snapshot, not a physical count.
    --
    -- entered_issue_quantity / entered_loose_quantity = 0
    -- intentionally.
    --------------------------------------------------------

    insert into public.client_reserve_snapshot_items (
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
    values (
      v_after_snapshot_id,
      v_before_item.product_id,
      v_after_quantity,
      v_before_item.normalized_unit,
      0,
      0,
      v_before_item.base_unit_snapshot,
      v_before_item.issue_unit_snapshot,
      v_before_item.units_per_issue_unit_snapshot,
      v_before_item.package_description_snapshot
    );

  end loop;


  return v_after_snapshot_id;
end;
$function$;
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
      AND r.driver_id = v_user_id
      AND (
        (
          s.machine_id = p_machine_id
          AND EXISTS (
            SELECT 1
            FROM public.machines m
            WHERE m.id = p_machine_id
              AND m.client_id = p_client_id
          )
        )
        OR
        (
          s.machine_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.stop_machines sm
            JOIN public.machines m
              ON m.id = sm.machine_id
            WHERE sm.stop_id = s.id
              AND sm.machine_id = p_machine_id
              AND m.client_id = p_client_id
          )
          AND (
            SELECT COUNT(*)
            FROM public.stop_machines sm
            WHERE sm.stop_id = s.id
          ) >= 2
        )
      )
  ) THEN
    RAISE EXCEPTION
      'The service stop is not assigned to the current driver';
  END IF;

  -- Legacy visits require the completed after-service snapshot.
  -- Multi-machine visits require the shared audit and delivery instead.
  IF EXISTS (
    SELECT 1
    FROM public.stops s
    WHERE s.id = p_stop_id
      AND s.machine_id IS NOT NULL
  ) THEN
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
        'Client reserve after service must be synced before machine confirmation';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.client_reserve_snapshots snapshot
      JOIN public.client_deliveries delivery
        ON delivery.reserve_snapshot_id = snapshot.id
      WHERE snapshot.source_visit_id = v_visit_id
        AND snapshot.client_id = p_client_id
        AND snapshot.stop_id = p_stop_id
        AND snapshot.machine_id IS NULL
        AND snapshot.stage = 'before_service'
        AND snapshot.recorded_by = v_user_id
        AND delivery.source_visit_id = v_visit_id
        AND delivery.client_id = p_client_id
        AND delivery.stop_id = p_stop_id
        AND delivery.machine_id IS NULL
        AND delivery.delivered_by = v_user_id
    ) THEN
      RAISE EXCEPTION
        'Shared inventory audit and client delivery must be synced before machine confirmation';
    END IF;
  END IF;

  -- Serialize confirmation by visit and multi-machine stop.
  PERFORM public.lock_multi_machine_inventory_stop(
    v_visit_id,
    p_stop_id
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
    AND machine_id = p_machine_id
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

  -- INV-V3-05: Do not add new machine confirmations after
  -- the shared reserve-after snapshot has been finalized.
  -- Identical retries have already returned above.
  IF EXISTS (
    SELECT 1
    FROM public.stops s
    WHERE s.id = p_stop_id
      AND s.machine_id IS NULL
  ) AND EXISTS (
    SELECT 1
    FROM public.client_reserve_snapshots snapshot
    WHERE snapshot.source_visit_id = v_visit_id
      AND snapshot.client_id = p_client_id
      AND snapshot.stop_id = p_stop_id
      AND snapshot.machine_id IS NULL
      AND snapshot.stage = 'after_service'
      AND snapshot.recorded_by = v_user_id
  ) THEN
    RAISE EXCEPTION
      'Cannot add a machine confirmation after shared reserve-after completion';
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



-- INV-V3-05: Shared visit signatures.
-- Legacy signatures retain their machine-specific validation.

ALTER TABLE public.service_visit_signatures
  ALTER COLUMN machine_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_service_visit_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  expected_client_id uuid;
  expected_machine_id uuid;
  actual_machine_client_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.signed_by IS DISTINCT FROM OLD.signed_by
       OR NEW.source_visit_id IS DISTINCT FROM OLD.source_visit_id
       OR NEW.stop_id IS DISTINCT FROM OLD.stop_id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.machine_id IS DISTINCT FROM OLD.machine_id
    THEN
      RAISE EXCEPTION
        'Cannot reassign an existing service visit signature'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT s.client_id, s.machine_id
  INTO expected_client_id, expected_machine_id
  FROM public.stops AS s
  WHERE s.id = NEW.stop_id;

  IF NOT FOUND
     OR NEW.client_id IS DISTINCT FROM expected_client_id
     OR NEW.machine_id IS DISTINCT FROM expected_machine_id
  THEN
    RAISE EXCEPTION
      'Signature client or machine does not match the assigned stop'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.machine_id IS NULL THEN
    IF (
      SELECT count(*)
      FROM public.stop_machines sm
      JOIN public.machines m ON m.id = sm.machine_id
      WHERE sm.stop_id = NEW.stop_id
        AND m.client_id = NEW.client_id
    ) < 1 THEN
      RAISE EXCEPTION
        'Shared signature requires at least one assigned client machine'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT m.client_id
    INTO actual_machine_client_id
    FROM public.machines AS m
    WHERE m.id = NEW.machine_id;

    IF NOT FOUND
       OR actual_machine_client_id IS DISTINCT FROM NEW.client_id
    THEN
      RAISE EXCEPTION
        'Signature machine does not belong to the assigned client'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- INV-V3-05: Shared service visit summaries.
-- A multi-machine visit has one summary for the entire stop.
-- Legacy single-machine summaries retain their machine_id.
-- Preserve UNIQUE (source_visit_id).

ALTER TABLE public.service_visit_summaries
  ALTER COLUMN machine_id DROP NOT NULL;

-- INV-V3-05: Legacy machine refill compatibility.
CREATE OR REPLACE FUNCTION public.save_machine_refill_legacy_impl(p_source_visit_id text, p_client_id uuid, p_stop_id uuid, p_machine_id uuid, p_confirmed_at timestamp with time zone, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();

  v_refill_id uuid;

  v_driver_location_id uuid;
  v_machine_location_id uuid;

  v_item jsonb;

  v_product_id uuid;

  v_issue_quantity numeric;
  v_loose_quantity numeric;

  v_actual_quantity numeric;

  v_base_unit text;
  v_issue_unit text;
  v_units_per_issue_unit numeric;
  v_package_description text;

  v_allows_loose_units boolean;
  v_allows_partial_base_unit boolean;

  v_zero_reason text;
  v_zero_reason_note text;

  v_movement_id uuid;

begin

  ----------------------------------------------------------
  -- Authentication
  ----------------------------------------------------------

  if v_user_id is null then
    raise exception
      'Authentication is required';
  end if;


  if p_source_visit_id is null
    or length(
      trim(p_source_visit_id)
    ) = 0 then

    raise exception
      'A service visit ID is required';

  end if;


  if p_confirmed_at is null then
    raise exception
      'A confirmation timestamp is required';
  end if;


  if p_items is null
    or jsonb_typeof(p_items) <> 'array' then

    raise exception
      'Machine refill items must be a JSON array';

  end if;


  ----------------------------------------------------------
  -- Validate current stop
  ----------------------------------------------------------

  if not exists (
    select 1
    from public.stops s

    join public.routes r
      on r.id = s.route_id

    where s.id = p_stop_id
      and s.client_id = p_client_id
      and s.machine_id = p_machine_id
      and r.driver_id = v_user_id
  ) then

    raise exception
      'The service stop is not assigned to the current driver';

  end if;


  ----------------------------------------------------------
  -- FLOW-17 confirmation must exist.
  --
  -- This validates workflow order only.
  --
  -- Client reserve is NOT the source of machine refill.
  ----------------------------------------------------------

  if not exists (
    select 1
    from public.client_deliveries delivery
    where delivery.source_visit_id =
        trim(p_source_visit_id)
      and delivery.client_id =
        p_client_id
      and delivery.stop_id =
        p_stop_id
      and delivery.machine_id =
        p_machine_id
      and delivery.delivered_by =
        v_user_id
  ) then

    raise exception
      'A synced client delivery confirmation is required before machine refill';

  end if;


  ----------------------------------------------------------
  -- Inventory custody locations
  --
  -- DRIVER / VAN -> MACHINE
  ----------------------------------------------------------

  v_driver_location_id :=
    public.get_inventory_location_id(
      'driver',
      v_user_id
    );


  v_machine_location_id :=
    public.get_inventory_location_id(
      'machine',
      p_machine_id
    );


  if v_driver_location_id is null then

    raise exception
      'The driver inventory location could not be found';

  end if;


  if v_machine_location_id is null then

    raise exception
      'The machine inventory location could not be found';

  end if;


  ----------------------------------------------------------
  -- Create/update machine refill confirmation
  ----------------------------------------------------------

  insert into public.machine_refills (
    source_visit_id,
    client_id,
    stop_id,
    machine_id,
    refilled_by,
    confirmed_at
  )
  values (
    trim(p_source_visit_id),
    p_client_id,
    p_stop_id,
    p_machine_id,
    v_user_id,
    p_confirmed_at
  )
  on conflict (source_visit_id, machine_id)
  do update set
    client_id =
      excluded.client_id,

    stop_id =
      excluded.stop_id,

    machine_id =
      excluded.machine_id,

    confirmed_at =
      excluded.confirmed_at,

    updated_at =
      now()

  where machine_refills.refilled_by =
    v_user_id

  returning id
  into v_refill_id;


  if v_refill_id is null then

    raise exception
      'This machine refill belongs to another user';

  end if;


  ----------------------------------------------------------
  -- Immutable movement protection
  ----------------------------------------------------------

  if exists (
    select 1
    from public.machine_refill_items
    where machine_refill_id =
        v_refill_id
      and movement_id is not null
  ) then

    raise exception
      'This machine refill has already been synchronized';

  end if;


  ----------------------------------------------------------
  -- Remove earlier zero-only/pending confirmation
  --
  -- Safe because no immutable inventory movement exists.
  ----------------------------------------------------------

  delete from public.machine_refill_items
  where machine_refill_id =
    v_refill_id;


  ----------------------------------------------------------
  -- Process refill items
  ----------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    --------------------------------------------------------
    -- Reset per-item values
    --------------------------------------------------------

    v_movement_id := null;
    v_zero_reason := null;
    v_zero_reason_note := null;


    --------------------------------------------------------
    -- Parse input
    --------------------------------------------------------

    begin

      v_product_id :=
        (v_item ->> 'product_id')::uuid;


      v_issue_quantity :=
        coalesce(
          (v_item ->> 'issue_quantity')::numeric,
          0
        );


      v_loose_quantity :=
        coalesce(
          (v_item ->> 'loose_quantity')::numeric,
          0
        );


      v_zero_reason :=
        nullif(
          trim(
            v_item ->> 'zero_reason'
          ),
          ''
        );


      v_zero_reason_note :=
        nullif(
          trim(
            v_item ->> 'zero_reason_note'
          ),
          ''
        );

    exception
      when others then

        raise exception
          'Invalid machine refill item';

    end;


    --------------------------------------------------------
    -- Quantity validation
    --------------------------------------------------------

    if v_issue_quantity < 0
      or v_loose_quantity < 0 then

      raise exception
        'Machine refill quantities cannot be negative';

    end if;


    perform public.assert_inventory_quantity_precision(v_issue_quantity, 'Issue quantity');
    perform public.assert_inventory_quantity_precision(v_loose_quantity, 'Loose quantity');

    if trunc(v_issue_quantity)
      <> v_issue_quantity then

      raise exception
        'Issue quantity must be a whole number';

    end if;


    --------------------------------------------------------
    -- Load client-configured product + packaging
    --------------------------------------------------------

    select
      ip.base_unit,
      ip.issue_unit,
      ip.units_per_issue_unit,
      ip.package_description,
      ip.allows_loose_units,
      ip.allows_partial_base_unit

    into
      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description,
      v_allows_loose_units,
      v_allows_partial_base_unit

    from public.inventory_products ip

    join public.client_inventory_products cip
      on cip.product_id = ip.id

    where ip.id = v_product_id
      and ip.is_active = true
      and cip.client_id =
        p_client_id
      and cip.is_active = true;


    if not found then

      raise exception
        'Product % is not configured for this client',
        v_product_id;

    end if;


    --------------------------------------------------------
    -- Packaging validation
    --------------------------------------------------------

    if not v_allows_loose_units
      and v_loose_quantity > 0 then

      raise exception
        'Loose units are not allowed for product %',
        v_product_id;

    end if;


    if not v_allows_partial_base_unit
      and trunc(v_loose_quantity)
        <> v_loose_quantity then

      raise exception
        'Partial base units are not allowed for product %',
        v_product_id;

    end if;


    --------------------------------------------------------
    -- Normalize actual quantity
    --------------------------------------------------------

    v_actual_quantity :=
      (
        v_issue_quantity *
        v_units_per_issue_unit
      )
      +
      v_loose_quantity;


    perform public.assert_inventory_quantity_precision(v_actual_quantity, 'Actual refill quantity');

    --------------------------------------------------------
    -- Zero reason validation
    --------------------------------------------------------

    if v_actual_quantity > 0 then

      ------------------------------------------------------
      -- A positive refill cannot carry a zero-refill
      -- explanation.
      ------------------------------------------------------

      v_zero_reason := null;
      v_zero_reason_note := null;


    else

      ------------------------------------------------------
      -- Reason itself is optional.
      ------------------------------------------------------

      if v_zero_reason is not null
        and v_zero_reason not in (
          'refill_not_required',
          'product_unavailable',
          'machine_issue',
          'other'
        ) then

        raise exception
          'Invalid machine refill zero reason';

      end if;


      ------------------------------------------------------
      -- Notes are only supported with Other.
      ------------------------------------------------------

      if v_zero_reason is distinct from 'other'
        and v_zero_reason_note is not null then

        raise exception
          'Machine refill zero reason note is only allowed for Other';

      end if;


      ------------------------------------------------------
      -- Other requires an explanation.
      ------------------------------------------------------

      if v_zero_reason = 'other'
        and v_zero_reason_note is null then

        raise exception
          'A reason note is required when machine refill reason is Other';

      end if;

    end if;


    --------------------------------------------------------
    -- Create immutable custody movement for positive refill
    --
    -- DRIVER -> MACHINE
    --------------------------------------------------------

    if v_actual_quantity > 0 then

      insert into public.inventory_movements (
        movement_type,
        product_id,

        from_location_id,
        to_location_id,

        normalized_quantity,
        normalized_unit,

        entered_issue_quantity,
        entered_loose_quantity,

        base_unit_snapshot,
        issue_unit_snapshot,
        units_per_issue_unit_snapshot,
        package_description_snapshot,

        source_visit_id,
        stop_id,
        machine_id,

        recorded_by,
        occurred_at
      )
      values (
        'machine_refill',
        v_product_id,

        v_driver_location_id,
        v_machine_location_id,

        v_actual_quantity,
        v_base_unit,

        v_issue_quantity,
        v_loose_quantity,

        v_base_unit,
        v_issue_unit,
        v_units_per_issue_unit,
        v_package_description,

        trim(p_source_visit_id),
        p_stop_id,
        p_machine_id,

        v_user_id,
        p_confirmed_at
      )
      returning id
      into v_movement_id;

    end if;


    --------------------------------------------------------
    -- Save machine refill item
    --------------------------------------------------------

    insert into public.machine_refill_items (
      machine_refill_id,
      product_id,

      actual_quantity,
      normalized_unit,

      entered_issue_quantity,
      entered_loose_quantity,

      base_unit_snapshot,
      issue_unit_snapshot,
      units_per_issue_unit_snapshot,
      package_description_snapshot,

      zero_reason,
      zero_reason_note,

      movement_id
    )
    values (
      v_refill_id,
      v_product_id,

      v_actual_quantity,
      v_base_unit,

      v_issue_quantity,
      v_loose_quantity,

      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description,

      v_zero_reason,
      v_zero_reason_note,

      v_movement_id
    );

  end loop;


  return v_refill_id;

end;
$function$
;


-- INV-V3-05: Preserve public legacy refill compatibility.
CREATE OR REPLACE FUNCTION public.save_machine_refill(
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

  -- Legacy clients support exactly one machine per service visit.
  -- Never select an arbitrary record from a multi-machine visit.
  IF (
    SELECT COUNT(*)
    FROM public.machine_refills
    WHERE source_visit_id = v_visit_id
  ) > 1 THEN
    RAISE EXCEPTION
      'Legacy machine refill cannot process a multi-machine visit';
  END IF;

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

-- INV-V3-05: One completed multi-machine summary per stop.
--
-- Legacy summaries have a non-NULL machine_id and remain unaffected.
-- Multi-machine summaries have machine_id IS NULL.

CREATE UNIQUE INDEX service_visit_summaries_multi_machine_stop_unique
ON public.service_visit_summaries (stop_id)
WHERE machine_id IS NULL;

-- INV-V3-05: Atomic multi-machine visit completion.
--
-- Called with the driver's authenticated JWT, not the service-role identity.
-- The summary and stop transition occur in one transaction.

CREATE OR REPLACE FUNCTION public.complete_multi_machine_service_visit(
  p_source_visit_id text,
  p_route_id uuid,
  p_stop_id uuid,
  p_client_id uuid,
  p_completed_at timestamptz,
  p_summary jsonb
)
RETURNS TABLE (
  summary_id uuid,
  survey_token uuid,
  notification_status text,
  email_sent_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_visit_id text := NULLIF(btrim(p_source_visit_id), '');
  v_stop public.stops%ROWTYPE;
  v_route_status public.route_status;
  v_signature public.service_visit_signatures%ROWTYPE;
  v_before_id uuid;
  v_existing public.service_visit_summaries%ROWTYPE;
  v_summary jsonb;
  v_machine_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF v_visit_id IS NULL
     OR p_route_id IS NULL
     OR p_stop_id IS NULL
     OR p_client_id IS NULL
     OR p_completed_at IS NULL
     OR p_summary IS NULL
     OR jsonb_typeof(p_summary) <> 'object' THEN
    RAISE EXCEPTION 'Invalid multi-machine completion payload';
  END IF;

  -- Match the locking convention used by machine confirmations and
  -- shared after-service inventory persistence.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_visit_id, 0));

  -- Coordinate completion with inventory writes across visit IDs.
  -- Lock order: visit first, then multi-machine stop.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('multi_machine_stop:' || p_stop_id::text, 0)
  );

  -- Lock the route before the stop to match route-management operations.
  -- The stop guard also takes a SHARE lock on this route.
  SELECT r.status
  INTO v_route_status
  FROM public.routes r
  WHERE r.id = p_route_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service route not found';
  END IF;

  SELECT s.*
  INTO v_stop
  FROM public.stops s
  WHERE s.id = p_stop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service stop not found';
  END IF;

  SELECT r.status
  INTO v_route_status
  FROM public.routes r
  WHERE r.id = v_stop.route_id
    AND r.id = p_route_id
    AND r.driver_id = v_user_id;

  IF NOT FOUND
     OR v_stop.client_id IS DISTINCT FROM p_client_id
     OR v_stop.machine_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid multi-machine stop assignment';
  END IF;

  -- Idempotent retry: use the persisted completion without requiring
  -- inventory and machine confirmations to be revalidated.
  SELECT *
  INTO v_existing
  FROM public.service_visit_summaries s
  WHERE s.source_visit_id = v_visit_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.stop_id IS DISTINCT FROM p_stop_id
       OR v_existing.client_id IS DISTINCT FROM p_client_id
       OR v_existing.machine_id IS NOT NULL
       OR v_existing.completed_by IS DISTINCT FROM v_user_id
       OR v_existing.completed_at IS DISTINCT FROM p_completed_at
       OR v_stop.status <> 'completed'
       OR v_stop.completed_at IS DISTINCT FROM p_completed_at THEN
      RAISE EXCEPTION 'Conflicting completion already exists';
    END IF;

    -- Verify the original client confirmation and submitted summary.
    SELECT *
    INTO v_signature
    FROM public.service_visit_signatures sig
    WHERE sig.source_visit_id = v_visit_id
      AND sig.stop_id = p_stop_id
      AND sig.client_id = p_client_id
      AND sig.machine_id IS NULL
      AND sig.signed_by = v_user_id;

    IF NOT FOUND
       OR NULLIF(btrim(v_signature.storage_path), '') IS NULL THEN
      RAISE EXCEPTION 'Original client confirmation is missing';
    END IF;

    v_summary := p_summary || jsonb_build_object(
      'clientConfirmation',
      jsonb_build_object(
        'signatureId', v_signature.id,
        'storagePath', v_signature.storage_path,
        'signedAt', v_signature.signed_at,
        'confirmedAt', v_signature.signed_at
      )
    );

    IF v_existing.summary IS DISTINCT FROM v_summary THEN
      RAISE EXCEPTION 'Conflicting completion summary already exists';
    END IF;

    RETURN QUERY
    SELECT v_existing.id,
           v_existing.survey_token,
           v_existing.notification_status,
           v_existing.email_sent_at;
    RETURN;
  END IF;

  -- Preserve the original completion time for offline synchronization.
  -- Reject completion before arrival when arrival is recorded.
  IF v_stop.arrived_at IS NOT NULL
     AND p_completed_at < v_stop.arrived_at THEN
    RAISE EXCEPTION 'Completion time cannot precede arrival time';
  END IF;

  SELECT count(*)
  INTO v_machine_count
  FROM public.stop_machines sm
  JOIN public.machines m ON m.id = sm.machine_id
  WHERE sm.stop_id = p_stop_id
    AND m.client_id = p_client_id;

  IF v_machine_count < 1
     OR v_machine_count <> (
       SELECT count(*)
       FROM public.stop_machines sm
       WHERE sm.stop_id = p_stop_id
     ) THEN
    RAISE EXCEPTION 'At least one valid assigned machine is required';
  END IF;

  SELECT *
  INTO v_signature
  FROM public.service_visit_signatures sig
  WHERE sig.source_visit_id = v_visit_id
    AND sig.stop_id = p_stop_id
    AND sig.client_id = p_client_id
    AND sig.machine_id IS NULL
    AND sig.signed_by = v_user_id;

  IF NOT FOUND
     OR NULLIF(btrim(v_signature.storage_path), '') IS NULL
     OR v_signature.signed_at > p_completed_at THEN
    RAISE EXCEPTION 'A valid shared client signature is required';
  END IF;

  SELECT snapshot.id
  INTO v_before_id
  FROM public.client_reserve_snapshots snapshot
  WHERE snapshot.source_visit_id = v_visit_id
    AND snapshot.stop_id = p_stop_id
    AND snapshot.client_id = p_client_id
    AND snapshot.machine_id IS NULL
    AND snapshot.stage = 'before_service'
    AND snapshot.recorded_by = v_user_id;

  IF v_before_id IS NULL THEN
    RAISE EXCEPTION 'Shared before-service inventory is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_deliveries d
    WHERE d.source_visit_id = v_visit_id
      AND d.reserve_snapshot_id = v_before_id
      AND d.stop_id = p_stop_id
      AND d.client_id = p_client_id
      AND d.machine_id IS NULL
      AND d.delivered_by = v_user_id
  ) THEN
    RAISE EXCEPTION 'Shared client delivery is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stop_machines sm
    WHERE sm.stop_id = p_stop_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.machine_refills mr
        WHERE mr.source_visit_id = v_visit_id
          AND mr.stop_id = p_stop_id
          AND mr.client_id = p_client_id
          AND mr.machine_id = sm.machine_id
          AND mr.refilled_by = v_user_id
          AND mr.confirmed_at IS NOT NULL
          AND mr.outcome IN (
            'refilled', 'not_needed', 'unable_to_refill'
          )
      )
  ) THEN
    RAISE EXCEPTION 'Every assigned machine requires confirmation';
  END IF;

  -- Machine confirmations must not occur after visit completion.
  IF EXISTS (
    SELECT 1
    FROM public.machine_refills mr
    WHERE mr.source_visit_id = v_visit_id
      AND mr.stop_id = p_stop_id
      AND mr.confirmed_at > p_completed_at
  ) THEN
    RAISE EXCEPTION 'Machine confirmation cannot follow visit completion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.machine_refills mr
    WHERE mr.source_visit_id = v_visit_id
      AND (
        mr.stop_id IS DISTINCT FROM p_stop_id
        OR mr.client_id IS DISTINCT FROM p_client_id
        OR mr.refilled_by IS DISTINCT FROM v_user_id
        OR NOT EXISTS (
          SELECT 1
          FROM public.stop_machines sm
          WHERE sm.stop_id = p_stop_id
            AND sm.machine_id = mr.machine_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected machine confirmation for this visit';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_reserve_snapshots snapshot
    WHERE snapshot.source_visit_id = v_visit_id
      AND snapshot.stop_id = p_stop_id
      AND snapshot.client_id = p_client_id
      AND snapshot.machine_id IS NULL
      AND snapshot.stage = 'after_service'
      AND snapshot.recorded_by = v_user_id
  ) THEN
    RAISE EXCEPTION 'Shared after-service inventory is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_movements movement
    WHERE movement.source_visit_id = v_visit_id
      AND movement.movement_type = 'machine_refill'
  ) THEN
    RAISE EXCEPTION 'Legacy machine refill movements are not allowed';
  END IF;

  -- The signature is server-verified, not trusted from the request.
  v_summary := p_summary || jsonb_build_object(
    'clientConfirmation',
    jsonb_build_object(
      'signatureId', v_signature.id,
      'storagePath', v_signature.storage_path,
      'signedAt', v_signature.signed_at,
      'confirmedAt', v_signature.signed_at
    )
  );

  IF v_route_status <> 'in_progress'
     OR v_stop.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Route and stop must be in progress';
  END IF;

  -- A different visit ID must never complete the same stop.
  IF EXISTS (
    SELECT 1
    FROM public.service_visit_summaries existing
    WHERE existing.stop_id = p_stop_id
      AND existing.source_visit_id <> v_visit_id
  ) THEN
    RAISE EXCEPTION
      'This stop already has a summary for another service visit';
  END IF;

  INSERT INTO public.service_visit_summaries (
    source_visit_id,
    stop_id,
    client_id,
    machine_id,
    completed_by,
    completed_at,
    summary
  )
  VALUES (
    v_visit_id,
    p_stop_id,
    p_client_id,
    NULL,
    v_user_id,
    p_completed_at,
    v_summary
  )
  RETURNING *
  INTO v_existing;

  UPDATE public.stops
  SET status = 'completed',
      completed_at = p_completed_at
  WHERE id = p_stop_id;

  RETURN QUERY
  SELECT v_existing.id,
         v_existing.survey_token,
         v_existing.notification_status,
         v_existing.email_sent_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_multi_machine_service_visit(
  text, uuid, uuid, uuid, timestamptz, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.complete_multi_machine_service_visit(
  text, uuid, uuid, uuid, timestamptz, jsonb
) TO authenticated;

-- INV-V3-05: Guard completed multi-machine inventory.
--
-- Prevent inventory writes after completion without changing
-- legacy single-machine behavior.

CREATE OR REPLACE FUNCTION public.guard_completed_multi_machine_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row record;
  v_visit_id text;
  v_stop_id uuid;
  v_status public.stop_status;
  v_side integer;
  v_side_count integer;
BEGIN
  -- INSERT: inspect NEW.
  -- DELETE: inspect OLD.
  -- UPDATE: inspect both original and destination associations.
  v_side_count := CASE WHEN TG_OP = 'UPDATE' THEN 2 ELSE 1 END;

  FOR v_side IN 1..v_side_count LOOP
    IF TG_OP = 'DELETE'
       OR (TG_OP = 'UPDATE' AND v_side = 1) THEN
      v_row := OLD;
    ELSE
      v_row := NEW;
    END IF;

    v_visit_id := NULL;
    v_stop_id := NULL;

    IF TG_TABLE_NAME IN (
      'client_reserve_snapshots',
      'client_deliveries',
      'machine_refills'
    ) THEN
      v_visit_id := v_row.source_visit_id;
      v_stop_id := v_row.stop_id;

    ELSIF TG_TABLE_NAME = 'client_reserve_snapshot_items' THEN
      SELECT s.source_visit_id, s.stop_id
      INTO v_visit_id, v_stop_id
      FROM public.client_reserve_snapshots s
      WHERE s.id = v_row.snapshot_id;

    ELSIF TG_TABLE_NAME = 'client_delivery_items' THEN
      SELECT d.source_visit_id, d.stop_id
      INTO v_visit_id, v_stop_id
      FROM public.client_deliveries d
      WHERE d.id = v_row.delivery_id;

    ELSIF TG_TABLE_NAME = 'machine_refill_items' THEN
      SELECT r.source_visit_id, r.stop_id
      INTO v_visit_id, v_stop_id
      FROM public.machine_refills r
      WHERE r.id = v_row.machine_refill_id;

    ELSE
      RAISE EXCEPTION 'Unsupported inventory trigger table';
    END IF;

    IF v_visit_id IS NULL OR v_stop_id IS NULL THEN
      RAISE EXCEPTION 'Inventory visit association is required';
    END IF;

    SELECT s.status
    INTO v_status
    FROM public.stops s
    WHERE s.id = v_stop_id
      AND s.machine_id IS NULL;

    IF FOUND AND v_status = 'completed' THEN
      IF TG_OP = 'UPDATE'
         AND to_jsonb(OLD) = to_jsonb(NEW) THEN
        CONTINUE;
      END IF;

      RAISE EXCEPTION
        'Inventory cannot be modified after multi-machine visit completion';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_completed_multi_machine_reserve_snapshots
BEFORE INSERT OR UPDATE OR DELETE ON public.client_reserve_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_multi_machine_inventory();

CREATE TRIGGER guard_completed_multi_machine_reserve_items
BEFORE INSERT OR UPDATE OR DELETE ON public.client_reserve_snapshot_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_multi_machine_inventory();

CREATE TRIGGER guard_completed_multi_machine_deliveries
BEFORE INSERT OR UPDATE OR DELETE ON public.client_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_multi_machine_inventory();

CREATE TRIGGER guard_completed_multi_machine_delivery_items
BEFORE INSERT OR UPDATE OR DELETE ON public.client_delivery_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_multi_machine_inventory();

CREATE TRIGGER guard_completed_multi_machine_refills
BEFORE INSERT OR UPDATE OR DELETE ON public.machine_refills
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_multi_machine_inventory();

CREATE TRIGGER guard_completed_multi_machine_refill_items
BEFORE INSERT OR UPDATE OR DELETE ON public.machine_refill_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_multi_machine_inventory();

-- INV-V3-05: Restrict inventory table truncation.
--
-- RLS does not protect TRUNCATE operations.
-- Inventory history must not be removable by API client roles.

REVOKE TRUNCATE ON TABLE
  public.client_reserve_snapshots,
  public.client_reserve_snapshot_items,
  public.client_deliveries,
  public.client_delivery_items,
  public.machine_refills,
  public.machine_refill_items
FROM anon, authenticated;
