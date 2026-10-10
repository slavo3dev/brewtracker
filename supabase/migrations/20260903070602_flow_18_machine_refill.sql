------------------------------------------------------------
-- FLOW-18
-- Machine Refill Quantity Workflow
--
-- Physical custody:
--
--   Driver / Van -> Machine
--
-- Client delivery remains a separate movement:
--
--   Driver / Van -> Client Reserve
--
-- Machine refill MUST NOT reduce client reserve.
------------------------------------------------------------


------------------------------------------------------------
-- 1. UPDATE MACHINE REFILL CUSTODY RULE
--
-- INV-9 originally defined:
--
--   Client Reserve -> Machine
--
-- The approved service workflow defines machine refill as:
--
--   Driver / Van -> Machine
--
-- CREATE OR REPLACE keeps the existing trigger attached.
------------------------------------------------------------

create or replace function public.validate_inventory_movement_path()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_type public.inventory_location_type;
  destination_type public.inventory_location_type;
begin

  ----------------------------------------------------------
  -- Adjustment
  ----------------------------------------------------------

  if new.movement_type = 'adjustment' then
    raise exception
      'Inventory adjustments must use the dedicated reconciliation workflow.';
  end if;


  ----------------------------------------------------------
  -- Physical movements require both sides
  ----------------------------------------------------------

  if new.from_location_id is null
    or new.to_location_id is null then

    raise exception
      'Physical inventory movements require both source and destination locations.';

  end if;


  ----------------------------------------------------------
  -- Load location types
  ----------------------------------------------------------

  select location_type
  into source_type
  from public.inventory_locations
  where id = new.from_location_id;


  select location_type
  into destination_type
  from public.inventory_locations
  where id = new.to_location_id;


  if source_type is null
    or destination_type is null then

    raise exception
      'Inventory movement contains an invalid inventory location.';

  end if;


  ----------------------------------------------------------
  -- Warehouse -> Driver
  ----------------------------------------------------------

  if new.movement_type = 'warehouse_issue' then

    if source_type <> 'warehouse'
      or destination_type <> 'driver' then

      raise exception
        'warehouse_issue must move inventory from warehouse to driver.';

    end if;


  ----------------------------------------------------------
  -- Driver -> Client Reserve
  ----------------------------------------------------------

  elsif new.movement_type = 'client_delivery' then

    if source_type <> 'driver'
      or destination_type <> 'client_reserve' then

      raise exception
        'client_delivery must move inventory from driver to client reserve.';

    end if;


  ----------------------------------------------------------
  -- FLOW-18
  -- Driver -> Machine
  ----------------------------------------------------------

  elsif new.movement_type = 'machine_refill' then

    if source_type <> 'driver'
      or destination_type <> 'machine' then

      raise exception
        'machine_refill must move inventory from driver to machine.';

    end if;


  ----------------------------------------------------------
  -- Driver -> Warehouse
  ----------------------------------------------------------

  elsif new.movement_type = 'warehouse_return' then

    if source_type <> 'driver'
      or destination_type <> 'warehouse' then

      raise exception
        'warehouse_return must move inventory from driver to warehouse.';

    end if;

  end if;


  return new;
end;
$$;


------------------------------------------------------------
-- 2. MACHINE REFILL CONFIRMATION
------------------------------------------------------------

create table public.machine_refills (
  id uuid primary key default gen_random_uuid(),

  source_visit_id text not null unique,

  client_id uuid not null
    references public.clients(id)
    on delete restrict,

  stop_id uuid not null
    references public.stops(id)
    on delete restrict,

  machine_id uuid not null
    references public.machines(id)
    on delete restrict,

  refilled_by uuid not null
    references public.users(id)
    on delete restrict,

  confirmed_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


------------------------------------------------------------
-- 3. MACHINE REFILL ITEMS
------------------------------------------------------------

create table public.machine_refill_items (
  id uuid primary key default gen_random_uuid(),

  machine_refill_id uuid not null
    references public.machine_refills(id)
    on delete cascade,

  product_id uuid not null
    references public.inventory_products(id)
    on delete restrict,

  actual_quantity numeric(12, 3) not null,

  normalized_unit text not null,

  entered_issue_quantity numeric(12, 3)
    not null
    default 0,

  entered_loose_quantity numeric(12, 3)
    not null
    default 0,

  base_unit_snapshot text not null,

  issue_unit_snapshot text not null,

  units_per_issue_unit_snapshot numeric not null,

  package_description_snapshot text,

  movement_id uuid
    references public.inventory_movements(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  constraint machine_refill_items_unique_product
    unique (
      machine_refill_id,
      product_id
    ),

  constraint machine_refill_items_quantities_nonnegative
    check (
      actual_quantity >= 0
      and entered_issue_quantity >= 0
      and entered_loose_quantity >= 0
    ),

  constraint machine_refill_items_normalized_unit_not_blank
    check (
      length(trim(normalized_unit)) > 0
    ),

  constraint machine_refill_items_base_unit_not_blank
    check (
      length(trim(base_unit_snapshot)) > 0
    ),

  constraint machine_refill_items_issue_unit_not_blank
    check (
      length(trim(issue_unit_snapshot)) > 0
    ),

  constraint machine_refill_items_conversion_positive
    check (
      units_per_issue_unit_snapshot > 0
    ),

  constraint machine_refill_items_package_description_not_blank
    check (
      package_description_snapshot is null
      or length(
        trim(package_description_snapshot)
      ) > 0
    )
);


------------------------------------------------------------
-- 4. INDEXES
------------------------------------------------------------

create index machine_refills_driver_time_idx
on public.machine_refills (
  refilled_by,
  confirmed_at desc
);


create index machine_refills_stop_idx
on public.machine_refills (stop_id);


create index machine_refills_machine_idx
on public.machine_refills (machine_id);


create index machine_refill_items_product_idx
on public.machine_refill_items (product_id);


------------------------------------------------------------
-- 5. RLS
------------------------------------------------------------

alter table public.machine_refills
enable row level security;


alter table public.machine_refill_items
enable row level security;


create policy "Drivers can read own machine refills"
on public.machine_refills
for select
to authenticated
using (
  refilled_by = auth.uid()
);


create policy "Drivers can read own machine refill items"
on public.machine_refill_items
for select
to authenticated
using (
  exists (
    select 1
    from public.machine_refills refill
    where refill.id =
      machine_refill_items.machine_refill_id
      and refill.refilled_by = auth.uid()
  )
);


------------------------------------------------------------
-- 6. SAVE MACHINE REFILL
------------------------------------------------------------

create or replace function public.save_machine_refill(
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
  --
  -- Same authorization model as FLOW-17.
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
  -- IMPORTANT:
  --
  -- We only require the confirmation because FLOW-18 occurs
  -- after FLOW-17 in the workflow.
  --
  -- We DO NOT use client delivery inventory as the source
  -- of the machine refill.
  --
  -- Zero client delivery is valid.
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
  -- FLOW-18:
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
  -- Ledger movements are immutable.
  --
  -- Once a refill has produced a movement we cannot silently
  -- replace it by deleting/recreating the refill.
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
  -- Remove an earlier zero-only/pending confirmation.
  --
  -- This is safe because no immutable movement exists.
  ----------------------------------------------------------

  delete from public.machine_refill_items
  where machine_refill_id =
    v_refill_id;


  ----------------------------------------------------------
  -- Process machine refill quantities
  ----------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

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


    --------------------------------------------------------
    -- Create immutable custody movement for positive refill.
    --
    -- DRIVER -> MACHINE
    --
    -- Zero is still a valid explicit refill confirmation,
    -- but zero movements are not inserted because INV-9
    -- requires normalized_quantity > 0.
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


    else

      v_movement_id := null;

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

      v_movement_id
    );

  end loop;


  return v_refill_id;

end;
$$;


------------------------------------------------------------
-- 7. RPC PERMISSIONS
------------------------------------------------------------

revoke all
on function public.save_machine_refill(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
)
from public;


grant execute
on function public.save_machine_refill(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
)
to authenticated;


------------------------------------------------------------
-- 8. DOCUMENTATION
------------------------------------------------------------

comment on table public.machine_refills is
'FLOW-18 service-visit confirmation recording inventory put directly from driver/van custody into a machine.';


comment on table public.machine_refill_items is
'FLOW-18 per-product actual machine refill quantities and associated immutable inventory movement.';


------------------------------------------------------------
-- END FLOW-18
------------------------------------------------------------