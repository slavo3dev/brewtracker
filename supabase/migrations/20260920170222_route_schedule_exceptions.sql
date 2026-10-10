-- ============================================================
-- ROUTE
-- Route Exceptions and Schedule Overrides
-- ============================================================
--
-- Exceptions affect one template on one specific date.
--
-- They never modify the recurring template itself.
--
-- Supported in this checkpoint:
--
--   1. Skip the route for a date
--   2. Override the assigned driver for a date
--
-- Later ROUTE-4 work can extend this model with stop-level
-- additions/removals without changing the recurring template.


create table public.route_template_exceptions (
  id uuid primary key default gen_random_uuid(),

  route_template_id uuid not null
    references public.route_templates(id)
    on delete cascade,

  exception_date date not null,

  is_skipped boolean not null default false,

  override_driver_id uuid
    references public.users(id),

  notes text,

  created_by uuid
    references public.users(id),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint route_template_exceptions_has_action
    check (
      is_skipped = true
      or override_driver_id is not null
    ),

  constraint route_template_exceptions_skip_driver_check
    check (
      not (
        is_skipped = true
        and override_driver_id is not null
      )
    ),

  constraint route_template_exceptions_unique_date
    unique (
      route_template_id,
      exception_date
    )
);


create index route_template_exceptions_template_idx
on public.route_template_exceptions(
  route_template_id
);


create index route_template_exceptions_date_idx
on public.route_template_exceptions(
  exception_date
);


create index route_template_exceptions_driver_idx
on public.route_template_exceptions(
  override_driver_id
);

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
  v_driver_id uuid;
  v_stops_created integer;
  v_day_of_week integer;
begin
  if p_route_date is null then
    raise exception 'Route date is required.';
  end if;

  v_day_of_week :=
    extract(dow from p_route_date)::integer;

  for v_template in
    select
      rt.id,
      rt.driver_id,
      rt.warehouse_id,
      rt.notes,

      coalesce(
        rte.is_skipped,
        false
      ) as is_skipped,

      rte.override_driver_id

    from public.route_templates rt

    left join public.route_template_exceptions rte
      on rte.route_template_id = rt.id
      and rte.exception_date = p_route_date

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

    order by
      rt.created_at,
      rt.id

  loop

    -- --------------------------------------------------------
    -- ROUTE-4: skip this occurrence
    -- --------------------------------------------------------

    if v_template.is_skipped then
      continue;
    end if;


    -- --------------------------------------------------------
    -- ROUTE-4: resolve driver
    -- --------------------------------------------------------

    v_driver_id := coalesce(
      v_template.override_driver_id,
      v_template.driver_id
    );


    -- --------------------------------------------------------
    -- Defensive stop validation
    -- --------------------------------------------------------

    if not exists (
      select 1
      from public.route_template_stops rts
      where rts.route_template_id =
        v_template.id
    ) then
      continue;
    end if;


    -- --------------------------------------------------------
    -- Generate operational route
    -- --------------------------------------------------------

    v_route_id := null;

    insert into public.routes (
      driver_id,
      warehouse_id,
      route_date,
      status,
      notes,
      source_route_template_id
    )
    values (
      v_driver_id,
      v_template.warehouse_id,
      p_route_date,
      'scheduled',
      v_template.notes,
      v_template.id
    )
    on conflict do nothing
    returning id
    into v_route_id;


    -- Already generated.
    if v_route_id is null then
      continue;
    end if;


    -- --------------------------------------------------------
    -- Snapshot template stops
    -- --------------------------------------------------------

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
      v_driver_id,
      p_route_date,
      v_stops_created;

  end loop;
end;
$$;


revoke all
on function public.generate_routes_from_templates(date)
from public;

revoke all
on function public.generate_routes_from_templates(date)
from anon;

revoke all
on function public.generate_routes_from_templates(date)
from authenticated;

grant execute
on function public.generate_routes_from_templates(date)
to service_role;


-- ============================================================
-- RLS
-- ============================================================

alter table public.route_template_exceptions
enable row level security;


-- CEO

create policy
"CEOs can read route template exceptions"
on public.route_template_exceptions
for select
to authenticated
using (
  public.is_ceo()
);


create policy
"CEOs can manage route template exceptions"
on public.route_template_exceptions
for all
to authenticated
using (
  public.is_ceo()
)
with check (
  public.is_ceo()
);


-- Managers
--
-- Same authorization boundary as route_templates:
-- manager must have access to the parent template warehouse.

create policy
"Managers can read regional route template exceptions"
on public.route_template_exceptions
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates rt
    where rt.id =
      route_template_exceptions.route_template_id
      and public.warehouse_is_in_current_user_region(
        rt.warehouse_id
      )
  )
);


create policy
"Managers can manage regional route template exceptions"
on public.route_template_exceptions
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates rt
    where rt.id =
      route_template_exceptions.route_template_id
      and public.warehouse_is_in_current_user_region(
        rt.warehouse_id
      )
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates rt
    where rt.id =
      route_template_exceptions.route_template_id
      and public.warehouse_is_in_current_user_region(
        rt.warehouse_id
      )
  )
);