------------------------------------------------------------
-- FLOW-18 QA FIXES
--
-- Fixes:
--
-- QA #2
-- Optional reason capture when a product receives
-- zero machine refill quantity.
--
-- QA #3
-- Machine-refilled state remains derived from actual
-- quantities instead of storing a duplicated boolean.
--
-- Existing custody remains:
--
--   Driver / Van -> Machine
--
-- Existing FLOW-18 inventory movement behavior is preserved.
------------------------------------------------------------


------------------------------------------------------------
-- 1. ADD ZERO-REFILL REASON FIELDS
------------------------------------------------------------

alter table public.machine_refill_items
add column if not exists zero_reason text;


alter table public.machine_refill_items
add column if not exists zero_reason_note text;


------------------------------------------------------------
-- 2. VALID ZERO-REFILL REASONS
--
-- Reason is optional.
--
-- Supported values:
--
--   refill_not_required
--   product_unavailable
--   machine_issue
--   other
------------------------------------------------------------

alter table public.machine_refill_items
drop constraint if exists
  machine_refill_items_zero_reason_check;


alter table public.machine_refill_items
add constraint
  machine_refill_items_zero_reason_check
check (
  zero_reason is null
  or zero_reason in (
    'refill_not_required',
    'product_unavailable',
    'machine_issue',
    'other'
  )
);


------------------------------------------------------------
-- 3. REASON IS ONLY VALID FOR ZERO QUANTITY
--
-- Positive refill:
--
--   actual_quantity > 0
--   zero_reason = null
--   zero_reason_note = null
--
-- Zero refill:
--
--   reason may be null because capture is optional.
------------------------------------------------------------

alter table public.machine_refill_items
drop constraint if exists
  machine_refill_items_zero_reason_quantity_check;


alter table public.machine_refill_items
add constraint
  machine_refill_items_zero_reason_quantity_check
check (
  actual_quantity = 0
  or (
    zero_reason is null
    and zero_reason_note is null
  )
);


------------------------------------------------------------
-- 4. NOTES ONLY APPLY TO "OTHER"
------------------------------------------------------------

alter table public.machine_refill_items
drop constraint if exists
  machine_refill_items_zero_reason_note_check;


alter table public.machine_refill_items
add constraint
  machine_refill_items_zero_reason_note_check
check (
  zero_reason = 'other'
  or zero_reason_note is null
);


------------------------------------------------------------
-- 5. "OTHER" REQUIRES A DESCRIPTION
------------------------------------------------------------

alter table public.machine_refill_items
drop constraint if exists
  machine_refill_items_other_reason_note_check;


alter table public.machine_refill_items
add constraint
  machine_refill_items_other_reason_note_check
check (
  zero_reason is distinct from 'other'
  or nullif(
    trim(zero_reason_note),
    ''
  ) is not null
);


------------------------------------------------------------
-- 6. DERIVED MACHINE-REFILLED STATUS
--
-- We intentionally do NOT add:
--
--   machine_refilled boolean
--
-- because actual_quantity is already the source of truth.
--
-- true:
--   at least one item has actual_quantity > 0
--
-- false:
--   no item has actual_quantity > 0
------------------------------------------------------------

create or replace function
public.was_machine_refilled(
  p_machine_refill_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.machine_refill_items item
    where item.machine_refill_id =
        p_machine_refill_id
      and item.actual_quantity > 0
  );
$$;


------------------------------------------------------------
-- 7. UPDATE SAVE MACHINE REFILL RPC
--
-- Existing FLOW-18 behavior is preserved:
--
--   Driver / Van -> Machine
--
-- Positive quantities create immutable inventory movements.
--
-- Zero quantities create a machine_refill_item but DO NOT
-- create an inventory movement.
--
-- New behavior:
--
-- Zero quantities may optionally include:
--
--   zero_reason
--   zero_reason_note
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
$$;


------------------------------------------------------------
-- 8. RPC PERMISSIONS
--
-- Re-assert permissions after replacing the function.
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
-- 9. DERIVED STATUS FUNCTION PERMISSIONS
------------------------------------------------------------

revoke all
on function public.was_machine_refilled(uuid)
from public;


grant execute
on function public.was_machine_refilled(uuid)
to authenticated;


------------------------------------------------------------
-- 10. DOCUMENTATION
------------------------------------------------------------

comment on column
public.machine_refill_items.zero_reason is
'Optional reason explaining why no quantity of this product was placed into the machine.';


comment on column
public.machine_refill_items.zero_reason_note is
'Explanation required when zero_reason is other.';


comment on function
public.was_machine_refilled(uuid) is
'Returns true when at least one item in a machine refill has actual_quantity greater than zero.';


------------------------------------------------------------
-- END FLOW-18 QA FIXES
------------------------------------------------------------