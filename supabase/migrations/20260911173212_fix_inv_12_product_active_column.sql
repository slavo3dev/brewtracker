------------------------------------------------------------
-- INV-12 FIX
-- Correct inventory_products active column.
--
-- inventory_products uses `is_active`, not `active`.
-- No change to the INV-12 RPC contract or transfer logic.
------------------------------------------------------------

create or replace function public.record_warehouse_driver_transfer(
  p_movement_type public.inventory_movement_type,
  p_warehouse_id uuid,
  p_driver_id uuid,
  p_product_id uuid,
  p_issue_quantity numeric,
  p_loose_quantity numeric,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;


------------------------------------------------------------
-- Permissions
------------------------------------------------------------

revoke all
on function public.record_warehouse_driver_transfer(
  public.inventory_movement_type,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  timestamptz
)
from public;


grant execute
on function public.record_warehouse_driver_transfer(
  public.inventory_movement_type,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  timestamptz
)
to authenticated;


comment on function public.record_warehouse_driver_transfer(
  public.inventory_movement_type,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  timestamptz
) is
'INV-12 validated Warehouse <-> Driver inventory transfer workflow. Creates immutable warehouse_issue or warehouse_return ledger movements.';