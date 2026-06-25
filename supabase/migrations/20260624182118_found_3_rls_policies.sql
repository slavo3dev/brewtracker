alter table public.users
add column if not exists region text;

create or replace function public.current_user_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.current_user_region()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select region from public.users where id = auth.uid()
$$;

create or replace function public.is_ceo()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'ceo'
$$;

create or replace function public.is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'manager'
$$;

create or replace function public.is_driver()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'driver'
$$;

create policy "Users can read own profile"
on public.users
for select
to authenticated
using (id = auth.uid());

create policy "CEO can read all users"
on public.users
for select
to authenticated
using (public.is_ceo());

create policy "Managers can read users in their region"
on public.users
for select
to authenticated
using (
  public.is_manager()
  and region = public.current_user_region()
);

create policy "CEO and managers can read warehouses"
on public.warehouses
for select
to authenticated
using (
  public.is_ceo()
  or (
    public.is_manager()
    and region = public.current_user_region()
  )
);

create policy "Drivers can read assigned route warehouse"
on public.warehouses
for select
to authenticated
using (
  public.is_driver()
  and exists (
    select 1
    from public.routes
    where routes.warehouse_id = warehouses.id
      and routes.driver_id = auth.uid()
  )
);

create policy "CEO and managers can read clients"
on public.clients
for select
to authenticated
using (
  public.is_ceo()
  or (
    public.is_manager()
    and region = public.current_user_region()
  )
);

create policy "Drivers can read clients on assigned stops"
on public.clients
for select
to authenticated
using (
  public.is_driver()
  and exists (
    select 1
    from public.stops
    join public.routes on routes.id = stops.route_id
    where stops.client_id = clients.id
      and routes.driver_id = auth.uid()
  )
);

create policy "CEO and managers can read machines"
on public.machines
for select
to authenticated
using (
  public.is_ceo()
  or (
    public.is_manager()
    and exists (
      select 1
      from public.clients
      where clients.id = machines.client_id
        and clients.region = public.current_user_region()
    )
  )
);

create policy "Drivers can read machines on assigned stops"
on public.machines
for select
to authenticated
using (
  public.is_driver()
  and exists (
    select 1
    from public.stops
    join public.routes on routes.id = stops.route_id
    where stops.machine_id = machines.id
      and routes.driver_id = auth.uid()
  )
);

create policy "CEO can read all routes"
on public.routes
for select
to authenticated
using (public.is_ceo());

create policy "Managers can read routes in their region"
on public.routes
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.warehouses
    where warehouses.id = routes.warehouse_id
      and warehouses.region = public.current_user_region()
  )
);

create policy "Drivers can read own routes"
on public.routes
for select
to authenticated
using (
  driver_id = auth.uid()
);

create policy "CEO can read all stops"
on public.stops
for select
to authenticated
using (public.is_ceo());

create policy "Managers can read stops in their region"
on public.stops
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients
    where clients.id = stops.client_id
      and clients.region = public.current_user_region()
  )
);

create policy "Drivers can read own route stops"
on public.stops
for select
to authenticated
using (
  exists (
    select 1
    from public.routes
    where routes.id = stops.route_id
      and routes.driver_id = auth.uid()
  )
);

create policy "CEO can manage warehouses"
on public.warehouses
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

create policy "Managers can manage regional warehouses"
on public.warehouses
for all
to authenticated
using (
  public.is_manager()
  and region = public.current_user_region()
)
with check (
  public.is_manager()
  and region = public.current_user_region()
);

create policy "CEO can manage clients"
on public.clients
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

create policy "Managers can manage regional clients"
on public.clients
for all
to authenticated
using (
  public.is_manager()
  and region = public.current_user_region()
)
with check (
  public.is_manager()
  and region = public.current_user_region()
);

create policy "CEO can manage machines"
on public.machines
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

create policy "Managers can manage regional machines"
on public.machines
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients
    where clients.id = machines.client_id
      and clients.region = public.current_user_region()
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.clients
    where clients.id = machines.client_id
      and clients.region = public.current_user_region()
  )
);

create policy "CEO can manage routes"
on public.routes
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

create policy "Managers can manage regional routes"
on public.routes
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.warehouses
    where warehouses.id = routes.warehouse_id
      and warehouses.region = public.current_user_region()
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.warehouses
    where warehouses.id = routes.warehouse_id
      and warehouses.region = public.current_user_region()
  )
);

create policy "CEO can manage stops"
on public.stops
for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

create policy "Managers can manage regional stops"
on public.stops
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients
    where clients.id = stops.client_id
      and clients.region = public.current_user_region()
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.clients
    where clients.id = stops.client_id
      and clients.region = public.current_user_region()
  )
);