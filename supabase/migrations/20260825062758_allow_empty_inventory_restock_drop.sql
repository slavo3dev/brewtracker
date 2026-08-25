-- =====================================================
-- FLOW-14: Allow restock confirmation with no items
--
-- A service visit may legitimately require no refill
-- when every audited product is already at or above
-- its configured par level.
--
-- In that case:
--   p_items = []
--
-- The parent inventory_restock_drops record is still
-- created so the restock step is explicitly confirmed.
-- =====================================================

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
set search_path = public
as $function$
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

  /*
   * FLOW-14:
   *
   * p_items must still be a JSON array, but an empty
   * array is now valid and means "No refill needed".
   */
  if p_items is null
    or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Restock items must be a JSON array';
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

  /*
   * Always create the parent confirmation.
   *
   * This is important even when p_items = [] because it
   * records that the driver completed the refill step and
   * confirmed that no refill was necessary.
   */
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

  /*
   * For p_items = [], this loop simply performs zero
   * iterations.
   */
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
      greatest(
        configured_par_level - audit_quantity,
        0
      );

    /*
     * FLOW-14:
     *
     * The client should only submit products that actually
     * require refill.
     */
    if calculated_recommended_quantity <= 0 then
      raise exception
        'Product % does not require refill',
        parsed_product_id;
    end if;

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
    on conflict (
      restock_drop_id,
      product_id
    )
    do update set
      counted_quantity =
        excluded.counted_quantity,
      par_level =
        excluded.par_level,
      recommended_quantity =
        excluded.recommended_quantity,
      actual_quantity =
        excluded.actual_quantity,
      updated_at = now();
  end loop;

  /*
   * Remove items that are no longer part of the
   * confirmation.
   *
   * When p_items = [], every existing child item for this
   * drop is removed.
   */
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
$function$;