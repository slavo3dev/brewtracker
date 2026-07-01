create or replace function public.is_field_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() in ('driver', 'tech');
$$;

drop policy if exists "Drivers can read own routes" on public.routes;
drop policy if exists "Drivers can read own route stops" on public.stops;
drop policy if exists "Drivers can update own route stops" on public.stops;

create policy "Field staff can read own routes"
on public.routes
for select
to authenticated
using (
  public.is_field_staff()
  and driver_id = auth.uid()
);

create policy "Field staff can read own route stops"
on public.stops
for select
to authenticated
using (
  public.is_field_staff()
  and exists (
    select 1
    from public.routes
    where routes.id = stops.route_id
      and routes.driver_id = auth.uid()
  )
);

create policy "Field staff can update own route stops"
on public.stops
for update
to authenticated
using (
  public.is_field_staff()
  and exists (
    select 1
    from public.routes
    where routes.id = stops.route_id
      and routes.driver_id = auth.uid()
  )
)
with check (
  public.is_field_staff()
  and exists (
    select 1
    from public.routes
    where routes.id = stops.route_id
      and routes.driver_id = auth.uid()
  )
);