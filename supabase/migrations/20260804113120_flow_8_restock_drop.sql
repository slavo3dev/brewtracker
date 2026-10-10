------------------------------------------------------------
-- FLOW-8: Step 6 - Restock and drop
------------------------------------------------------------

------------------------------------------------------------
-- Add client-specific par level
--
-- Par level is configured per client/product because the
-- same SKU may require different target quantities at
-- different locations.
------------------------------------------------------------

alter table public.client_inventory_products
add column par_level numeric(12, 3);

alter table public.client_inventory_products
add constraint client_inventory_products_par_level_nonnegative
check (
  par_level is null
  or par_level >= 0
);

comment on column public.client_inventory_products.par_level is
'Target quantity that should remain at the client after restocking.';

------------------------------------------------------------
-- One restock confirmation per service visit
------------------------------------------------------------

create table public.inventory_restock_drops (
  id uuid primary key default gen_random_uuid(),

  source_visit_id text not null unique,

  audit_id uuid not null
    references public.inventory_audits(id)
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

  /*
   * No van table is required for FLOW-8.
   * The assigned driver is the movement source.
   */
  source_driver_id uuid not null
    references public.users(id)
    on delete restrict,

  confirmed_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_restock_drops_source_visit_not_blank
    check (length(trim(source_visit_id)) > 0)
);

create index inventory_restock_drops_client_confirmed_idx
on public.inventory_restock_drops (
  client_id,
  confirmed_at desc
);

create index inventory_restock_drops_driver_idx
on public.inventory_restock_drops (
  source_driver_id,
  confirmed_at desc
);

create index inventory_restock_drops_audit_idx
on public.inventory_restock_drops (audit_id);

------------------------------------------------------------
-- Restock movement items
--
-- Each positive actual_quantity represents an inventory
-- movement from the assigned driver to the client.
--
-- Rows with zero actual quantity are retained as confirmation
-- evidence, even though no physical stock moved.
------------------------------------------------------------

create table public.inventory_restock_drop_items (
  id uuid primary key default gen_random_uuid(),

  restock_drop_id uuid not null
    references public.inventory_restock_drops(id)
    on delete cascade,

  product_id uuid not null
    references public.inventory_products(id)
    on delete restrict,

  counted_quantity numeric(12, 3) not null,
  par_level numeric(12, 3) not null,
  recommended_quantity numeric(12, 3) not null,
  actual_quantity numeric(12, 3) not null,

  movement_from text not null default 'driver',
  movement_to text not null default 'client',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_restock_items_counted_nonnegative
    check (counted_quantity >= 0),

  constraint inventory_restock_items_par_nonnegative
    check (par_level >= 0),

  constraint inventory_restock_items_recommended_nonnegative
    check (recommended_quantity >= 0),

  constraint inventory_restock_items_actual_nonnegative
    check (actual_quantity >= 0),

  constraint inventory_restock_items_valid_source
    check (movement_from = 'driver'),

  constraint inventory_restock_items_valid_destination
    check (movement_to = 'client'),

  constraint inventory_restock_drop_items_unique
    unique (restock_drop_id, product_id)
);

create index inventory_restock_drop_items_product_idx
on public.inventory_restock_drop_items (product_id);

------------------------------------------------------------
-- RLS: restock drop headers
------------------------------------------------------------

alter table public.inventory_restock_drops
enable row level security;

create policy "Drivers can read own assigned restock drops"
on public.inventory_restock_drops
for select
to authenticated
using (
  source_driver_id = auth.uid()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.id = inventory_restock_drops.stop_id
      and r.driver_id = auth.uid()
  )
);

create policy "Drivers can insert own assigned restock drops"
on public.inventory_restock_drops
for insert
to authenticated
with check (
  source_driver_id = auth.uid()
  and exists (
    select 1
    from public.stops s
    join public.routes r
      on r.id = s.route_id
    where s.id = inventory_restock_drops.stop_id
      and s.client_id = inventory_restock_drops.client_id
      and s.machine_id = inventory_restock_drops.machine_id
      and r.driver_id = auth.uid()
  )
);

create policy "Managers can read regional restock drops"
on public.inventory_restock_drops
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients c
    where c.id = inventory_restock_drops.client_id
      and c.region = public.current_user_region()
  )
);

create policy "CEOs can manage all restock drops"
on public.inventory_restock_drops
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

------------------------------------------------------------
-- RLS: restock items
------------------------------------------------------------

alter table public.inventory_restock_drop_items
enable row level security;

create policy "Drivers can read own restock drop items"
on public.inventory_restock_drop_items
for select
to authenticated
using (
  exists (
    select 1
    from public.inventory_restock_drops drop_header
    where drop_header.id =
      inventory_restock_drop_items.restock_drop_id
      and drop_header.source_driver_id = auth.uid()
  )
);

create policy "Drivers can insert own restock drop items"
on public.inventory_restock_drop_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.inventory_restock_drops drop_header
    where drop_header.id =
      inventory_restock_drop_items.restock_drop_id
      and drop_header.source_driver_id = auth.uid()
  )
);

create policy "Managers can read regional restock drop items"
on public.inventory_restock_drop_items
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.inventory_restock_drops drop_header
    join public.clients c
      on c.id = drop_header.client_id
    where drop_header.id =
      inventory_restock_drop_items.restock_drop_id
      and c.region = public.current_user_region()
  )
);

create policy "CEOs can manage all restock drop items"
on public.inventory_restock_drop_items
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

------------------------------------------------------------
-- Atomic and idempotent FLOW-8 save
------------------------------------------------------------

create or replace function public.save_inventory_restock_drop(
  p_source_visit_id text,
  p_audit_id uuid,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_confirmed_at timestamptz,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_drop_id uuid;
  restock_item jsonb;

  parsed_product_id uuid;
  parsed_actual_quantity numeric;

  audit_quantity numeric;
  configured_par_level numeric;
  calculated_recommended_quantity numeric;
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
    raise exception 'At least one restock item is required';
  end if;

  if not exists (
    select 1
    from public.inventory_audits audit
    where audit.id = p_audit_id
      and audit.source_visit_id = trim(p_source_visit_id)
      and audit.client_id = p_client_id
      and audit.stop_id = p_stop_id
      and audit.machine_id = p_machine_id
      and audit.counted_by = auth.uid()
  ) then
    raise exception
      'A synced inventory audit for this visit is required';
  end if;

  insert into public.inventory_restock_drops (
    source_visit_id,
    audit_id,
    client_id,
    stop_id,
    machine_id,
    source_driver_id,
    confirmed_at
  )
  values (
    trim(p_source_visit_id),
    p_audit_id,
    p_client_id,
    p_stop_id,
    p_machine_id,
    auth.uid(),
    p_confirmed_at
  )
  on conflict (source_visit_id)
  do update set
    audit_id = excluded.audit_id,
    client_id = excluded.client_id,
    stop_id = excluded.stop_id,
    machine_id = excluded.machine_id,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  where inventory_restock_drops.source_driver_id = auth.uid()
  returning id into saved_drop_id;

  if saved_drop_id is null then
    raise exception
      'This visit restock confirmation belongs to another user';
  end if;

  for restock_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    parsed_product_id :=
      (restock_item ->> 'product_id')::uuid;

    parsed_actual_quantity :=
      (restock_item ->> 'actual_quantity')::numeric;

    if parsed_actual_quantity < 0 then
      raise exception
        'Actual restock quantities cannot be negative';
    end if;

    select
      audit_item.quantity,
      client_product.par_level
    into
      audit_quantity,
      configured_par_level
    from public.inventory_audit_items audit_item
    join public.inventory_audits audit
      on audit.id = audit_item.audit_id
    join public.client_inventory_products client_product
      on client_product.client_id = audit.client_id
      and client_product.product_id = audit_item.product_id
      and client_product.is_active = true
    where audit_item.audit_id = p_audit_id
      and audit_item.product_id = parsed_product_id;

    if audit_quantity is null then
      raise exception
        'Product % was not included in the inventory audit',
        parsed_product_id;
    end if;

    if configured_par_level is null then
      raise exception
        'Product % does not have a configured par level',
        parsed_product_id;
    end if;

    calculated_recommended_quantity :=
      greatest(configured_par_level - audit_quantity, 0);

    insert into public.inventory_restock_drop_items (
      restock_drop_id,
      product_id,
      counted_quantity,
      par_level,
      recommended_quantity,
      actual_quantity
    )
    values (
      saved_drop_id,
      parsed_product_id,
      audit_quantity,
      configured_par_level,
      calculated_recommended_quantity,
      parsed_actual_quantity
    )
    on conflict (restock_drop_id, product_id)
    do update set
      counted_quantity = excluded.counted_quantity,
      par_level = excluded.par_level,
      recommended_quantity = excluded.recommended_quantity,
      actual_quantity = excluded.actual_quantity,
      updated_at = now();
  end loop;

  delete from public.inventory_restock_drop_items existing_item
  where existing_item.restock_drop_id = saved_drop_id
    and not exists (
      select 1
      from jsonb_array_elements(p_items) supplied_item
      where
        (supplied_item ->> 'product_id')::uuid =
          existing_item.product_id
    );

  return saved_drop_id;
end;
$$;

grant execute on function public.save_inventory_restock_drop(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb
) to authenticated;