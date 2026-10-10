------------------------------------------------------------
-- Fix recursive RLS between stops, clients, machines,
-- and routes.
------------------------------------------------------------

------------------------------------------------------------
-- HELPER FUNCTIONS
------------------------------------------------------------

create or replace function public.current_user_has_route(
  target_route_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.routes
    where routes.id = target_route_id
      and routes.driver_id = auth.uid()
  );
$$;

create or replace function public.current_user_has_client_stop(
  target_client_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.stops
    join public.routes
      on routes.id = stops.route_id
    where stops.client_id = target_client_id
      and routes.driver_id = auth.uid()
  );
$$;

create or replace function public.current_user_has_machine_stop(
  target_machine_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.stops
    join public.routes
      on routes.id = stops.route_id
    where stops.machine_id = target_machine_id
      and routes.driver_id = auth.uid()
  );
$$;

create or replace function public.client_is_in_current_user_region(
  target_client_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.clients
    where clients.id = target_client_id
      and clients.region = public.current_user_region()
  );
$$;

------------------------------------------------------------
-- LOCK DOWN FUNCTION ACCESS
------------------------------------------------------------

revoke all on function
  public.current_user_has_route(uuid)
from public;

revoke all on function
  public.current_user_has_client_stop(uuid)
from public;

revoke all on function
  public.current_user_has_machine_stop(uuid)
from public;

revoke all on function
  public.client_is_in_current_user_region(uuid)
from public;

grant execute on function
  public.current_user_has_route(uuid)
to authenticated;

grant execute on function
  public.current_user_has_client_stop(uuid)
to authenticated;

grant execute on function
  public.current_user_has_machine_stop(uuid)
to authenticated;

grant execute on function
  public.client_is_in_current_user_region(uuid)
to authenticated;

------------------------------------------------------------
-- STOPS POLICIES
------------------------------------------------------------

drop policy if exists
  "Drivers can read own route stops"
on public.stops;

drop policy if exists
  "Field staff can read own route stops"
on public.stops;

drop policy if exists
  "Field staff can update own route stops"
on public.stops;

drop policy if exists
  "Managers can read stops in their region"
on public.stops;

drop policy if exists
  "Managers can manage regional stops"
on public.stops;

create policy "Field staff can read own route stops"
on public.stops
for select
to authenticated
using (
  public.is_field_staff()
  and public.current_user_has_route(stops.route_id)
);

create policy "Field staff can update own route stops"
on public.stops
for update
to authenticated
using (
  public.is_field_staff()
  and public.current_user_has_route(stops.route_id)
)
with check (
  public.is_field_staff()
  and public.current_user_has_route(stops.route_id)
);

create policy "Managers can read stops in their region"
on public.stops
for select
to authenticated
using (
  public.is_manager()
  and public.client_is_in_current_user_region(stops.client_id)
);

create policy "Managers can manage regional stops"
on public.stops
for all
to authenticated
using (
  public.is_manager()
  and public.client_is_in_current_user_region(stops.client_id)
)
with check (
  public.is_manager()
  and public.client_is_in_current_user_region(stops.client_id)
);

------------------------------------------------------------
-- CLIENT POLICIES
------------------------------------------------------------

drop policy if exists
  "Drivers can read clients on assigned stops"
on public.clients;

drop policy if exists
  "Field staff can read clients on assigned stops"
on public.clients;

create policy "Field staff can read clients on assigned stops"
on public.clients
for select
to authenticated
using (
  public.is_field_staff()
  and public.current_user_has_client_stop(clients.id)
);

------------------------------------------------------------
-- MACHINE POLICIES
------------------------------------------------------------

drop policy if exists
  "Drivers can read machines on assigned stops"
on public.machines;

drop policy if exists
  "Field staff can read machines on assigned stops"
on public.machines;

create policy "Field staff can read machines on assigned stops"
on public.machines
for select
to authenticated
using (
  public.is_field_staff()
  and public.current_user_has_machine_stop(machines.id)
);