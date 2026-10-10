create table public.route_templates (
  id uuid primary key default gen_random_uuid(),

  name text not null,

  driver_id uuid not null
    references public.users(id),

  warehouse_id uuid not null
    references public.warehouses(id),

  is_active boolean not null default false,

  monday boolean not null default false,
  tuesday boolean not null default false,
  wednesday boolean not null default false,
  thursday boolean not null default false,
  friday boolean not null default false,
  saturday boolean not null default false,
  sunday boolean not null default false,

  notes text,

  created_by uuid
    references public.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint route_templates_name_not_empty
    check (length(trim(name)) > 0),

  constraint route_templates_active_schedule_check
    check (
      not is_active
      or monday
      or tuesday
      or wednesday
      or thursday
      or friday
      or saturday
      or sunday
    )
);


create table public.route_template_stops (
  id uuid primary key default gen_random_uuid(),

  route_template_id uuid not null
    references public.route_templates(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id),

  machine_id uuid
    references public.machines(id),

  sequence_number integer not null,

  scheduled_start_time time,
  scheduled_end_time time,

  drink_count_required boolean not null default false,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint route_template_stops_sequence_positive
    check (sequence_number > 0),

  constraint route_template_stops_unique_sequence
    unique (
      route_template_id,
      sequence_number
    ),

  constraint route_template_stops_unique_machine
    unique (
      route_template_id,
      machine_id
    ),

  constraint route_template_stop_time_order
    check (
      scheduled_start_time is null
      or scheduled_end_time is null
      or scheduled_end_time > scheduled_start_time
    )
);


------------------------------------------------------------
-- Indexes
------------------------------------------------------------

create index route_templates_driver_idx
  on public.route_templates(driver_id);

create index route_templates_warehouse_idx
  on public.route_templates(warehouse_id);

create index route_templates_active_idx
  on public.route_templates(is_active);

create index route_template_stops_template_idx
  on public.route_template_stops(route_template_id);

create index route_template_stops_client_idx
  on public.route_template_stops(client_id);

create index route_template_stops_machine_idx
  on public.route_template_stops(machine_id);


------------------------------------------------------------
-- Row level security
------------------------------------------------------------

alter table public.route_templates
  enable row level security;

alter table public.route_template_stops
  enable row level security;


------------------------------------------------------------
-- Route template RLS
------------------------------------------------------------

create policy "CEO can read all route templates"
on public.route_templates
for select
to authenticated
using (
  public.is_ceo()
);


create policy "CEO can manage route templates"
on public.route_templates
for all
to authenticated
using (
  public.is_ceo()
)
with check (
  public.is_ceo()
);


create policy "Managers can read route templates in their region"
on public.route_templates
for select
to authenticated
using (
  public.is_manager()
  and public.warehouse_is_in_current_user_region(
    route_templates.warehouse_id
  )
);


create policy "Managers can manage route templates in their region"
on public.route_templates
for all
to authenticated
using (
  public.is_manager()
  and public.warehouse_is_in_current_user_region(
    route_templates.warehouse_id
  )
)
with check (
  public.is_manager()
  and public.warehouse_is_in_current_user_region(
    route_templates.warehouse_id
  )
);


------------------------------------------------------------
-- Route template stop RLS
------------------------------------------------------------

create policy "CEO can read all route template stops"
on public.route_template_stops
for select
to authenticated
using (
  public.is_ceo()
);


create policy "CEO can manage route template stops"
on public.route_template_stops
for all
to authenticated
using (
  public.is_ceo()
)
with check (
  public.is_ceo()
);


create policy "Managers can read regional route template stops"
on public.route_template_stops
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates template
    where template.id =
      route_template_stops.route_template_id
      and public.warehouse_is_in_current_user_region(
        template.warehouse_id
      )
  )
);


create policy "Managers can manage regional route template stops"
on public.route_template_stops
for all
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates template
    where template.id =
      route_template_stops.route_template_id
      and public.warehouse_is_in_current_user_region(
        template.warehouse_id
      )
  )
)
with check (
  public.is_manager()
  and exists (
    select 1
    from public.route_templates template
    where template.id =
      route_template_stops.route_template_id
      and public.warehouse_is_in_current_user_region(
        template.warehouse_id
      )
  )
);