-- INV-V3-05
-- Support machine meter readings for legacy and multi-machine stops.

DROP POLICY IF EXISTS
  "Drivers can insert assigned machine meter readings"
ON public.machine_meter_readings;

CREATE POLICY
  "Drivers can insert assigned machine meter readings"
ON public.machine_meter_readings
FOR INSERT
TO authenticated
WITH CHECK (
  is_driver()
  AND recorded_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.stops s
    JOIN public.routes r
      ON r.id = s.route_id
    WHERE s.id = machine_meter_readings.service_stop_id
      AND r.driver_id = auth.uid()
      AND (
        s.machine_id = machine_meter_readings.machine_id
        OR EXISTS (
          SELECT 1
          FROM public.stop_machines sm
          WHERE sm.stop_id = s.id
            AND sm.machine_id = machine_meter_readings.machine_id
        )
      )
  )
);

DROP POLICY IF EXISTS
  "Drivers can read assigned machine meter readings"
ON public.machine_meter_readings;

CREATE POLICY
  "Drivers can read assigned machine meter readings"
ON public.machine_meter_readings
FOR SELECT
TO authenticated
USING (
  is_driver()
  AND EXISTS (
    SELECT 1
    FROM public.stops s
    JOIN public.routes r
      ON r.id = s.route_id
    WHERE r.driver_id = auth.uid()
      AND (
        s.machine_id = machine_meter_readings.machine_id
        OR EXISTS (
          SELECT 1
          FROM public.stop_machines sm
          WHERE sm.stop_id = s.id
            AND sm.machine_id = machine_meter_readings.machine_id
        )
      )
  )
);