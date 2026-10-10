------------------------------------------------------------
-- FLOW-19
-- Calculate & Persist Client Reserve After Service
--
-- Reserve After =
--   Reserve Before + Actual Client Delivery
--
-- FLOW-18 machine refill is intentionally excluded because
-- machine refill represents Driver -> Machine.
------------------------------------------------------------

create or replace function public.save_client_reserve_after_service(
  p_source_visit_id text,
  p_client_id uuid,
  p_stop_id uuid,
  p_machine_id uuid,
  p_calculated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();

  v_before_snapshot_id uuid;
  v_delivery_id uuid;
  v_after_snapshot_id uuid;

  v_before_item record;

  v_delivery_quantity numeric;
  v_after_quantity numeric;
begin
  ----------------------------------------------------------
  -- Authentication / input validation
  ----------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_source_visit_id is null
     or length(trim(p_source_visit_id)) = 0 then
    raise exception 'A service visit ID is required';
  end if;

  if p_client_id is null then
    raise exception 'A client ID is required';
  end if;

  if p_stop_id is null then
    raise exception 'A stop ID is required';
  end if;

  if p_machine_id is null then
    raise exception 'A machine ID is required';
  end if;

  if p_calculated_at is null then
    raise exception 'A calculation timestamp is required';
  end if;


  ----------------------------------------------------------
  -- Validate that this stop belongs to the current driver
  -- and matches the supplied client/machine.
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
  -- FLOW-16:
  -- Find this visit's before-service reserve snapshot.
  ----------------------------------------------------------

  select snapshot.id
  into v_before_snapshot_id
  from public.client_reserve_snapshots snapshot
  where snapshot.source_visit_id = trim(p_source_visit_id)
    and snapshot.client_id = p_client_id
    and snapshot.stop_id = p_stop_id
    and snapshot.machine_id = p_machine_id
    and snapshot.stage = 'before_service'
    and snapshot.recorded_by = v_user_id
  limit 1;

  if v_before_snapshot_id is null then
    raise exception
      'A synced client reserve count is required before calculating reserve after service';
  end if;


  ----------------------------------------------------------
  -- FLOW-17:
  -- Require a delivery explicitly linked to that exact
  -- FLOW-16 reserve snapshot.
  ----------------------------------------------------------

  select delivery.id
  into v_delivery_id
  from public.client_deliveries delivery
  where delivery.source_visit_id = trim(p_source_visit_id)
    and delivery.reserve_snapshot_id = v_before_snapshot_id
    and delivery.client_id = p_client_id
    and delivery.stop_id = p_stop_id
    and delivery.machine_id = p_machine_id
    and delivery.delivered_by = v_user_id
  limit 1;

  if v_delivery_id is null then
    raise exception
      'A synced client delivery for the before-service reserve snapshot is required';
  end if;


  ----------------------------------------------------------
  -- Idempotency.
  --
  -- If FLOW-19 has already been persisted for this visit,
  -- return the existing snapshot.
  ----------------------------------------------------------

  select snapshot.id
  into v_after_snapshot_id
  from public.client_reserve_snapshots snapshot
  where snapshot.source_visit_id = trim(p_source_visit_id)
    and snapshot.client_id = p_client_id
    and snapshot.stop_id = p_stop_id
    and snapshot.machine_id = p_machine_id
    and snapshot.stage = 'after_service'
    and snapshot.recorded_by = v_user_id
  limit 1;

  if v_after_snapshot_id is not null then
    return v_after_snapshot_id;
  end if;


  ----------------------------------------------------------
  -- Create derived after-service snapshot.
  ----------------------------------------------------------

  insert into public.client_reserve_snapshots (
    source_visit_id,
    client_id,
    stop_id,
    machine_id,
    stage,
    recorded_by,
    recorded_at
  )
  values (
    trim(p_source_visit_id),
    p_client_id,
    p_stop_id,
    p_machine_id,
    'after_service',
    v_user_id,
    p_calculated_at
  )
  returning id into v_after_snapshot_id;


  ----------------------------------------------------------
  -- Calculate:
  --
  -- Reserve After =
  --   Reserve Before + Actual Client Delivery
  --
  -- FLOW-18 machine refill is NOT involved.
  ----------------------------------------------------------

  for v_before_item in
    select
      item.product_id,
      item.normalized_quantity,
      item.normalized_unit,
      item.base_unit_snapshot,
      item.issue_unit_snapshot,
      item.units_per_issue_unit_snapshot,
      item.package_description_snapshot
    from public.client_reserve_snapshot_items item
    where item.snapshot_id = v_before_snapshot_id
  loop

    select delivery_item.actual_quantity
    into v_delivery_quantity
    from public.client_delivery_items delivery_item
    where delivery_item.delivery_id = v_delivery_id
      and delivery_item.product_id = v_before_item.product_id
    limit 1;

    v_delivery_quantity :=
      coalesce(v_delivery_quantity, 0);

    if v_delivery_quantity < 0 then
      raise exception
        'Client delivery quantity cannot be negative';
    end if;

    v_after_quantity :=
      v_before_item.normalized_quantity
      + v_delivery_quantity;


    --------------------------------------------------------
    -- This is a calculated snapshot, not a physical count.
    --
    -- entered_issue_quantity / entered_loose_quantity = 0
    -- intentionally.
    --------------------------------------------------------

    insert into public.client_reserve_snapshot_items (
      snapshot_id,
      product_id,
      normalized_quantity,
      normalized_unit,
      entered_issue_quantity,
      entered_loose_quantity,
      base_unit_snapshot,
      issue_unit_snapshot,
      units_per_issue_unit_snapshot,
      package_description_snapshot
    )
    values (
      v_after_snapshot_id,
      v_before_item.product_id,
      v_after_quantity,
      v_before_item.normalized_unit,
      0,
      0,
      v_before_item.base_unit_snapshot,
      v_before_item.issue_unit_snapshot,
      v_before_item.units_per_issue_unit_snapshot,
      v_before_item.package_description_snapshot
    );

  end loop;


  return v_after_snapshot_id;
end;
$$;


revoke all
on function public.save_client_reserve_after_service(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz
)
from public;


grant execute
on function public.save_client_reserve_after_service(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz
)
to authenticated;


comment on function public.save_client_reserve_after_service(
  text,
  uuid,
  uuid,
  uuid,
  timestamptz
)
is
'FLOW-19: derives and persists Client Reserve After Service as Reserve Before + Actual Client Delivery. Machine refill is intentionally excluded.';