------------------------------------------------------------
-- INV-9: Inventory Custody Ledger & Movement Model
--
-- Establishes the inventory custody foundation for:
--
--   Warehouse -> Driver
--   Driver -> Client Reserve
--   Client Reserve -> Machine
--   Driver -> Warehouse
--
-- Inventory movements are immutable historical facts.
--
-- Quantity values are normalized using the product packaging
-- model introduced in INV-8. Every movement snapshots the
-- packaging conversion used when the movement occurred.
--
-- This migration intentionally does NOT integrate the
-- existing FLOW-8 restock workflow with the new ledger.
------------------------------------------------------------


------------------------------------------------------------
-- 1. INVENTORY LOCATION TYPE
------------------------------------------------------------

create type public.inventory_location_type as enum (
  'warehouse',
  'driver',
  'client_reserve',
  'machine'
);


------------------------------------------------------------
-- 2. INVENTORY MOVEMENT TYPE
------------------------------------------------------------

create type public.inventory_movement_type as enum (
  'warehouse_issue',
  'client_delivery',
  'machine_refill',
  'warehouse_return',
  'adjustment'
);


------------------------------------------------------------
-- 3. INVENTORY LOCATIONS
--
-- A canonical representation of every place where inventory
-- may be held.
--
-- Examples:
--
-- warehouse
-- driver / van
-- client visible reserve
-- machine
------------------------------------------------------------

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),

  location_type public.inventory_location_type not null,

  warehouse_id uuid
    references public.warehouses(id)
    on delete restrict,

  driver_id uuid
    references public.users(id)
    on delete restrict,

  client_id uuid
    references public.clients(id)
    on delete restrict,

  machine_id uuid
    references public.machines(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  ----------------------------------------------------------
  -- The entity FK must correspond exactly to location_type.
  ----------------------------------------------------------

  constraint inventory_locations_entity_matches_type
  check (
    (
      location_type = 'warehouse'
      and warehouse_id is not null
      and driver_id is null
      and client_id is null
      and machine_id is null
    )
    or
    (
      location_type = 'driver'
      and warehouse_id is null
      and driver_id is not null
      and client_id is null
      and machine_id is null
    )
    or
    (
      location_type = 'client_reserve'
      and warehouse_id is null
      and driver_id is null
      and client_id is not null
      and machine_id is null
    )
    or
    (
      location_type = 'machine'
      and warehouse_id is null
      and driver_id is null
      and client_id is null
      and machine_id is not null
    )
  )
);


------------------------------------------------------------
-- 4. ONE CANONICAL LOCATION PER ENTITY
------------------------------------------------------------

create unique index inventory_locations_warehouse_unique
on public.inventory_locations (warehouse_id)
where location_type = 'warehouse';


create unique index inventory_locations_driver_unique
on public.inventory_locations (driver_id)
where location_type = 'driver';


create unique index inventory_locations_client_unique
on public.inventory_locations (client_id)
where location_type = 'client_reserve';


create unique index inventory_locations_machine_unique
on public.inventory_locations (machine_id)
where location_type = 'machine';


------------------------------------------------------------
-- 5. INVENTORY MOVEMENT LEDGER
--
-- This is an append-only historical ledger.
--
-- Example:
--
-- Warehouse -> Driver
-- product = Illy Intenso
-- entered = 2 cases + 3 bags
-- conversion = 6 bags / case
-- normalized = 15 bags
--
-- The conversion snapshot MUST remain unchanged even if the
-- product packaging configuration changes later.
------------------------------------------------------------

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),

  movement_type public.inventory_movement_type not null,

  product_id uuid not null
    references public.inventory_products(id)
    on delete restrict,

  ----------------------------------------------------------
  -- Custody transfer
  ----------------------------------------------------------

  from_location_id uuid
    references public.inventory_locations(id)
    on delete restrict,

  to_location_id uuid
    references public.inventory_locations(id)
    on delete restrict,

  ----------------------------------------------------------
  -- Normalized quantity
  ----------------------------------------------------------

  normalized_quantity numeric(12, 3) not null,

  normalized_unit text not null,

  ----------------------------------------------------------
  -- Original driver/admin input
  ----------------------------------------------------------

  entered_issue_quantity numeric(12, 3)
    not null
    default 0,

  entered_loose_quantity numeric(12, 3)
    not null
    default 0,

  ----------------------------------------------------------
  -- Historical packaging snapshot
  ----------------------------------------------------------

  base_unit_snapshot text not null,

  issue_unit_snapshot text not null,

  units_per_issue_unit_snapshot numeric not null,

  package_description_snapshot text,

  ----------------------------------------------------------
  -- Operational context
  ----------------------------------------------------------

  source_visit_id text,

  stop_id uuid
    references public.stops(id)
    on delete restrict,

  machine_id uuid
    references public.machines(id)
    on delete restrict,

  recorded_by uuid not null
    references public.users(id)
    on delete restrict,

  occurred_at timestamptz not null,

  created_at timestamptz not null default now(),

  ----------------------------------------------------------
  -- Quantity validation
  ----------------------------------------------------------

  constraint inventory_movements_quantity_positive
  check (
    normalized_quantity > 0
  ),

  constraint inventory_movements_issue_quantity_nonnegative
  check (
    entered_issue_quantity >= 0
  ),

  constraint inventory_movements_loose_quantity_nonnegative
  check (
    entered_loose_quantity >= 0
  ),

  ----------------------------------------------------------
  -- Unit validation
  ----------------------------------------------------------

  constraint inventory_movements_normalized_unit_not_blank
  check (
    length(trim(normalized_unit)) > 0
  ),

  constraint inventory_movements_base_unit_not_blank
  check (
    length(trim(base_unit_snapshot)) > 0
  ),

  constraint inventory_movements_issue_unit_not_blank
  check (
    length(trim(issue_unit_snapshot)) > 0
  ),

  constraint inventory_movements_conversion_positive
  check (
    units_per_issue_unit_snapshot > 0
  ),

  constraint inventory_movements_package_description_not_blank
  check (
    package_description_snapshot is null
    or length(trim(package_description_snapshot)) > 0
  ),

  ----------------------------------------------------------
  -- Source and destination cannot be identical.
  ----------------------------------------------------------

  constraint inventory_movements_locations_different
  check (
    from_location_id is distinct from to_location_id
  )
);


------------------------------------------------------------
-- 6. MOVEMENT INDEXES
------------------------------------------------------------

create index inventory_movements_product_time_idx
on public.inventory_movements (
  product_id,
  occurred_at desc
);


create index inventory_movements_from_location_idx
on public.inventory_movements (
  from_location_id,
  occurred_at desc
);


create index inventory_movements_to_location_idx
on public.inventory_movements (
  to_location_id,
  occurred_at desc
);


create index inventory_movements_visit_idx
on public.inventory_movements (source_visit_id)
where source_visit_id is not null;


create index inventory_movements_stop_idx
on public.inventory_movements (stop_id)
where stop_id is not null;


create index inventory_movements_machine_idx
on public.inventory_movements (machine_id)
where machine_id is not null;


create index inventory_movements_recorded_by_idx
on public.inventory_movements (
  recorded_by,
  occurred_at desc
);


------------------------------------------------------------
-- 7. TABLE / COLUMN DOCUMENTATION
------------------------------------------------------------

comment on table public.inventory_locations is
'Canonical inventory custody locations: warehouse, driver, client reserve, and machine.';


comment on column public.inventory_locations.location_type is
'Type of inventory custody location represented by this row.';


comment on table public.inventory_movements is
'Immutable append-only inventory custody ledger.';


comment on column public.inventory_movements.movement_type is
'Business meaning of the inventory transfer.';


comment on column public.inventory_movements.from_location_id is
'Inventory location from which custody moved.';


comment on column public.inventory_movements.to_location_id is
'Inventory location to which custody moved.';


comment on column public.inventory_movements.normalized_quantity is
'Quantity expressed in the operational base unit captured when the movement occurred.';


comment on column public.inventory_movements.normalized_unit is
'Operational base-unit label captured when the movement occurred.';


comment on column public.inventory_movements.entered_issue_quantity is
'Number of complete issue/package units entered for the movement.';


comment on column public.inventory_movements.entered_loose_quantity is
'Number of loose operational base units entered for the movement.';


comment on column public.inventory_movements.base_unit_snapshot is
'Historical base unit captured from product packaging configuration when the movement occurred.';


comment on column public.inventory_movements.issue_unit_snapshot is
'Historical issue unit captured from product packaging configuration when the movement occurred.';


comment on column public.inventory_movements.units_per_issue_unit_snapshot is
'Historical conversion factor captured when the movement occurred.';


comment on column public.inventory_movements.package_description_snapshot is
'Historical human-readable package description captured when the movement occurred.';


comment on column public.inventory_movements.source_visit_id is
'Local/service-visit source identifier when the movement originated from a service visit.';


------------------------------------------------------------
-- 8. ENABLE ROW LEVEL SECURITY
------------------------------------------------------------

alter table public.inventory_locations
enable row level security;


alter table public.inventory_movements
enable row level security;


------------------------------------------------------------
-- 9. INVENTORY LOCATION RLS
------------------------------------------------------------


------------------------------------------------------------
-- CEO
------------------------------------------------------------

create policy "CEOs can manage inventory locations"
on public.inventory_locations
for all
to authenticated
using (
  public.is_ceo()
)
with check (
  public.is_ceo()
);


------------------------------------------------------------
-- MANAGER
--
-- Managers may read locations belonging to their region.
------------------------------------------------------------

create policy "Managers can read regional inventory locations"
on public.inventory_locations
for select
to authenticated
using (
  public.is_manager()
  and (
    --------------------------------------------------------
    -- Warehouse
    --------------------------------------------------------

    (
      location_type = 'warehouse'
      and exists (
        select 1
        from public.warehouses warehouse
        where warehouse.id =
          inventory_locations.warehouse_id
          and warehouse.region =
            public.current_user_region()
      )
    )

    or

    --------------------------------------------------------
    -- Driver
    --------------------------------------------------------

    (
      location_type = 'driver'
      and exists (
        select 1
        from public.users driver
        where driver.id =
          inventory_locations.driver_id
          and driver.region =
            public.current_user_region()
      )
    )

    or

    --------------------------------------------------------
    -- Client reserve
    --------------------------------------------------------

    (
      location_type = 'client_reserve'
      and exists (
        select 1
        from public.clients client
        where client.id =
          inventory_locations.client_id
          and client.region =
            public.current_user_region()
      )
    )

    or

    --------------------------------------------------------
    -- Machine
    --------------------------------------------------------

    (
      location_type = 'machine'
      and exists (
        select 1
        from public.machines machine
        join public.clients client
          on client.id = machine.client_id
        where machine.id =
          inventory_locations.machine_id
          and client.region =
            public.current_user_region()
      )
    )
  )
);


------------------------------------------------------------
-- DRIVER
--
-- Drivers can see their own inventory location.
------------------------------------------------------------

create policy "Drivers can read own inventory location"
on public.inventory_locations
for select
to authenticated
using (
  location_type = 'driver'
  and driver_id = auth.uid()
);


------------------------------------------------------------
-- 10. INVENTORY MOVEMENT RLS
------------------------------------------------------------


------------------------------------------------------------
-- CEO
------------------------------------------------------------

create policy "CEOs can read all inventory movements"
on public.inventory_movements
for select
to authenticated
using (
  public.is_ceo()
);


------------------------------------------------------------
-- MANAGER
--
-- A manager can see a movement when its source OR
-- destination belongs to the manager's region.
------------------------------------------------------------

create policy "Managers can read regional inventory movements"
on public.inventory_movements
for select
to authenticated
using (
  public.is_manager()
  and (
    --------------------------------------------------------
    -- Source location belongs to manager region
    --------------------------------------------------------

    exists (
      select 1
      from public.inventory_locations location

      left join public.warehouses warehouse
        on warehouse.id = location.warehouse_id

      left join public.users driver
        on driver.id = location.driver_id

      left join public.clients client
        on client.id = location.client_id

      left join public.machines machine
        on machine.id = location.machine_id

      left join public.clients machine_client
        on machine_client.id = machine.client_id

      where location.id =
        inventory_movements.from_location_id

        and coalesce(
          warehouse.region,
          driver.region,
          client.region,
          machine_client.region
        ) = public.current_user_region()
    )

    or

    --------------------------------------------------------
    -- Destination belongs to manager region
    --------------------------------------------------------

    exists (
      select 1
      from public.inventory_locations location

      left join public.warehouses warehouse
        on warehouse.id = location.warehouse_id

      left join public.users driver
        on driver.id = location.driver_id

      left join public.clients client
        on client.id = location.client_id

      left join public.machines machine
        on machine.id = location.machine_id

      left join public.clients machine_client
        on machine_client.id = machine.client_id

      where location.id =
        inventory_movements.to_location_id

        and coalesce(
          warehouse.region,
          driver.region,
          client.region,
          machine_client.region
        ) = public.current_user_region()
    )
  )
);


------------------------------------------------------------
-- DRIVER
--
-- Drivers may read movements where their own driver
-- inventory location is the source or destination.
--
-- Client-reserve -> machine visibility will be expanded by
-- the service-visit integration story because it needs route
-- / stop authorization as well.
------------------------------------------------------------

create policy "Drivers can read own inventory movements"
on public.inventory_movements
for select
to authenticated
using (
  exists (
    select 1
    from public.inventory_locations location
    where location.location_type = 'driver'
      and location.driver_id = auth.uid()
      and (
        location.id =
          inventory_movements.from_location_id
        or
        location.id =
          inventory_movements.to_location_id
      )
  )
);


------------------------------------------------------------
-- IMPORTANT:
--
-- No INSERT / UPDATE / DELETE policy is intentionally
-- created for inventory_movements.
--
-- Future workflow stories will create validated RPCs for
-- recording inventory movements.
--
-- This prevents mobile/web clients from arbitrarily
-- modifying the custody ledger.
------------------------------------------------------------


------------------------------------------------------------
-- 11. BOOTSTRAP EXISTING WAREHOUSE LOCATIONS
------------------------------------------------------------

insert into public.inventory_locations (
  location_type,
  warehouse_id
)
select
  'warehouse',
  warehouse.id
from public.warehouses warehouse
on conflict do nothing;


------------------------------------------------------------
-- 12. BOOTSTRAP EXISTING DRIVER LOCATIONS
------------------------------------------------------------

insert into public.inventory_locations (
  location_type,
  driver_id
)
select
  'driver',
  driver.id
from public.users driver
where driver.role = 'driver'
on conflict do nothing;


------------------------------------------------------------
-- 13. BOOTSTRAP EXISTING CLIENT RESERVE LOCATIONS
------------------------------------------------------------

insert into public.inventory_locations (
  location_type,
  client_id
)
select
  'client_reserve',
  client.id
from public.clients client
on conflict do nothing;


------------------------------------------------------------
-- 14. BOOTSTRAP EXISTING MACHINE LOCATIONS
------------------------------------------------------------

insert into public.inventory_locations (
  location_type,
  machine_id
)
select
  'machine',
  machine.id
from public.machines machine
on conflict do nothing;


------------------------------------------------------------
-- 15. AUTOMATIC LOCATION CREATION
--
-- New warehouses, clients, machines and drivers receive
-- their canonical inventory location automatically.
------------------------------------------------------------

create or replace function public.create_inventory_location_for_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  ----------------------------------------------------------
  -- Warehouse
  ----------------------------------------------------------

  if tg_table_name = 'warehouses' then

    insert into public.inventory_locations (
      location_type,
      warehouse_id
    )
    values (
      'warehouse',
      new.id
    )
    on conflict do nothing;


  ----------------------------------------------------------
  -- Client reserve
  ----------------------------------------------------------

  elsif tg_table_name = 'clients' then

    insert into public.inventory_locations (
      location_type,
      client_id
    )
    values (
      'client_reserve',
      new.id
    )
    on conflict do nothing;


  ----------------------------------------------------------
  -- Machine
  ----------------------------------------------------------

  elsif tg_table_name = 'machines' then

    insert into public.inventory_locations (
      location_type,
      machine_id
    )
    values (
      'machine',
      new.id
    )
    on conflict do nothing;


  ----------------------------------------------------------
  -- Driver
  ----------------------------------------------------------

  elsif tg_table_name = 'users'
    and new.role = 'driver' then

    insert into public.inventory_locations (
      location_type,
      driver_id
    )
    values (
      'driver',
      new.id
    )
    on conflict do nothing;

  end if;

  return new;
end;
$$;


------------------------------------------------------------
-- 16. CREATE LOCATION TRIGGERS
------------------------------------------------------------

create trigger create_warehouse_inventory_location
after insert on public.warehouses
for each row
execute function public.create_inventory_location_for_entity();


create trigger create_client_inventory_location
after insert on public.clients
for each row
execute function public.create_inventory_location_for_entity();


create trigger create_machine_inventory_location
after insert on public.machines
for each row
execute function public.create_inventory_location_for_entity();


create trigger create_driver_inventory_location
after insert on public.users
for each row
execute function public.create_inventory_location_for_entity();


------------------------------------------------------------
-- 17. HANDLE EXISTING USER BECOMING A DRIVER
--
-- A user may initially be created as another role and later
-- be changed to driver.
------------------------------------------------------------

create or replace function public.create_inventory_location_on_driver_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if new.role = 'driver'
    and old.role is distinct from 'driver' then

    insert into public.inventory_locations (
      location_type,
      driver_id
    )
    values (
      'driver',
      new.id
    )
    on conflict do nothing;

  end if;

  return new;
end;
$$;


create trigger create_inventory_location_on_driver_role
after update of role on public.users
for each row
execute function public.create_inventory_location_on_driver_role();


------------------------------------------------------------
-- 18. LOCATION LOOKUP HELPER
--
-- Internal/domain helper for finding an existing canonical
-- inventory location.
--
-- It does NOT create a location.
------------------------------------------------------------

create or replace function public.get_inventory_location_id(
  p_location_type public.inventory_location_type,
  p_entity_id uuid
)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result_id uuid;
begin

  case p_location_type

    when 'warehouse' then

      select id
      into result_id
      from public.inventory_locations
      where location_type = 'warehouse'
        and warehouse_id = p_entity_id;


    when 'driver' then

      select id
      into result_id
      from public.inventory_locations
      where location_type = 'driver'
        and driver_id = p_entity_id;


    when 'client_reserve' then

      select id
      into result_id
      from public.inventory_locations
      where location_type = 'client_reserve'
        and client_id = p_entity_id;


    when 'machine' then

      select id
      into result_id
      from public.inventory_locations
      where location_type = 'machine'
        and machine_id = p_entity_id;

  end case;

  return result_id;
end;
$$;


------------------------------------------------------------
-- 19. MOVEMENT PATH VALIDATION FUNCTION
--
-- Valid physical custody paths:
--
-- warehouse_issue:
--   Warehouse -> Driver
--
-- client_delivery:
--   Driver -> Client Reserve
--
-- machine_refill:
--   Client Reserve -> Machine
--
-- warehouse_return:
--   Driver -> Warehouse
--
-- adjustment is intentionally handled separately because
-- an adjustment is not necessarily a physical A -> B
-- transfer.
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
  --
  -- INV-9 defines the enum value for future reconciliation
  -- work but does not allow arbitrary adjustment rows yet.
  ----------------------------------------------------------

  if new.movement_type = 'adjustment' then
    raise exception
      'Inventory adjustments must use the dedicated reconciliation workflow.';
  end if;


  ----------------------------------------------------------
  -- Physical movements require both sides.
  ----------------------------------------------------------

  if new.from_location_id is null
    or new.to_location_id is null then

    raise exception
      'Physical inventory movements require both source and destination locations.';

  end if;


  ----------------------------------------------------------
  -- Load location types.
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
  -- Client Reserve -> Machine
  ----------------------------------------------------------

  elsif new.movement_type = 'machine_refill' then

    if source_type <> 'client_reserve'
      or destination_type <> 'machine' then

      raise exception
        'machine_refill must move inventory from client reserve to machine.';

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
-- 20. MOVEMENT PATH VALIDATION TRIGGER
------------------------------------------------------------

create trigger validate_inventory_movement_path
before insert on public.inventory_movements
for each row
execute function public.validate_inventory_movement_path();


------------------------------------------------------------
-- 21. PREVENT MOVEMENT UPDATES
--
-- RLS already prevents normal authenticated clients from
-- updating rows.
--
-- This trigger additionally protects the append-only ledger
-- from accidental privileged/server-side updates.
------------------------------------------------------------

create or replace function public.prevent_inventory_movement_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin

  raise exception
    'Inventory movements are immutable and cannot be updated.';
end;
$$;


create trigger prevent_inventory_movement_update
before update on public.inventory_movements
for each row
execute function public.prevent_inventory_movement_update();


------------------------------------------------------------
-- 22. PREVENT MOVEMENT DELETES
--
-- Corrections must be represented by future compensating
-- movements/reconciliation rather than deleting history.
------------------------------------------------------------

create or replace function public.prevent_inventory_movement_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin

  raise exception
    'Inventory movements are immutable and cannot be deleted.';
end;
$$;


create trigger prevent_inventory_movement_delete
before delete on public.inventory_movements
for each row
execute function public.prevent_inventory_movement_delete();


------------------------------------------------------------
-- END INV-9
------------------------------------------------------------