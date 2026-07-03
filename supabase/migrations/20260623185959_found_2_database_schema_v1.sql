create extension if not exists "pgcrypto";

create type public.app_role as enum (
  'driver',
  'tech',
  'manager',
  'ceo'
);

create type public.machine_status as enum (
  'active',
  'inactive',
  'maintenance',
  'retired'
);

create type public.route_status as enum (
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);

create type public.stop_status as enum (
  'pending',
  'in_progress',
  'completed',
  'skipped'
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  region text,
  latitude double precision,
  longitude double precision,
  geofence_radius_meters integer not null default 150,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  region text,
  contact_name text,
  contact_email text,
  contact_phone text,
  latitude double precision,
  longitude double precision,
  geofence_radius_meters integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text,
  model text,
  serial_number text unique,
  qr_code text unique,
  status public.machine_status not null default 'active',
  installed_at date,
  last_service_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.users(id),
  warehouse_id uuid references public.warehouses(id),
  route_date date not null,
  status public.route_status not null default 'draft',
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  machine_id uuid references public.machines(id),
  sequence_number integer not null,
  status public.stop_status not null default 'pending',
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  skipped_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(route_id, sequence_number)
);

create index users_role_idx on public.users(role);
create index machines_client_idx on public.machines(client_id);
create index routes_driver_idx on public.routes(driver_id);
create index routes_date_idx on public.routes(route_date);
create index stops_route_idx on public.stops(route_id);
create index stops_client_idx on public.stops(client_id);
create index stops_machine_idx on public.stops(machine_id);

alter table public.users enable row level security;
alter table public.warehouses enable row level security;
alter table public.clients enable row level security;
alter table public.machines enable row level security;
alter table public.routes enable row level security;
alter table public.stops enable row level security;