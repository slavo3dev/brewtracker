-- =====================================================
-- Simplify Drink Count history
--
-- - Keep DB protection against decreasing Running Total
-- - Keep per-machine write serialization
-- - Stop populating legacy previous_reading / delta
-- - Remove unused previous_reading / delta columns
-- =====================================================

-- -----------------------------------------------------
-- Simplify Running Total validation trigger function
-- -----------------------------------------------------

create or replace function public.validate_machine_meter_reading()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  latest_reading bigint;
begin
  /*
   * Serialize simultaneous writes for the same machine.
   *
   * This prevents two readings from validating against
   * the same previous Running Total concurrently.
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

  /*
   * FLOW-14:
   * Running Total resets are not supported yet.
   */
  if latest_reading is not null
    and new.reading < latest_reading
  then
    raise exception
      'Running Total % cannot be lower than previous Running Total %',
      new.reading,
      latest_reading
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

-- -----------------------------------------------------
-- Remove legacy FLOW-6 calculated columns
-- -----------------------------------------------------

alter table public.machine_meter_readings
drop column if exists previous_reading;

alter table public.machine_meter_readings
drop column if exists delta;