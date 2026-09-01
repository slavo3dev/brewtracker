------------------------------------------------------------
-- FLOW-16
-- Client Reserve Before Service
------------------------------------------------------------

create or replace function public.save_client_reserve_before_service(
  p_source_visit_id text,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_recorded_at timestamptz,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot_id uuid;

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

  v_normalized_quantity numeric;
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

  if p_recorded_at is null then
    raise exception 'A recorded timestamp is required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception
      'At least one client reserve quantity is required';
  end if;


  ----------------------------------------------------------
  -- Validate stop / route / driver / client / machine
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
  -- Machine must belong to client
  ----------------------------------------------------------

  if not exists (
    select 1
    from public.machines m
    where m.id = p_machine_id
      and m.client_id = p_client_id
  ) then
    raise exception
      'The selected machine does not belong to this client';
  end if;


  ----------------------------------------------------------
  -- Create / obtain before-service snapshot
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
    'before_service',
    v_user_id,
    p_recorded_at
  )
  on conflict (
    source_visit_id,
    stage
  )
  do update set
    client_id = excluded.client_id,
    stop_id = excluded.stop_id,
    machine_id = excluded.machine_id,
    recorded_at = excluded.recorded_at
  where
    client_reserve_snapshots.recorded_by = v_user_id
  returning id
  into v_snapshot_id;


  if v_snapshot_id is null then
    raise exception
      'This client reserve snapshot belongs to another user';
  end if;


  ----------------------------------------------------------
  -- Save items
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
          'Invalid client reserve item';
    end;


    if v_issue_quantity < 0
       or v_loose_quantity < 0 then
      raise exception
        'Client reserve quantities cannot be negative';
    end if;


    --------------------------------------------------------
    -- Product must be configured for this client
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
      and cip.client_id = p_client_id
      and cip.is_active = true;


    if not found then
      raise exception
        'Product % is not configured for this client',
        v_product_id;
    end if;


    --------------------------------------------------------
    -- Issue units are whole packages/cases
    --------------------------------------------------------

    if trunc(v_issue_quantity)
       <> v_issue_quantity then
      raise exception
        'Issue quantity must be a whole number';
    end if;


    --------------------------------------------------------
    -- Loose-unit rules
    --------------------------------------------------------

    if v_loose_quantity > 0
       and not v_allows_loose_units then
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
    -- Normalize
    --------------------------------------------------------

    v_normalized_quantity :=
      (
        v_issue_quantity
        * v_units_per_issue_unit
      )
      + v_loose_quantity;


    --------------------------------------------------------
    -- Upsert snapshot item
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
    on conflict (
      snapshot_id,
      product_id
    )
    do update set
      normalized_quantity =
        excluded.normalized_quantity,

      normalized_unit =
        excluded.normalized_unit,

      entered_issue_quantity =
        excluded.entered_issue_quantity,

      entered_loose_quantity =
        excluded.entered_loose_quantity,

      base_unit_snapshot =
        excluded.base_unit_snapshot,

      issue_unit_snapshot =
        excluded.issue_unit_snapshot,

      units_per_issue_unit_snapshot =
        excluded.units_per_issue_unit_snapshot,

      package_description_snapshot =
        excluded.package_description_snapshot;

  end loop;


  ----------------------------------------------------------
  -- Remove items no longer supplied during retry/edit
  ----------------------------------------------------------

  delete
  from public.client_reserve_snapshot_items existing
  where existing.snapshot_id = v_snapshot_id
    and not exists (
      select 1
      from jsonb_array_elements(p_items) supplied
      where
        (supplied ->> 'product_id')::uuid
          = existing.product_id
    );


  return v_snapshot_id;
end;
$$;


revoke all
on function public.save_client_reserve_before_service(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
)
from public;


grant execute
on function public.save_client_reserve_before_service(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
)
to authenticated;