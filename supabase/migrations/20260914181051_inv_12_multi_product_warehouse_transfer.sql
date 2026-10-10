------------------------------------------------------------
-- INV-12
-- Multi-product Warehouse <-> Driver transfers
--
-- One user transfer may contain multiple products.
-- Each product still creates its own immutable
-- inventory_movements ledger row.
--
-- The existing record_warehouse_driver_transfer RPC remains
-- the authoritative validator/inserter for each product.
------------------------------------------------------------

create or replace function public.record_warehouse_driver_transfer_batch(
  p_movement_type public.inventory_movement_type,
  p_warehouse_id uuid,
  p_driver_id uuid,
  p_items jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;

  v_product_id uuid;
  v_issue_quantity numeric;
  v_loose_quantity numeric;

  v_movement_id uuid;
  v_movement_ids uuid[] := array[]::uuid[];

  v_item_count integer;
  v_distinct_product_count integer;
begin
  ----------------------------------------------------------
  -- Batch validation
  ----------------------------------------------------------

  if p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception
      'Transfer items must be a JSON array';
  end if;

  v_item_count := jsonb_array_length(p_items);

  if v_item_count = 0 then
    raise exception
      'At least one inventory product is required';
  end if;

  ----------------------------------------------------------
  -- Reject malformed product IDs before casting
  ----------------------------------------------------------

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    where nullif(trim(item ->> 'product_id'), '') is null
  ) then
    raise exception
      'Every transfer item must contain a product';
  end if;

  ----------------------------------------------------------
  -- Reject duplicate products
  ----------------------------------------------------------

  select count(distinct item ->> 'product_id')
  into v_distinct_product_count
  from jsonb_array_elements(p_items) as item;

  if v_distinct_product_count <> v_item_count then
    raise exception
      'The same product cannot be added more than once to a transfer';
  end if;

  ----------------------------------------------------------
  -- Record each product movement.
  --
  -- record_warehouse_driver_transfer remains responsible for:
  --   authentication
  --   administrator authorization
  --   manager region restrictions
  --   movement type validation
  --   warehouse/driver validation
  --   product active validation
  --   package normalization
  --   loose/partial quantity rules
  --   inventory location lookup
  --   immutable movement insertion
  --
  -- Any exception rolls back the entire batch.
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
          nullif(
            trim(v_item ->> 'issue_quantity'),
            ''
          )::numeric,
          0
        );

      v_loose_quantity :=
        coalesce(
          nullif(
            trim(v_item ->> 'loose_quantity'),
            ''
          )::numeric,
          0
        );
    exception
      when invalid_text_representation then
        raise exception
          'A transfer item contains an invalid product or quantity';
    end;

    v_movement_id :=
      public.record_warehouse_driver_transfer(
        p_movement_type,
        p_warehouse_id,
        p_driver_id,
        v_product_id,
        v_issue_quantity,
        v_loose_quantity,
        p_occurred_at
      );

    v_movement_ids :=
      array_append(
        v_movement_ids,
        v_movement_id
      );
  end loop;

  return v_movement_ids;
end;
$$;


------------------------------------------------------------
-- Permissions
------------------------------------------------------------

revoke all
on function public.record_warehouse_driver_transfer_batch(
  public.inventory_movement_type,
  uuid,
  uuid,
  jsonb,
  timestamptz
)
from public;


grant execute
on function public.record_warehouse_driver_transfer_batch(
  public.inventory_movement_type,
  uuid,
  uuid,
  jsonb,
  timestamptz
)
to authenticated;


comment on function public.record_warehouse_driver_transfer_batch(
  public.inventory_movement_type,
  uuid,
  uuid,
  jsonb,
  timestamptz
) is
'INV-12 atomic multi-product Warehouse <-> Driver transfer. Creates one immutable inventory movement per product and rolls back the entire batch if any item fails.';