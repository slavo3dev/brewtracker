------------------------------------------------------------
-- FLOW-17
-- Recommended & Actual Client Delivery
------------------------------------------------------------

create table public.client_deliveries (
  id uuid primary key default gen_random_uuid(),

  source_visit_id text not null unique,

  reserve_snapshot_id uuid not null
    references public.client_reserve_snapshots(id)
    on delete restrict,

  client_id uuid not null
    references public.clients(id)
    on delete restrict,

  stop_id uuid not null
    references public.stops(id)
    on delete restrict,

  machine_id uuid not null
    references public.machines(id)
    on delete restrict,

  delivered_by uuid not null
    references public.users(id)
    on delete restrict,

  confirmed_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table public.client_delivery_items (
  id uuid primary key default gen_random_uuid(),

  delivery_id uuid not null
    references public.client_deliveries(id)
    on delete cascade,

  product_id uuid not null
    references public.inventory_products(id)
    on delete restrict,

  reserve_before_quantity numeric(12, 3) not null,

  par_level numeric(12, 3) not null,

  recommended_quantity numeric(12, 3) not null,

  actual_quantity numeric(12, 3) not null,

  normalized_unit text not null,

  entered_issue_quantity numeric(12, 3) not null default 0,
  entered_loose_quantity numeric(12, 3) not null default 0,

  base_unit_snapshot text not null,
  issue_unit_snapshot text not null,
  units_per_issue_unit_snapshot numeric not null,
  package_description_snapshot text,

  movement_id uuid
    references public.inventory_movements(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  constraint client_delivery_items_unique_product
    unique (delivery_id, product_id),

  constraint client_delivery_items_quantities_nonnegative
    check (
      reserve_before_quantity >= 0
      and par_level >= 0
      and recommended_quantity >= 0
      and actual_quantity >= 0
      and entered_issue_quantity >= 0
      and entered_loose_quantity >= 0
    )
);


------------------------------------------------------------
-- RLS
------------------------------------------------------------

alter table public.client_deliveries
enable row level security;

alter table public.client_delivery_items
enable row level security;


create policy "Drivers can read own client deliveries"
on public.client_deliveries
for select
to authenticated
using (
  delivered_by = auth.uid()
);


create policy "Drivers can read own client delivery items"
on public.client_delivery_items
for select
to authenticated
using (
  exists (
    select 1
    from public.client_deliveries delivery
    where delivery.id =
      client_delivery_items.delivery_id
      and delivery.delivered_by = auth.uid()
  )
);


------------------------------------------------------------
-- Save client delivery
------------------------------------------------------------

create or replace function public.save_client_delivery(
  p_source_visit_id text,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_confirmed_at timestamptz,
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
$$;


revoke all
on function public.save_client_delivery(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
)
from public;


grant execute
on function public.save_client_delivery(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
)
to authenticated;