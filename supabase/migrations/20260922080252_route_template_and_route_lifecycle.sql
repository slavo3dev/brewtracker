create or replace function public.delete_route_template(
  p_route_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.route_templates%rowtype;
begin
  select *
  into v_template
  from public.route_templates
  where id = p_route_template_id
  for update;

  if not found then
    raise exception 'Route template was not found.';
  end if;

  if v_template.is_active then
    raise exception
      'Deactivate the route template before deleting it.';
  end if;

  delete from public.route_templates
  where id = p_route_template_id;
end;
$$;


create or replace function public.cancel_operational_route(
  p_route_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.routes%rowtype;
begin
  select *
  into v_route
  from public.routes
  where id = p_route_id
  for update;

  if not found then
    raise exception 'Route was not found.';
  end if;

  if v_route.status = 'cancelled' then
    raise exception 'Route is already cancelled.';
  end if;

  if v_route.status = 'completed' then
    raise exception 'Completed routes cannot be cancelled.';
  end if;

  if v_route.status = 'in_progress' then
    raise exception
      'A route that is already in progress cannot be cancelled.';
  end if;

  if v_route.status <> 'scheduled' then
    raise exception
      'Only scheduled routes can be cancelled.';
  end if;

  if exists (
    select 1
    from public.stops
    where route_id = p_route_id
      and (
        status <> 'pending'
        or arrived_at is not null
        or completed_at is not null
      )
  ) then
    raise exception
      'This route cannot be cancelled because service has already started.';
  end if;

  update public.routes
  set
    status = 'cancelled',
    updated_at = now()
  where id = p_route_id;
end;
$$;


revoke all
on function public.delete_route_template(uuid)
from public;

revoke all
on function public.cancel_operational_route(uuid)
from public;

grant execute
on function public.delete_route_template(uuid)
to service_role;

grant execute
on function public.cancel_operational_route(uuid)
to service_role;