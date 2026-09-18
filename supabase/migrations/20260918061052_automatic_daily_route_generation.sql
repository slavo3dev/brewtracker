-- ROUTE
-- Generate operational daily routes from active recurring route templates.

alter table public.routes
add column if not exists source_route_template_id uuid
references public.route_templates(id)
on delete set null;

create index if not exists routes_source_route_template_idx
on public.routes(source_route_template_id);

-- An automatically generated template route may only be generated
-- once for a particular service date.
create unique index if not exists
routes_template_generation_unique_idx
on public.routes(source_route_template_id, route_date)
where source_route_template_id is not null;


create or replace function public.generate_routes_from_templates(
  p_route_date date
)
returns table (
  route_id uuid,
  route_template_id uuid,
  driver_id uuid,
  route_date date,
  stops_created integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_route_id uuid;
  v_stops_created integer;
  v_day_of_week integer;
begin
  if p_route_date is null then
    raise exception 'Route date is required.';
  end if;

  -- PostgreSQL:
  -- Sunday = 0
  -- Monday = 1
  -- ...
  -- Saturday = 6
  v_day_of_week :=
    extract(dow from p_route_date)::integer;

  for v_template in
    select
      rt.id,
      rt.driver_id,
      rt.warehouse_id,
      rt.notes
    from public.route_templates rt
    where rt.is_active = true
      and (
        (v_day_of_week = 0 and rt.sunday)
        or
        (v_day_of_week = 1 and rt.monday)
        or
        (v_day_of_week = 2 and rt.tuesday)
        or
        (v_day_of_week = 3 and rt.wednesday)
        or
        (v_day_of_week = 4 and rt.thursday)
        or
        (v_day_of_week = 5 and rt.friday)
        or
        (v_day_of_week = 6 and rt.saturday)
      )
    order by rt.created_at, rt.id
  loop
    -- Idempotency:
    -- if this template has already generated its route for this
    -- date, skip it.
    if exists (
      select 1
      from public.routes r
      where r.source_route_template_id =
        v_template.id
        and r.route_date = p_route_date
    ) then
      continue;
    end if;

    -- Defensive validation.
    if not exists (
      select 1
      from public.route_template_stops rts
      where rts.route_template_id =
        v_template.id
    ) then
      continue;
    end if;

    insert into public.routes (
      driver_id,
      warehouse_id,
      route_date,
      status,
      notes,
      source_route_template_id
    )
    values (
      v_template.driver_id,
      v_template.warehouse_id,
      p_route_date,
      'scheduled',
      v_template.notes,
      v_template.id
    )
    returning id
    into v_route_id;

    insert into public.stops (
      route_id,
      client_id,
      machine_id,
      sequence_number,
      status,
      scheduled_start_at,
      scheduled_end_at,
      notes,
      drink_count_required
    )
    select
      v_route_id,
      rts.client_id,
      rts.machine_id,
      rts.sequence_number,
      'pending',

      case
        when rts.scheduled_start_time is null
          then null
        else
          p_route_date::timestamp
          + rts.scheduled_start_time
      end,

      case
        when rts.scheduled_end_time is null
          then null
        else
          p_route_date::timestamp
          + rts.scheduled_end_time
      end,

      rts.notes,
      rts.drink_count_required
    from public.route_template_stops rts
    where rts.route_template_id =
      v_template.id
    order by rts.sequence_number;

    get diagnostics
      v_stops_created = row_count;

    return query
    select
      v_route_id,
      v_template.id::uuid,
      v_template.driver_id::uuid,
      p_route_date,
      v_stops_created;
  end loop;
end;
$$;