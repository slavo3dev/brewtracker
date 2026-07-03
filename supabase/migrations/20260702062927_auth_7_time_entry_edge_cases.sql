alter table public.time_entries
add column if not exists route_id uuid references public.routes(id),
add column if not exists stop_id uuid references public.stops(id),
add column if not exists shift_end_at timestamptz,
add column if not exists auto_closed_at timestamptz,
add column if not exists auto_close_reason text;

create index if not exists time_entries_route_id_idx
on public.time_entries(route_id);

create index if not exists time_entries_stop_id_idx
on public.time_entries(stop_id);

create index if not exists time_entries_shift_end_at_idx
on public.time_entries(shift_end_at);