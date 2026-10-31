-- Enforce numeric(12,3) precision before inventory movement writes.
-- Based on live RPC definitions exported 2026-10-29.
-- Requires public.assert_inventory_quantity_precision(numeric, text).

-- record_warehouse_driver_transfer
CREATE OR REPLACE FUNCTION public.record_warehouse_driver_transfer(p_movement_type inventory_movement_type, p_warehouse_id uuid, p_driver_id uuid, p_product_id uuid, p_issue_quantity numeric, p_loose_quantity numeric, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();

  v_user_role public.app_role;
  v_user_region text;

  v_warehouse_region text;
  v_driver_region text;

  v_warehouse_location_id uuid;
  v_driver_location_id uuid;

  v_from_location_id uuid;
  v_to_location_id uuid;

  v_base_unit text;
  v_issue_unit text;
  v_units_per_issue_unit numeric;
  v_package_description text;

  v_allows_loose_units boolean;
  v_allows_partial_base_unit boolean;

  v_normalized_quantity numeric;

  v_movement_id uuid;
begin
  ----------------------------------------------------------
  -- Authentication
  ----------------------------------------------------------

  if v_user_id is null then
    raise exception
      'Authentication is required';
  end if;


  ----------------------------------------------------------
  -- Admin authorization
  ----------------------------------------------------------

  select
    role,
    region
  into
    v_user_role,
    v_user_region
  from public.users
  where id = v_user_id
    and is_active = true;


  if v_user_role is null then
    raise exception
      'The current user profile could not be found';
  end if;


  if v_user_role not in ('ceo', 'manager') then
    raise exception
      'Only administrators may record warehouse inventory transfers';
  end if;


  ----------------------------------------------------------
  -- Movement type
  ----------------------------------------------------------

  if p_movement_type not in (
    'warehouse_issue',
    'warehouse_return'
  ) then
    raise exception
      'INV-12 only supports warehouse_issue and warehouse_return';
  end if;


  ----------------------------------------------------------
  -- Required entities
  ----------------------------------------------------------

  if p_warehouse_id is null then
    raise exception
      'A warehouse is required';
  end if;


  if p_driver_id is null then
    raise exception
      'A driver is required';
  end if;


  if p_product_id is null then
    raise exception
      'A product is required';
  end if;


  if p_occurred_at is null then
    raise exception
      'A transfer timestamp is required';
  end if;


  ----------------------------------------------------------
  -- Warehouse
  ----------------------------------------------------------

  select region
  into v_warehouse_region
  from public.warehouses
  where id = p_warehouse_id;


  if not found then
    raise exception
      'The selected warehouse could not be found';
  end if;


  ----------------------------------------------------------
  -- Driver
  ----------------------------------------------------------

  select region
  into v_driver_region
  from public.users
  where id = p_driver_id
    and role = 'driver'
    and is_active = true;


  if not found then
    raise exception
      'The selected driver could not be found or is inactive';
  end if;


  ----------------------------------------------------------
  -- Manager region restriction
  ----------------------------------------------------------

  if v_user_role = 'manager' then
    if v_user_region is distinct from v_warehouse_region then
      raise exception
        'Managers may only transfer inventory for warehouses in their region';
    end if;

    if v_user_region is distinct from v_driver_region then
      raise exception
        'Managers may only transfer inventory for drivers in their region';
    end if;
  end if;


  ----------------------------------------------------------
  -- Quantity validation
  ----------------------------------------------------------

  if p_issue_quantity is null
     or p_issue_quantity < 0 then
    raise exception
      'Issue quantity must be zero or greater';
  end if;


  if p_loose_quantity is null
     or p_loose_quantity < 0 then
    raise exception
      'Loose quantity must be zero or greater';
  end if;


  perform public.assert_inventory_quantity_precision(p_issue_quantity, 'Issue quantity');
  perform public.assert_inventory_quantity_precision(p_loose_quantity, 'Loose quantity');

  if trunc(p_issue_quantity) <> p_issue_quantity then
    raise exception
      'Issue quantity must be a whole number';
  end if;


  ----------------------------------------------------------
  -- Product packaging
  ----------------------------------------------------------

  select
    base_unit,
    issue_unit,
    units_per_issue_unit,
    package_description,
    allows_loose_units,
    allows_partial_base_unit
  into
    v_base_unit,
    v_issue_unit,
    v_units_per_issue_unit,
    v_package_description,
    v_allows_loose_units,
    v_allows_partial_base_unit
  from public.inventory_products
  where id = p_product_id
    and is_active = true;


  if not found then
    raise exception
      'The selected inventory product could not be found or is inactive';
  end if;


  if v_base_unit is null
     or length(trim(v_base_unit)) = 0 then
    raise exception
      'The selected product does not have a valid base unit';
  end if;


  if v_issue_unit is null
     or length(trim(v_issue_unit)) = 0 then
    raise exception
      'The selected product does not have a valid issue unit';
  end if;


  if v_units_per_issue_unit is null
     or v_units_per_issue_unit <= 0 then
    raise exception
      'The selected product does not have a valid package conversion';
  end if;


  ----------------------------------------------------------
  -- Loose quantity validation
  ----------------------------------------------------------

  if not v_allows_loose_units
     and p_loose_quantity <> 0 then
    raise exception
      'Loose quantities are not allowed for this product';
  end if;


  if not v_allows_partial_base_unit
     and trunc(p_loose_quantity) <> p_loose_quantity then
    raise exception
      'Partial base-unit quantities are not allowed for this product';
  end if;


  ----------------------------------------------------------
  -- Normalize quantity
  ----------------------------------------------------------

  v_normalized_quantity :=
    (
      p_issue_quantity *
      v_units_per_issue_unit
    )
    +
    p_loose_quantity;


  perform public.assert_inventory_quantity_precision(v_normalized_quantity, 'Normalized transfer quantity');

  if v_normalized_quantity <= 0 then
    raise exception
      'Transfer quantity must be greater than zero';
  end if;


  ----------------------------------------------------------
  -- Inventory locations
  ----------------------------------------------------------

  v_warehouse_location_id :=
    public.get_inventory_location_id(
      'warehouse',
      p_warehouse_id
    );


  v_driver_location_id :=
    public.get_inventory_location_id(
      'driver',
      p_driver_id
    );


  if v_warehouse_location_id is null then
    raise exception
      'The warehouse inventory location could not be found';
  end if;


  if v_driver_location_id is null then
    raise exception
      'The driver inventory location could not be found';
  end if;


  ----------------------------------------------------------
  -- Determine custody direction
  ----------------------------------------------------------

  if p_movement_type = 'warehouse_issue' then

    v_from_location_id :=
      v_warehouse_location_id;

    v_to_location_id :=
      v_driver_location_id;

  else

    v_from_location_id :=
      v_driver_location_id;

    v_to_location_id :=
      v_warehouse_location_id;

  end if;


  ----------------------------------------------------------
  -- Immutable ledger insert
  ----------------------------------------------------------

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
    p_movement_type,
    p_product_id,

    v_from_location_id,
    v_to_location_id,

    v_normalized_quantity,
    v_base_unit,

    p_issue_quantity,
    p_loose_quantity,

    v_base_unit,
    v_issue_unit,
    v_units_per_issue_unit,
    v_package_description,

    null,
    null,
    null,

    v_user_id,
    p_occurred_at
  )
  returning id
  into v_movement_id;


  return v_movement_id;
end;
$function$
;

-- save_client_delivery
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
    and snapshot.machine_id = p_machine_id
    and snapshot.recorded_by = v_user_id;


  if v_snapshot_id is null then
    raise exception
      'A synced client reserve count is required before delivery';
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
  on conflict (source_visit_id)
  do update set
    reserve_snapshot_id = excluded.reserve_snapshot_id,
    client_id = excluded.client_id,
    stop_id = excluded.stop_id,
    machine_id = excluded.machine_id,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  where client_deliveries.delivered_by = v_user_id
  returning id into v_delivery_id;


  if v_delivery_id is null then
    raise exception
      'This delivery belongs to another user';
  end if;


  ----------------------------------------------------------
  -- Important:
  --
  -- Movement rows are immutable. Therefore a FLOW-17
  -- delivery that already created movements must not be
  -- silently rewritten.
  ----------------------------------------------------------

  if exists (
    select 1
    from public.client_delivery_items
    where delivery_id = v_delivery_id
      and movement_id is not null
  ) then
    raise exception
      'This client delivery has already been synchronized';
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
$function$
;

-- save_machine_refill
CREATE OR REPLACE FUNCTION public.save_machine_refill(p_source_visit_id text, p_client_id uuid, p_stop_id uuid, p_machine_id uuid, p_confirmed_at timestamp with time zone, p_items jsonb)
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
  on conflict (source_visit_id)
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

-- CREATE OR REPLACE FUNCTION retains existing function privileges.

-- Additional snapshot, audit, and restock write paths.

-- save_client_reserve_after_service
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

  if p_machine_id is null then
    raise exception 'A machine ID is required';
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
      and s.machine_id = p_machine_id
      and r.driver_id = v_user_id
  ) then
    raise exception
      'The service stop is not assigned to the current driver';
  end if;


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
    and snapshot.machine_id = p_machine_id
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
    and delivery.machine_id = p_machine_id
    and delivery.delivered_by = v_user_id
  limit 1;

  if v_delivery_id is null then
    raise exception
      'A synced client delivery for the before-service reserve snapshot is required';
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
    and snapshot.machine_id = p_machine_id
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

-- save_inventory_audit
CREATE OR REPLACE FUNCTION public.save_inventory_audit(p_source_visit_id text, p_client_id uuid, p_stop_id uuid, p_machine_id uuid, p_counted_at timestamp with time zone, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  saved_audit_id uuid;
  audit_item jsonb;
  parsed_product_id uuid;
  parsed_quantity numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_source_visit_id is null
    or length(trim(p_source_visit_id)) = 0 then
    raise exception 'A service visit ID is required';
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one inventory count is required';
  end if;

  insert into public.inventory_audits (
    source_visit_id,
    client_id,
    stop_id,
    machine_id,
    counted_by,
    counted_at
  )
  values (
    trim(p_source_visit_id),
    p_client_id,
    p_stop_id,
    p_machine_id,
    auth.uid(),
    p_counted_at
  )
  on conflict (source_visit_id)
  do update set
    client_id = excluded.client_id,
    stop_id = excluded.stop_id,
    machine_id = excluded.machine_id,
    counted_at = excluded.counted_at,
    updated_at = now()
  where inventory_audits.counted_by = auth.uid()
  returning id into saved_audit_id;

  if saved_audit_id is null then
    raise exception 'This visit audit belongs to another user';
  end if;

  for audit_item in
    select value from jsonb_array_elements(p_items)
  loop
    parsed_product_id :=
      (audit_item ->> 'product_id')::uuid;

    parsed_quantity :=
      (audit_item ->> 'quantity')::numeric;

    if parsed_quantity < 0 then
      raise exception 'Inventory quantities cannot be negative';
    end if;

    perform public.assert_inventory_quantity_precision(
      parsed_quantity,
      'Inventory audit quantity'
    );

    if not exists (
      select 1
      from public.client_inventory_products cip
      where cip.client_id = p_client_id
        and cip.product_id = parsed_product_id
        and cip.is_active = true
    ) then
      raise exception
        'Product % is not configured for this client',
        parsed_product_id;
    end if;

    insert into public.inventory_audit_items (
      audit_id,
      product_id,
      quantity
    )
    values (
      saved_audit_id,
      parsed_product_id,
      parsed_quantity
    )
    on conflict (audit_id, product_id)
    do update set
      quantity = excluded.quantity,
      updated_at = now();
  end loop;

  delete from public.inventory_audit_items existing_item
  where existing_item.audit_id = saved_audit_id
    and not exists (
      select 1
      from jsonb_array_elements(p_items) supplied_item
      where (supplied_item ->> 'product_id')::uuid =
        existing_item.product_id
    );

  return saved_audit_id;
end;
$function$;

-- save_inventory_restock_drop
CREATE OR REPLACE FUNCTION public.save_inventory_restock_drop(p_source_visit_id text, p_audit_id uuid, p_client_id uuid, p_stop_id uuid, p_machine_id uuid, p_confirmed_at timestamp with time zone, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  saved_drop_id uuid;
  restock_item jsonb;

  parsed_product_id uuid;
  parsed_actual_quantity numeric;

  audit_quantity numeric;
  configured_par_level numeric;
  calculated_recommended_quantity numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_source_visit_id is null
    or length(trim(p_source_visit_id)) = 0 then
    raise exception 'A service visit ID is required';
  end if;

  /*
   * FLOW-14:
   *
   * p_items must still be a JSON array, but an empty
   * array is now valid and means "No refill needed".
   */
  if p_items is null
    or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Restock items must be a JSON array';
  end if;

  if not exists (
    select 1
    from public.inventory_audits audit
    where audit.id = p_audit_id
      and audit.source_visit_id = trim(p_source_visit_id)
      and audit.client_id = p_client_id
      and audit.stop_id = p_stop_id
      and audit.machine_id = p_machine_id
      and audit.counted_by = auth.uid()
  ) then
    raise exception
      'A synced inventory audit for this visit is required';
  end if;

  /*
   * Always create the parent confirmation.
   *
   * This is important even when p_items = [] because it
   * records that the driver completed the refill step and
   * confirmed that no refill was necessary.
   */
  insert into public.inventory_restock_drops (
    source_visit_id,
    audit_id,
    client_id,
    stop_id,
    machine_id,
    source_driver_id,
    confirmed_at
  )
  values (
    trim(p_source_visit_id),
    p_audit_id,
    p_client_id,
    p_stop_id,
    p_machine_id,
    auth.uid(),
    p_confirmed_at
  )
  on conflict (source_visit_id)
  do update set
    audit_id = excluded.audit_id,
    client_id = excluded.client_id,
    stop_id = excluded.stop_id,
    machine_id = excluded.machine_id,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  where inventory_restock_drops.source_driver_id = auth.uid()
  returning id into saved_drop_id;

  if saved_drop_id is null then
    raise exception
      'This visit restock confirmation belongs to another user';
  end if;

  /*
   * For p_items = [], this loop simply performs zero
   * iterations.
   */
  for restock_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    parsed_product_id :=
      (restock_item ->> 'product_id')::uuid;

    parsed_actual_quantity :=
      (restock_item ->> 'actual_quantity')::numeric;

    if parsed_actual_quantity < 0 then
      raise exception
        'Actual restock quantities cannot be negative';
    end if;

    perform public.assert_inventory_quantity_precision(
      parsed_actual_quantity,
      'Actual restock quantity'
    );

    select
      audit_item.quantity,
      client_product.par_level
    into
      audit_quantity,
      configured_par_level
    from public.inventory_audit_items audit_item
    join public.inventory_audits audit
      on audit.id = audit_item.audit_id
    join public.client_inventory_products client_product
      on client_product.client_id = audit.client_id
      and client_product.product_id = audit_item.product_id
      and client_product.is_active = true
    where audit_item.audit_id = p_audit_id
      and audit_item.product_id = parsed_product_id;

    if audit_quantity is null then
      raise exception
        'Product % was not included in the inventory audit',
        parsed_product_id;
    end if;

    if configured_par_level is null then
      raise exception
        'Product % does not have a configured par level',
        parsed_product_id;
    end if;

    calculated_recommended_quantity :=
      greatest(
        configured_par_level - audit_quantity,
        0
      );

    perform public.assert_inventory_quantity_precision(
      calculated_recommended_quantity,
      'Recommended restock quantity'
    );

    /*
     * FLOW-14:
     *
     * The client should only submit products that actually
     * require refill.
     */
    if calculated_recommended_quantity <= 0 then
      raise exception
        'Product % does not require refill',
        parsed_product_id;
    end if;

    insert into public.inventory_restock_drop_items (
      restock_drop_id,
      product_id,
      counted_quantity,
      par_level,
      recommended_quantity,
      actual_quantity
    )
    values (
      saved_drop_id,
      parsed_product_id,
      audit_quantity,
      configured_par_level,
      calculated_recommended_quantity,
      parsed_actual_quantity
    )
    on conflict (
      restock_drop_id,
      product_id
    )
    do update set
      counted_quantity =
        excluded.counted_quantity,
      par_level =
        excluded.par_level,
      recommended_quantity =
        excluded.recommended_quantity,
      actual_quantity =
        excluded.actual_quantity,
      updated_at = now();
  end loop;

  /*
   * Remove items that are no longer part of the
   * confirmation.
   *
   * When p_items = [], every existing child item for this
   * drop is removed.
   */
  delete from public.inventory_restock_drop_items existing_item
  where existing_item.restock_drop_id = saved_drop_id
    and not exists (
      select 1
      from jsonb_array_elements(p_items) supplied_item
      where
        (supplied_item ->> 'product_id')::uuid =
          existing_item.product_id
    );

  return saved_drop_id;
end;
$function$;
