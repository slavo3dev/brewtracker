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
    and delivery.machine_id = p_machine_id
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
