------------------------------------------------------------
-- INV-5
-- Fix Inventory Reconciliation Authorization
--
-- Reconciliation mutations follow the same authorization
-- model as INV-12:
--
-- 1. RPC is executable by authenticated users.
-- 2. RPC resolves the actor from auth.uid().
-- 3. Only active CEO / Manager users may mutate
--    reconciliation state.
------------------------------------------------------------


------------------------------------------------------------
-- CREATE RECONCILIATION
------------------------------------------------------------

create or replace function public.create_driver_inventory_reconciliation(
  p_driver_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role public.app_role;

  v_inventory_location_id uuid;
  v_reconciliation_id uuid;
  v_counted_at timestamptz := now();

  v_item jsonb;

  v_product_id uuid;
  v_physical_quantity numeric;
  v_reason text;

  v_expected record;

  v_base_unit text;
  v_issue_unit text;
  v_units_per_issue_unit numeric;
  v_package_description text;
begin
  ----------------------------------------------------------
  -- Authentication
  ----------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;


  ----------------------------------------------------------
  -- Admin authorization
  ----------------------------------------------------------

  select u.role
  into v_user_role
  from public.users u
  where u.id = v_user_id
    and u.is_active = true;


  if v_user_role is null then
    raise exception 'The current user profile could not be found';
  end if;


  if v_user_role not in ('ceo', 'manager') then
    raise exception
      'Only administrators may create inventory reconciliations';
  end if;


  ----------------------------------------------------------
  -- Validate input
  ----------------------------------------------------------

  if p_driver_id is null then
    raise exception 'A driver is required';
  end if;


  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception
      'At least one reconciliation item is required';
  end if;


  ----------------------------------------------------------
  -- Resolve driver inventory location
  ----------------------------------------------------------

  select il.id
  into v_inventory_location_id
  from public.inventory_locations il
  where il.location_type = 'driver'
    and il.driver_id = p_driver_id;


  if v_inventory_location_id is null then
    raise exception
      'The driver inventory location could not be found';
  end if;


  ----------------------------------------------------------
  -- Only one open draft per driver location
  ----------------------------------------------------------

  if exists (
    select 1
    from public.inventory_reconciliations ir
    where ir.inventory_location_id = v_inventory_location_id
      and ir.status = 'draft'
  ) then
    raise exception
      'A draft reconciliation already exists for this driver';
  end if;


  ----------------------------------------------------------
  -- Create reconciliation header
  ----------------------------------------------------------

  insert into public.inventory_reconciliations (
    inventory_location_id,
    driver_id,
    status,
    notes,
    counted_by,
    counted_at
  )
  values (
    v_inventory_location_id,
    p_driver_id,
    'draft',
    nullif(trim(p_notes), ''),
    v_user_id,
    v_counted_at
  )
  returning id
  into v_reconciliation_id;


  ----------------------------------------------------------
  -- Create reconciliation items
  ----------------------------------------------------------

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    begin
      v_product_id :=
        (v_item ->> 'product_id')::uuid;

      v_physical_quantity :=
        (v_item ->> 'physical_quantity')::numeric;

      v_reason :=
        nullif(trim(v_item ->> 'reason'), '');

    exception
      when others then
        raise exception
          'Invalid reconciliation item';
    end;


    if v_product_id is null then
      raise exception
        'A product is required for every reconciliation item';
    end if;


    if v_physical_quantity is null
       or v_physical_quantity < 0 then
      raise exception
        'Physical quantity must be zero or greater';
    end if;


    --------------------------------------------------------
    -- Expected balance at the exact physical-count
    -- checkpoint.
    --------------------------------------------------------

    select *
    into v_expected
    from public.get_driver_inventory_expected_balance(
      p_driver_id,
      v_product_id,
      v_counted_at
    );


    --------------------------------------------------------
    -- Product packaging snapshot
    --------------------------------------------------------

    select
      ip.base_unit,
      ip.issue_unit,
      ip.units_per_issue_unit,
      ip.package_description
    into
      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description
    from public.inventory_products ip
    where ip.id = v_product_id
      and ip.is_active = true;


    if not found then
      raise exception
        'Inventory product % could not be found',
        v_product_id;
    end if;


    --------------------------------------------------------
    -- Save item
    --------------------------------------------------------

    insert into public.inventory_reconciliation_items (
      reconciliation_id,
      product_id,
      expected_quantity,
      physical_quantity,
      normalized_unit,
      reason,
      base_unit_snapshot,
      issue_unit_snapshot,
      units_per_issue_unit_snapshot,
      package_description_snapshot
    )
    values (
      v_reconciliation_id,
      v_product_id,
      case
        when v_expected.has_baseline
          then v_expected.expected_quantity
        else null
      end,
      v_physical_quantity,
      v_base_unit,
      v_reason,
      v_base_unit,
      v_issue_unit,
      v_units_per_issue_unit,
      v_package_description
    );

  end loop;


  return v_reconciliation_id;
end;
$$;


------------------------------------------------------------
-- CONFIRM RECONCILIATION
------------------------------------------------------------

create or replace function public.confirm_driver_inventory_reconciliation(
  p_reconciliation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role public.app_role;

  v_reconciliation public.inventory_reconciliations%rowtype;
begin
  ----------------------------------------------------------
  -- Authentication
  ----------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;


  ----------------------------------------------------------
  -- Admin authorization
  ----------------------------------------------------------

  select u.role
  into v_user_role
  from public.users u
  where u.id = v_user_id
    and u.is_active = true;


  if v_user_role is null then
    raise exception 'The current user profile could not be found';
  end if;


  if v_user_role not in ('ceo', 'manager') then
    raise exception
      'Only administrators may confirm inventory reconciliations';
  end if;


  ----------------------------------------------------------
  -- Lock reconciliation
  ----------------------------------------------------------

  select *
  into v_reconciliation
  from public.inventory_reconciliations
  where id = p_reconciliation_id
  for update;


  if not found then
    raise exception
      'Inventory reconciliation could not be found';
  end if;


  if v_reconciliation.status <> 'draft' then
    raise exception
      'Only draft inventory reconciliations may be confirmed';
  end if;


  ----------------------------------------------------------
  -- Must contain at least one item
  ----------------------------------------------------------

  if not exists (
    select 1
    from public.inventory_reconciliation_items
    where reconciliation_id = p_reconciliation_id
  ) then
    raise exception
      'The inventory reconciliation does not contain any items';
  end if;


  ----------------------------------------------------------
  -- Confirm
  ----------------------------------------------------------

  update public.inventory_reconciliations
  set
    status = 'confirmed',
    confirmed_by = v_user_id,
    confirmed_at = now(),
    updated_at = now()
  where id = p_reconciliation_id;
end;
$$;


------------------------------------------------------------
-- Permissions
------------------------------------------------------------

revoke all
on function public.create_driver_inventory_reconciliation(
  uuid,
  jsonb,
  text
)
from public;


revoke all
on function public.confirm_driver_inventory_reconciliation(
  uuid
)
from public;


grant execute
on function public.create_driver_inventory_reconciliation(
  uuid,
  jsonb,
  text
)
to authenticated;


grant execute
on function public.confirm_driver_inventory_reconciliation(
  uuid
)
to authenticated;