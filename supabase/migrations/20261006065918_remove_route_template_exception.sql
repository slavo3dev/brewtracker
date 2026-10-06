create or replace function public.remove_route_template_exception(
  p_exception_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exception public.route_template_exceptions%rowtype;
  v_template public.route_templates%rowtype;
  v_route public.routes%rowtype;
  v_route_exists boolean := false;
begin

  -- ----------------------------------------------------------
  -- Validate input
  -- ----------------------------------------------------------

  if p_exception_id is null then
    raise exception
      'Route exception is required.';
  end if;


  -- ----------------------------------------------------------
  -- Find and lock exception
  -- ----------------------------------------------------------

  select rte.*
  into v_exception

  from public.route_template_exceptions rte

  where rte.id = p_exception_id

  for update;


  if not found then
    raise exception
      'Route exception does not exist.';
  end if;


  -- ----------------------------------------------------------
  -- Find template
  -- ----------------------------------------------------------

  select rt.*
  into v_template

  from public.route_templates rt

  where rt.id =
    v_exception.route_template_id;


  if not found then
    raise exception
      'Route template does not exist.';
  end if;


  -- ----------------------------------------------------------
  -- Find and lock generated operational route
  -- ----------------------------------------------------------

  select r.*
  into v_route

  from public.routes r

  where r.source_route_template_id =
      v_exception.route_template_id

    and r.route_date =
      v_exception.exception_date

  for update;


  v_route_exists := found;


  -- ----------------------------------------------------------
  -- Protect started/completed work
  -- ----------------------------------------------------------

  if v_route_exists then

    if v_route.status in (
      'in_progress'::public.route_status,
      'completed'::public.route_status
    ) then

      raise exception
        'This route has already started and can no longer be changed through a schedule exception.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Remove exception
  -- ----------------------------------------------------------

  delete from public.route_template_exceptions
  where id = v_exception.id;


  -- ----------------------------------------------------------
  -- Nothing operational exists yet.
  --
  -- Future route generation will use the normal template.
  -- ----------------------------------------------------------

  if not v_route_exists then
    return;
  end if;


  -- ----------------------------------------------------------
  -- Restore operational snapshot to normal template state
  -- ----------------------------------------------------------

  update public.routes
  set
    driver_id =
      v_template.driver_id,

    status =
      case
        when v_exception.is_skipped
          and v_route.status =
            'cancelled'::public.route_status
        then
          'scheduled'::public.route_status
        else
          v_route.status
      end,

    updated_at =
      now()

  where id =
    v_route.id;

end;
$$;


revoke all
on function public.remove_route_template_exception(uuid)
from public;


grant execute
on function public.remove_route_template_exception(uuid)
to authenticated;


grant execute
on function public.remove_route_template_exception(uuid)
to service_role;