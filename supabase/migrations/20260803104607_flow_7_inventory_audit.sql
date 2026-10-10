------------------------------------------------------------
-- FLOW-7: Client inventory audit
------------------------------------------------------------

------------------------------------------------------------
-- Enums
------------------------------------------------------------

create type public.inventory_product_category as enum (
  'coffee',
  'powders',
  'sweeteners_stirrers',
  'cups_lids',
  'creamers',
  'cleaning'
);

------------------------------------------------------------
-- Product catalog
--
-- sku is nullable because several lines on the paper stock
-- sheet use a category label such as Powder or Creamer
-- rather than a unique SKU.
------------------------------------------------------------

create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),

  sku text,
  name text not null,
  category public.inventory_product_category not null,

  unit_label text not null,
  sort_order integer not null default 0,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_products_name_not_blank
    check (length(trim(name)) > 0),

  constraint inventory_products_unit_not_blank
    check (length(trim(unit_label)) > 0),

  constraint inventory_products_sku_not_blank
    check (sku is null or length(trim(sku)) > 0),

  constraint inventory_products_sku_unique
    unique (sku)
);

create index inventory_products_category_sort_idx
on public.inventory_products (
  category,
  sort_order,
  name
);

------------------------------------------------------------
-- Expected products for each client/location
--
-- Every location may have a different product list.
------------------------------------------------------------

create table public.client_inventory_products (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  product_id uuid not null
    references public.inventory_products(id)
    on delete restrict,

  display_order integer not null default 0,
  is_required boolean not null default true,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_inventory_products_unique
    unique (client_id, product_id)
);

create index client_inventory_products_client_idx
on public.client_inventory_products (
  client_id,
  is_active,
  display_order
);

------------------------------------------------------------
-- One audit per service visit
------------------------------------------------------------

create table public.inventory_audits (
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

  counted_by uuid not null
    references public.users(id)
    on delete restrict,

  counted_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_audits_source_visit_not_blank
    check (length(trim(source_visit_id)) > 0)
);

create index inventory_audits_client_counted_idx
on public.inventory_audits (
  client_id,
  counted_at desc
);

create index inventory_audits_stop_idx
on public.inventory_audits (stop_id);

create index inventory_audits_machine_idx
on public.inventory_audits (machine_id);

create index inventory_audits_counted_by_idx
on public.inventory_audits (counted_by);

------------------------------------------------------------
-- Counted quantities
--
-- Numeric supports partial units such as 0.5 gallon.
------------------------------------------------------------

create table public.inventory_audit_items (
  id uuid primary key default gen_random_uuid(),

  audit_id uuid not null
    references public.inventory_audits(id)
    on delete cascade,

  product_id uuid not null
    references public.inventory_products(id)
    on delete restrict,

  quantity numeric(12, 3) not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_audit_items_quantity_nonnegative
    check (quantity >= 0),

  constraint inventory_audit_items_unique
    unique (audit_id, product_id)
);

create index inventory_audit_items_product_idx
on public.inventory_audit_items (product_id);

------------------------------------------------------------
-- RLS: product catalog
------------------------------------------------------------

alter table public.inventory_products enable row level security;

create policy "Authenticated users can read inventory products"
on public.inventory_products
for select
to authenticated
using (true);

create policy "Managers can manage regional inventory catalog"
on public.inventory_products
for all
to authenticated
using (public.is_manager())
with check (public.is_manager());

create policy "CEOs can manage inventory catalog"
on public.inventory_products
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

------------------------------------------------------------
-- RLS: client product configuration
------------------------------------------------------------

alter table public.client_inventory_products enable row level security;

create policy "Drivers can read assigned client inventory configuration"
on public.client_inventory_products
for select
to authenticated
using (
  public.is_driver()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.client_id = client_inventory_products.client_id
      and r.driver_id = auth.uid()
  )
);

create policy "Managers can manage regional client inventory configuration"
on public.client_inventory_products
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients c
    where c.id = client_inventory_products.client_id
      and c.region = public.current_user_region()
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.clients c
    where c.id = client_inventory_products.client_id
      and c.region = public.current_user_region()
  )
);

create policy "CEOs can manage all client inventory configuration"
on public.client_inventory_products
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

------------------------------------------------------------
-- RLS: audit headers
------------------------------------------------------------

alter table public.inventory_audits enable row level security;

create policy "Drivers can read own assigned inventory audits"
on public.inventory_audits
for select
to authenticated
using (
  counted_by = auth.uid()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.id = inventory_audits.stop_id
      and r.driver_id = auth.uid()
  )
);

create policy "Drivers can insert own assigned inventory audits"
on public.inventory_audits
for insert
to authenticated
with check (
  counted_by = auth.uid()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.id = inventory_audits.stop_id
      and s.client_id = inventory_audits.client_id
      and s.machine_id = inventory_audits.machine_id
      and r.driver_id = auth.uid()
  )
);

create policy "Managers can read regional inventory audits"
on public.inventory_audits
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients c
    where c.id = inventory_audits.client_id
      and c.region = public.current_user_region()
  )
);

create policy "CEOs can manage all inventory audits"
on public.inventory_audits
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

------------------------------------------------------------
-- RLS: audit items
------------------------------------------------------------

alter table public.inventory_audit_items enable row level security;

create policy "Drivers can read own inventory audit items"
on public.inventory_audit_items
for select
to authenticated
using (
  exists (
    select 1
    from public.inventory_audits a
    where a.id = inventory_audit_items.audit_id
      and a.counted_by = auth.uid()
  )
);

create policy "Drivers can insert own inventory audit items"
on public.inventory_audit_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.inventory_audits a
    where a.id = inventory_audit_items.audit_id
      and a.counted_by = auth.uid()
  )
);

create policy "Managers can read regional inventory audit items"
on public.inventory_audit_items
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.inventory_audits a
    join public.clients c
      on c.id = a.client_id
    where a.id = inventory_audit_items.audit_id
      and c.region = public.current_user_region()
  )
);

create policy "CEOs can manage all inventory audit items"
on public.inventory_audit_items
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

------------------------------------------------------------
-- Atomic and idempotent audit save
--
-- A retry with the same source_visit_id updates the existing
-- audit instead of creating a duplicate.
------------------------------------------------------------

create or replace function public.save_inventory_audit(
  p_source_visit_id text,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_counted_at timestamptz,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_audit_id uuid;
  audit_item jsonb;
  parsed_product_id uuid;
  parsed_quantity numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_source_visit_id is null
    or length(trim(p_source_visit_id)) = 0 then
    raise exception 'A service visit ID is required';
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one inventory count is required';
  end if;

  insert into public.inventory_audits (
    source_visit_id,
    client_id,
    stop_id,
    machine_id,
    counted_by,
    counted_at
  )
  values (
    trim(p_source_visit_id),
    p_client_id,
    p_stop_id,
    p_machine_id,
    auth.uid(),
    p_counted_at
  )
  on conflict (source_visit_id)
  do update set
    client_id = excluded.client_id,
    stop_id = excluded.stop_id,
    machine_id = excluded.machine_id,
    counted_at = excluded.counted_at,
    updated_at = now()
  where inventory_audits.counted_by = auth.uid()
  returning id into saved_audit_id;

  if saved_audit_id is null then
    raise exception 'This visit audit belongs to another user';
  end if;

  for audit_item in
    select value from jsonb_array_elements(p_items)
  loop
    parsed_product_id :=
      (audit_item ->> 'product_id')::uuid;

    parsed_quantity :=
      (audit_item ->> 'quantity')::numeric;

    if parsed_quantity < 0 then
      raise exception 'Inventory quantities cannot be negative';
    end if;

    if not exists (
      select 1
      from public.client_inventory_products cip
      where cip.client_id = p_client_id
        and cip.product_id = parsed_product_id
        and cip.is_active = true
    ) then
      raise exception
        'Product % is not configured for this client',
        parsed_product_id;
    end if;

    insert into public.inventory_audit_items (
      audit_id,
      product_id,
      quantity
    )
    values (
      saved_audit_id,
      parsed_product_id,
      parsed_quantity
    )
    on conflict (audit_id, product_id)
    do update set
      quantity = excluded.quantity,
      updated_at = now();
  end loop;

  delete from public.inventory_audit_items existing_item
  where existing_item.audit_id = saved_audit_id
    and not exists (
      select 1
      from jsonb_array_elements(p_items) supplied_item
      where (supplied_item ->> 'product_id')::uuid =
        existing_item.product_id
    );

  return saved_audit_id;
end;
$$;

grant execute on function public.save_inventory_audit(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
) to authenticated;