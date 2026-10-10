------------------------------------------------------------
-- INV-10: Client Reserve Snapshot & Reserve-Decrease Model
--
-- Stores historical client reserve balances and provides the
-- baseline needed to compare consecutive service visits.
--
-- Important:
--
-- reserve decrease =
--   previous reserve after service
--   - current reserve before service
--
-- This value describes the change in visible client reserve
-- between visits. It MUST NOT be interpreted as exact machine
-- consumption.
--
-- This migration does NOT yet refactor FLOW-7 inventory
-- audits or the mobile service workflow.
------------------------------------------------------------


------------------------------------------------------------
-- 1. RESERVE SNAPSHOT STAGE
------------------------------------------------------------

create type public.client_reserve_snapshot_stage as enum (
  'before_service',
  'after_service'
);


------------------------------------------------------------
-- 2. CLIENT RESERVE SNAPSHOTS
--
-- A snapshot is a historical observation/calculation of the
-- visible reserve for one service visit.
--
-- Each visit may eventually have:
--
--   before_service
--   after_service
--
-- INV-10 establishes the model. FLOW-15 and FLOW-18 will
-- integrate the service workflow with it.
------------------------------------------------------------

create table public.client_reserve_snapshots (
  id uuid primary key default gen_random_uuid(),

  source_visit_id text not null,

  client_id uuid not null
    references public.clients(id)
    on delete restrict,

  stop_id uuid not null
    references public.stops(id)
    on delete restrict,

  machine_id uuid not null
    references public.machines(id)
    on delete restrict,

  stage public.client_reserve_snapshot_stage not null,

  recorded_by uuid not null
    references public.users(id)
    on delete restrict,

  recorded_at timestamptz not null,

  created_at timestamptz not null default now(),

  constraint client_reserve_snapshots_visit_not_blank
  check (
    length(trim(source_visit_id)) > 0
  ),

  constraint client_reserve_snapshots_visit_stage_unique
  unique (
    source_visit_id,
    stage
  )
);


------------------------------------------------------------
-- 3. SNAPSHOT ITEMS
--
-- Quantities are normalized to the product operational base
-- unit.
--
-- Packaging fields are snapshots. Changing the product's
-- packaging configuration later must not rewrite history.
------------------------------------------------------------

create table public.client_reserve_snapshot_items (
  id uuid primary key default gen_random_uuid(),

  snapshot_id uuid not null
    references public.client_reserve_snapshots(id)
    on delete cascade,

  product_id uuid not null
    references public.inventory_products(id)
    on delete restrict,

  normalized_quantity numeric(12, 3) not null,

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

  created_at timestamptz not null default now(),

  constraint client_reserve_snapshot_items_quantity_nonnegative
  check (
    normalized_quantity >= 0
  ),

  constraint client_reserve_snapshot_items_issue_nonnegative
  check (
    entered_issue_quantity >= 0
  ),

  constraint client_reserve_snapshot_items_loose_nonnegative
  check (
    entered_loose_quantity >= 0
  ),

  constraint client_reserve_snapshot_items_normalized_unit_not_blank
  check (
    length(trim(normalized_unit)) > 0
  ),

  constraint client_reserve_snapshot_items_base_unit_not_blank
  check (
    length(trim(base_unit_snapshot)) > 0
  ),

  constraint client_reserve_snapshot_items_issue_unit_not_blank
  check (
    length(trim(issue_unit_snapshot)) > 0
  ),

  constraint client_reserve_snapshot_items_conversion_positive
  check (
    units_per_issue_unit_snapshot > 0
  ),

  constraint client_reserve_snapshot_items_package_description_not_blank
  check (
    package_description_snapshot is null
    or length(trim(package_description_snapshot)) > 0
  ),

  constraint client_reserve_snapshot_items_unique
  unique (
    snapshot_id,
    product_id
  )
);


------------------------------------------------------------
-- 4. INDEXES
------------------------------------------------------------

create index client_reserve_snapshots_client_time_idx
on public.client_reserve_snapshots (
  client_id,
  recorded_at desc
);


create index client_reserve_snapshots_client_stage_time_idx
on public.client_reserve_snapshots (
  client_id,
  stage,
  recorded_at desc
);


create index client_reserve_snapshots_stop_idx
on public.client_reserve_snapshots (
  stop_id
);


create index client_reserve_snapshots_machine_idx
on public.client_reserve_snapshots (
  machine_id
);


create index client_reserve_snapshot_items_product_idx
on public.client_reserve_snapshot_items (
  product_id
);


------------------------------------------------------------
-- 5. DOCUMENTATION
------------------------------------------------------------

comment on table public.client_reserve_snapshots is
'Historical before-service and after-service client visible reserve snapshots.';


comment on column public.client_reserve_snapshots.stage is
'Whether the reserve snapshot represents the balance before or after service.';


comment on table public.client_reserve_snapshot_items is
'Per-product normalized reserve quantities with historical packaging snapshots.';


comment on column
public.client_reserve_snapshot_items.normalized_quantity is
'Reserve quantity expressed in the operational base unit captured at the time of the snapshot.';


------------------------------------------------------------
-- 6. RLS
------------------------------------------------------------

alter table public.client_reserve_snapshots
enable row level security;


alter table public.client_reserve_snapshot_items
enable row level security;


------------------------------------------------------------
-- DRIVER: READ ASSIGNED CLIENT SNAPSHOTS
------------------------------------------------------------

create policy "Drivers can read assigned client reserve snapshots"
on public.client_reserve_snapshots
for select
to authenticated
using (
  public.is_driver()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.client_id = client_reserve_snapshots.client_id
      and r.driver_id = auth.uid()
  )
);


------------------------------------------------------------
-- MANAGER: READ REGIONAL SNAPSHOTS
------------------------------------------------------------

create policy "Managers can read regional client reserve snapshots"
on public.client_reserve_snapshots
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients c
    where c.id = client_reserve_snapshots.client_id
      and c.region = public.current_user_region()
  )
);


------------------------------------------------------------
-- CEO: READ ALL SNAPSHOTS
------------------------------------------------------------

create policy "CEOs can read all client reserve snapshots"
on public.client_reserve_snapshots
for select
to authenticated
using (
  public.is_ceo()
);


------------------------------------------------------------
-- SNAPSHOT ITEM RLS
------------------------------------------------------------

create policy "Drivers can read assigned client reserve snapshot items"
on public.client_reserve_snapshot_items
for select
to authenticated
using (
  exists (
    select 1
    from public.client_reserve_snapshots snapshot
    join public.stops s
      on s.id = snapshot.stop_id
    join public.routes r
      on r.id = s.route_id
    where snapshot.id =
      client_reserve_snapshot_items.snapshot_id
      and r.driver_id = auth.uid()
  )
);


create policy "Managers can read regional client reserve snapshot items"
on public.client_reserve_snapshot_items
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.client_reserve_snapshots snapshot
    join public.clients c
      on c.id = snapshot.client_id
    where snapshot.id =
      client_reserve_snapshot_items.snapshot_id
      and c.region = public.current_user_region()
  )
);


create policy "CEOs can read all client reserve snapshot items"
on public.client_reserve_snapshot_items
for select
to authenticated
using (
  public.is_ceo()
);


------------------------------------------------------------
-- 7. PREVIOUS RESERVE BALANCE LOOKUP
--
-- Returns the most recent AFTER-SERVICE reserve quantity
-- recorded before the supplied visit/time.
--
-- null means there is no previous baseline.
------------------------------------------------------------

create or replace function public.get_previous_client_reserve_balance(
  p_client_id uuid,
  p_product_id uuid,
  p_before timestamptz
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select item.normalized_quantity
  from public.client_reserve_snapshots snapshot
  join public.client_reserve_snapshot_items item
    on item.snapshot_id = snapshot.id
  where snapshot.client_id = p_client_id
    and snapshot.stage = 'after_service'
    and snapshot.recorded_at < p_before
    and item.product_id = p_product_id
  order by
    snapshot.recorded_at desc,
    snapshot.created_at desc
  limit 1;
$$;


grant execute on function
public.get_previous_client_reserve_balance(
  uuid,
  uuid,
  timestamptz
)
to authenticated;


------------------------------------------------------------
-- 8. RESERVE DECREASE CALCULATION
--
-- Important:
--
-- Positive:
--   reserve is lower than previous visit.
--
-- Zero:
--   reserve is unchanged.
--
-- Negative:
--   reserve is higher than previous visit.
--
-- Negative values are intentional and MUST NOT be clamped.
------------------------------------------------------------

create or replace function public.calculate_client_reserve_decrease(
  p_previous_reserve_after numeric,
  p_current_reserve_before numeric
)
returns numeric
language plpgsql
immutable
security invoker
set search_path = public
as $$
begin
  if p_previous_reserve_after is null then
    return null;
  end if;

  if p_current_reserve_before is null then
    raise exception
      'Current reserve before service is required';
  end if;

  if p_previous_reserve_after < 0 then
    raise exception
      'Previous reserve after service cannot be negative';
  end if;

  if p_current_reserve_before < 0 then
    raise exception
      'Current reserve before service cannot be negative';
  end if;

  return
    p_previous_reserve_after
    - p_current_reserve_before;
end;
$$;


grant execute on function
public.calculate_client_reserve_decrease(
  numeric,
  numeric
)
to authenticated;