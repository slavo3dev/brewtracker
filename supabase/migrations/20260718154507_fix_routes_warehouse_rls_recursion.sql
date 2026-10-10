------------------------------------------------------------
-- Fix recursive RLS dependency between routes and warehouses
------------------------------------------------------------

------------------------------------------------------------
-- Helper: determine whether a warehouse belongs to the
-- current manager's region.
--
-- SECURITY DEFINER lets the function read the table without
-- recursively applying the caller's RLS policies.
------------------------------------------------------------

create or replace function public.warehouse_is_in_current_user_region(
  target_warehouse_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.warehouses
    where warehouses.id = target_warehouse_id
      and warehouses.region = public.current_user_region()
  );
$$;

------------------------------------------------------------
-- Helper: determine whether the current field worker has
-- any assigned route connected to the warehouse.
------------------------------------------------------------

create or replace function public.current_user_has_route_for_warehouse(
  target_warehouse_id uuid
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
    where routes.warehouse_id = target_warehouse_id
      and routes.driver_id = auth.uid()
  );
$$;

revoke all on function
  public.warehouse_is_in_current_user_region(uuid)
from public;

revoke all on function
  public.current_user_has_route_for_warehouse(uuid)
from public;

grant execute on function
  public.warehouse_is_in_current_user_region(uuid)
to authenticated;

grant execute on function
  public.current_user_has_route_for_warehouse(uuid)
to authenticated;

------------------------------------------------------------
-- Replace recursive warehouse policy
------------------------------------------------------------

drop policy if exists
  "Drivers can read assigned route warehouse"
on public.warehouses;

drop policy if exists
  "Field staff can read assigned route warehouse"
on public.warehouses;

create policy "Field staff can read assigned route warehouse"
on public.warehouses
for select
to authenticated
using (
  public.is_field_staff()
  and public.current_user_has_route_for_warehouse(warehouses.id)
);

------------------------------------------------------------
-- Replace recursive manager route policies
------------------------------------------------------------

drop policy if exists
  "Managers can read routes in their region"
on public.routes;

drop policy if exists
  "Managers can manage regional routes"
on public.routes;

create policy "Managers can read routes in their region"
on public.routes
for select
to authenticated
using (
  public.is_manager()
  and public.warehouse_is_in_current_user_region(routes.warehouse_id)
);

create policy "Managers can manage regional routes"
on public.routes
for all
to authenticated
using (
  public.is_manager()
  and public.warehouse_is_in_current_user_region(routes.warehouse_id)
)
with check (
  public.is_manager()
  and public.warehouse_is_in_current_user_region(routes.warehouse_id)
);