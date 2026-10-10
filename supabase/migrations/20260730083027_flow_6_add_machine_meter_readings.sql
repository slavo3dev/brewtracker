------------------------------------------------------------
-- FLOW-6: Meter reading validation
--
-- Extends machine_meter_readings created by FLOW-4.
-- Do not recreate the table.
------------------------------------------------------------

------------------------------------------------------------
-- Additional reading metadata
------------------------------------------------------------

alter table public.machine_meter_readings
  add column if not exists source_visit_id text,
  add column if not exists previous_reading bigint,
  add column if not exists delta bigint;

------------------------------------------------------------
-- Existing rows predate source_visit_id.
--
-- Give them stable legacy identifiers so source_visit_id can
-- later become required and unique.
------------------------------------------------------------

update public.machine_meter_readings
set source_visit_id = 'legacy-meter-reading:' || id::text
where source_visit_id is null;

------------------------------------------------------------
-- Calculate previous reading and delta for existing records.
------------------------------------------------------------

with ordered_readings as (
  select
    id,
    lag(reading) over (
      partition by machine_id
      order by recorded_at, created_at, id
    ) as calculated_previous_reading
  from public.machine_meter_readings
)
update public.machine_meter_readings as meter_reading
set
  previous_reading =
    ordered_readings.calculated_previous_reading,

  delta =
    case
      when ordered_readings.calculated_previous_reading is null
        then null
      else
        meter_reading.reading
        - ordered_readings.calculated_previous_reading
    end
from ordered_readings
where ordered_readings.id = meter_reading.id;

------------------------------------------------------------
-- source_visit_id prevents duplicate submission when a
-- locally persisted visit retries after an app restart.
------------------------------------------------------------

alter table public.machine_meter_readings
  alter column source_visit_id set not null;

create unique index if not exists
  machine_meter_readings_source_visit_id_idx
on public.machine_meter_readings (
  source_visit_id
);

------------------------------------------------------------
-- Validation constraints
------------------------------------------------------------

alter table public.machine_meter_readings
  drop constraint if exists
    machine_meter_readings_previous_nonnegative;

alter table public.machine_meter_readings
  add constraint machine_meter_readings_previous_nonnegative
  check (
    previous_reading is null
    or previous_reading >= 0
  );

------------------------------------------------------------
-- Trigger:
-- 1. Finds the latest reading for this machine.
-- 2. Rejects a lower reading.
-- 3. Stores previous_reading and delta automatically.
------------------------------------------------------------

create or replace function
  public.validate_machine_meter_reading()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  latest_reading bigint;
begin
  /*
   * Serialize simultaneous readings for the same machine.
   * This prevents two inserts from validating against the
   * same previous value at the same time.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(new.machine_id::text, 0)
  );

  select meter_reading.reading
  into latest_reading
  from public.machine_meter_readings as meter_reading
  where meter_reading.machine_id = new.machine_id
    and (
      tg_op = 'INSERT'
      or meter_reading.id <> new.id
    )
  order by
    meter_reading.recorded_at desc,
    meter_reading.created_at desc,
    meter_reading.id desc
  limit 1;

  new.previous_reading := latest_reading;

  if latest_reading is null then
    new.delta := null;
    return new;
  end if;

  if new.reading < latest_reading then
    raise exception
      'Meter reading % cannot be lower than previous reading %',
      new.reading,
      latest_reading
      using errcode = '23514';
  end if;

  new.delta := new.reading - latest_reading;

  return new;
end;
$$;

drop trigger if exists
  validate_machine_meter_reading_before_write
on public.machine_meter_readings;

create trigger validate_machine_meter_reading_before_write
before insert or update of reading, machine_id, recorded_at
on public.machine_meter_readings
for each row
execute function public.validate_machine_meter_reading();

------------------------------------------------------------
-- Useful indexes
------------------------------------------------------------

create index if not exists
  machine_meter_readings_service_stop_idx
on public.machine_meter_readings (
  service_stop_id
);

create index if not exists
  machine_meter_readings_recorded_by_idx
on public.machine_meter_readings (
  recorded_by
);