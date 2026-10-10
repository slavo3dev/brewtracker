-- =====================================================
-- Simplify service visit workflow
-- - Remove signatures
-- - Remove closing QR requirement from summaries
-- - Make Drink Count configurable per route stop
-- - Change meter history to running/archive drink counts
-- =====================================================

-- -----------------------------------------------------
-- Route stop task configuration
-- -----------------------------------------------------

alter table public.stops
add column if not exists drink_count_required boolean not null default false;

-- -----------------------------------------------------
-- Drink Count
--
-- Keep machine_meter_readings to avoid an unnecessary
-- table rename/migration. The product terminology is
-- "Drink Count".
-- -----------------------------------------------------

alter table public.machine_meter_readings
add column if not exists archive_total bigint;

-- Existing cumulative readings become the initial
-- archive total for existing history.
update public.machine_meter_readings
set archive_total = reading
where archive_total is null;

alter table public.machine_meter_readings
alter column archive_total set not null;

alter table public.machine_meter_readings
add constraint machine_meter_readings_archive_total_nonnegative
check (archive_total >= 0);

-- -----------------------------------------------------
-- Remove signature feature
-- -----------------------------------------------------

drop table if exists public.service_visit_signatures;

alter table public.clients
drop column if exists signature_required;

-- -----------------------------------------------------
-- FLOW-10 closing QR columns are no longer required
-- -----------------------------------------------------

alter table public.service_visit_summaries
alter column closing_scanned_value drop not null;

alter table public.service_visit_summaries
alter column closing_verified_at drop not null;