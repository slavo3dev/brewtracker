-- ============================================================
-- INV-5
-- Inventory Reconciliation & Shrinkage Detection
-- ============================================================

create type public.inventory_reconciliation_status as enum (
  'draft',
  'confirmed'
);


-- ============================================================
-- RECONCILIATION HEADER
-- ============================================================

create table public.inventory_reconciliations (
  id uuid primary key default gen_random_uuid(),

  inventory_location_id uuid not null
    references public.inventory_locations(id),

  driver_id uuid not null
    references public.users(id),

  status public.inventory_reconciliation_status
    not null default 'draft',

  notes text,

  counted_by uuid not null
    references public.users(id),

  -- IMPORTANT:
  -- This is the accounting checkpoint timestamp.
  -- Future movement calculations start AFTER this timestamp.
  counted_at timestamptz not null default now(),

  confirmed_by uuid
    references public.users(id),

  confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_reconciliations_confirmation_check
    check (
      (
        status = 'draft'
        and confirmed_by is null
        and confirmed_at is null
      )
      or
      (
        status = 'confirmed'
        and confirmed_by is not null
        and confirmed_at is not null
      )
    )
);


-- ============================================================
-- RECONCILIATION ITEMS
-- ============================================================

create table public.inventory_reconciliation_items (
  id uuid primary key default gen_random_uuid(),

  reconciliation_id uuid not null
    references public.inventory_reconciliations(id)
    on delete cascade,

  product_id uuid not null
    references public.inventory_products(id),

  -- NULL on first-ever reconciliation because there is no
  -- trusted previous physical baseline.
  expected_quantity numeric,

  physical_quantity numeric not null,

  variance_quantity numeric generated always as (
    case
      when expected_quantity is null then null
      else physical_quantity - expected_quantity
    end
  ) stored,

  normalized_unit text not null,

  reason text,

  -- Historical packaging snapshot.
  base_unit_snapshot text not null,
  issue_unit_snapshot text not null,
  units_per_issue_unit_snapshot numeric not null,
  package_description_snapshot text,

  created_at timestamptz not null default now(),

  constraint inventory_reconciliation_expected_nonnegative
    check (
      expected_quantity is null
      or expected_quantity >= 0
    ),

  constraint inventory_reconciliation_physical_nonnegative
    check (physical_quantity >= 0),

  constraint inventory_reconciliation_unique_product
    unique (reconciliation_id, product_id)
);


-- ============================================================
-- INDEXES
-- ============================================================

create index inventory_reconciliations_location_counted_idx
  on public.inventory_reconciliations (
    inventory_location_id,
    counted_at desc
  );

create index inventory_reconciliations_driver_counted_idx
  on public.inventory_reconciliations (
    driver_id,
    counted_at desc
  );

create index inventory_reconciliation_items_product_idx
  on public.inventory_reconciliation_items(product_id);


-- ============================================================
-- EXPECTED DRIVER INVENTORY
-- ============================================================

create or replace function public.get_driver_inventory_expected_balance(
  p_driver_id uuid,
  p_product_id uuid,
  p_as_of timestamptz default now()
)
returns table (
  inventory_location_id uuid,
  product_id uuid,
  baseline_quantity numeric,
  baseline_at timestamptz,
  movement_delta numeric,
  expected_quantity numeric,
  normalized_unit text,
  has_baseline boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_baseline_quantity numeric;
  v_baseline_at timestamptz;
  v_movement_delta numeric;
  v_base_unit text;
begin
  -- Resolve driver inventory location.
  select il.id
  into v_location_id
  from public.inventory_locations il
  where il.location_type =
        'driver'::public.inventory_location_type
    and il.driver_id = p_driver_id
  limit 1;

  if v_location_id is null then
    raise exception
      'No driver inventory location exists for driver %.',
      p_driver_id;
  end if;


  -- Resolve product/base unit.
  select ip.base_unit
  into v_base_unit
  from public.inventory_products ip
  where ip.id = p_product_id;

  if v_base_unit is null then
    raise exception
      'Inventory product % does not exist.',
      p_product_id;
  end if;


  -- Find the latest confirmed physical checkpoint.
  --
  -- IMPORTANT:
  -- counted_at is used as the accounting boundary,
  -- NOT confirmed_at.
  select
    iri.physical_quantity,
    ir.counted_at
  into
    v_baseline_quantity,
    v_baseline_at
  from public.inventory_reconciliations ir
  join public.inventory_reconciliation_items iri
    on iri.reconciliation_id = ir.id
  where ir.inventory_location_id = v_location_id
    and ir.driver_id = p_driver_id
    and ir.status =
        'confirmed'::public.inventory_reconciliation_status
    and ir.counted_at <= p_as_of
    and iri.product_id = p_product_id
  order by
    ir.counted_at desc,
    ir.id desc
  limit 1;


  -- No trusted baseline yet.
  if v_baseline_at is null then
    return query
    select
      v_location_id,
      p_product_id,
      null::numeric,
      null::timestamptz,
      0::numeric,
      null::numeric,
      v_base_unit,
      false;

    return;
  end if;


  -- Calculate all inventory entering/leaving the driver
  -- after the physical checkpoint.
  select
    coalesce(
      sum(
        case
          when im.to_location_id = v_location_id
               and im.from_location_id = v_location_id
            then 0

          when im.to_location_id = v_location_id
            then im.normalized_quantity

          when im.from_location_id = v_location_id
            then -im.normalized_quantity

          else 0
        end
      ),
      0
    )
  into v_movement_delta
  from public.inventory_movements im
  where im.product_id = p_product_id
    and im.occurred_at > v_baseline_at
    and im.occurred_at <= p_as_of
    and (
      im.from_location_id = v_location_id
      or im.to_location_id = v_location_id
    );


  return query
  select
    v_location_id,
    p_product_id,
    v_baseline_quantity,
    v_baseline_at,
    v_movement_delta,
    v_baseline_quantity + v_movement_delta,
    v_base_unit,
    true;
end;
$$;


-- ============================================================
-- CREATE RECONCILIATION
--
-- Expected balance is calculated by the database.
--
-- Example p_items:
--
-- [
--   {
--     "product_id": "...",
--     "physical_quantity": 15,
--     "reason": null
--   }
-- ]
-- ============================================================

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
  v_current_user_id uuid;
  v_location_id uuid;
  v_reconciliation_id uuid;
  v_counted_at timestamptz := now();

  v_item jsonb;
  v_product_id uuid;
  v_physical_quantity numeric;
  v_reason text;

  v_expected_quantity numeric;
  v_normalized_unit text;

  v_product public.inventory_products%rowtype;
begin
  v_current_user_id := auth.uid();

  if v_current_user_id is null then
    raise exception 'Authentication is required.';
  end if;


  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception
      'At least one reconciliation item is required.';
  end if;


  -- Resolve driver inventory location.
  select il.id
  into v_location_id
  from public.inventory_locations il
  where il.location_type =
        'driver'::public.inventory_location_type
    and il.driver_id = p_driver_id
  limit 1;

  if v_location_id is null then
    raise exception
      'No driver inventory location exists for driver %.',
      p_driver_id;
  end if;


  -- Only one open draft per driver.
  if exists (
    select 1
    from public.inventory_reconciliations ir
    where ir.inventory_location_id = v_location_id
      and ir.status =
          'draft'::public.inventory_reconciliation_status
  ) then
    raise exception
      'A draft reconciliation already exists for this driver.';
  end if;


  insert into public.inventory_reconciliations (
    inventory_location_id,
    driver_id,
    status,
    notes,
    counted_by,
    counted_at
  )
  values (
    v_location_id,
    p_driver_id,
    'draft'::public.inventory_reconciliation_status,
    nullif(trim(p_notes), ''),
    v_current_user_id,
    v_counted_at
  )
  returning id
  into v_reconciliation_id;


  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    if not (v_item ? 'product_id') then
      raise exception
        'Each reconciliation item requires product_id.';
    end if;

    if not (v_item ? 'physical_quantity') then
      raise exception
        'Each reconciliation item requires physical_quantity.';
    end if;


    begin
      v_product_id :=
        (v_item ->> 'product_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception
          'Invalid reconciliation product_id.';
    end;


    begin
      v_physical_quantity :=
        (v_item ->> 'physical_quantity')::numeric;
    exception
      when invalid_text_representation then
        raise exception
          'Physical quantity must be numeric.';
    end;


    if v_physical_quantity is null
       or v_physical_quantity < 0 then
      raise exception
        'Physical quantity must be zero or greater.';
    end if;


    v_reason :=
      nullif(trim(v_item ->> 'reason'), '');


    select *
    into v_product
    from public.inventory_products ip
    where ip.id = v_product_id;

    if not found then
      raise exception
        'Inventory product % does not exist.',
        v_product_id;
    end if;


    select
      balance.expected_quantity,
      balance.normalized_unit
    into
      v_expected_quantity,
      v_normalized_unit
    from public.get_driver_inventory_expected_balance(
      p_driver_id,
      v_product_id,
      v_counted_at
    ) balance;


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
      v_expected_quantity,
      v_physical_quantity,
      v_normalized_unit,
      v_reason,
      v_product.base_unit,
      v_product.issue_unit,
      v_product.units_per_issue_unit,
      v_product.package_description
    );

  end loop;


  return v_reconciliation_id;
end;
$$;


-- ============================================================
-- CONFIRM RECONCILIATION
-- ============================================================

create or replace function public.confirm_driver_inventory_reconciliation(
  p_reconciliation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_reconciliation public.inventory_reconciliations%rowtype;
begin
  v_current_user_id := auth.uid();

  if v_current_user_id is null then
    raise exception 'Authentication is required.';
  end if;


  select *
  into v_reconciliation
  from public.inventory_reconciliations ir
  where ir.id = p_reconciliation_id
  for update;

  if not found then
    raise exception
      'Inventory reconciliation does not exist.';
  end if;


  if v_reconciliation.status <>
     'draft'::public.inventory_reconciliation_status then
    raise exception
      'Only draft reconciliations can be confirmed.';
  end if;


  if not exists (
    select 1
    from public.inventory_reconciliation_items iri
    where iri.reconciliation_id = p_reconciliation_id
  ) then
    raise exception
      'The reconciliation has no inventory items.';
  end if;


  update public.inventory_reconciliations
  set
    status =
      'confirmed'::public.inventory_reconciliation_status,
    confirmed_by = v_current_user_id,
    confirmed_at = now(),
    updated_at = now()
  where id = p_reconciliation_id;
end;
$$;


-- ============================================================
-- IMMUTABILITY
-- ============================================================

create or replace function public.prevent_confirmed_inventory_reconciliation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status =
     'confirmed'::public.inventory_reconciliation_status then
    raise exception
      'Confirmed inventory reconciliations are immutable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


create trigger prevent_confirmed_inventory_reconciliation_mutation
before update or delete
on public.inventory_reconciliations
for each row
execute function public.prevent_confirmed_inventory_reconciliation_mutation();


create or replace function public.prevent_confirmed_inventory_reconciliation_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.inventory_reconciliations ir
    where ir.id = old.reconciliation_id
      and ir.status =
          'confirmed'::public.inventory_reconciliation_status
  ) then
    raise exception
      'Items belonging to a confirmed inventory reconciliation are immutable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


create trigger prevent_confirmed_inventory_reconciliation_item_mutation
before update or delete
on public.inventory_reconciliation_items
for each row
execute function public.prevent_confirmed_inventory_reconciliation_item_mutation();


-- ============================================================
-- RLS
-- ============================================================

alter table public.inventory_reconciliations
  enable row level security;

alter table public.inventory_reconciliation_items
  enable row level security;


create policy "Managers can read inventory reconciliations"
on public.inventory_reconciliations
for select
to authenticated
using (
  public.is_manager()
);


create policy "Managers can read inventory reconciliation items"
on public.inventory_reconciliation_items
for select
to authenticated
using (
  public.is_manager()
);


-- All mutations go through server-side RPCs.
revoke insert, update, delete
on public.inventory_reconciliations
from authenticated;

revoke insert, update, delete
on public.inventory_reconciliation_items
from authenticated;


-- ============================================================
-- RPC PERMISSIONS
-- ============================================================

revoke all
on function public.get_driver_inventory_expected_balance(
  uuid,
  uuid,
  timestamptz
)
from public;

revoke all
on function public.create_driver_inventory_reconciliation(
  uuid,
  jsonb,
  text
)
from public;

revoke all
on function public.confirm_driver_inventory_reconciliation(uuid)
from public;


grant execute
on function public.get_driver_inventory_expected_balance(
  uuid,
  uuid,
  timestamptz
)
to service_role;

grant execute
on function public.create_driver_inventory_reconciliation(
  uuid,
  jsonb,
  text
)
to service_role;

grant execute
on function public.confirm_driver_inventory_reconciliation(uuid)
to service_role;