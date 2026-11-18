------------------------------------------------------------
-- WAREHOUSE GEOFENCE RADIUS PRECISION FIX
--
-- geofence_radius_meters was an integer column, but the
-- warehouses page accepts a fractional feet radius
-- (input step="any") and converts it with feetToMeters()
-- before saving. Almost any feet value produces a fractional
-- meters result, which Postgres rejects when writing to an
-- integer column ("invalid input syntax for type integer"),
-- crashing the page on save. Widening the column lets any
-- feet value round-trip without loss of precision.
------------------------------------------------------------

alter table public.warehouses
  alter column geofence_radius_meters type double precision
  using geofence_radius_meters::double precision;
