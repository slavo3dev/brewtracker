-- INV-V3-05: Support unified service visits with 1-N machines.
-- Preserve original function definitions and authorization.

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
          ) >= 1
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
          ) >= 1
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
          ) >= 1
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
          ) >= 1
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
