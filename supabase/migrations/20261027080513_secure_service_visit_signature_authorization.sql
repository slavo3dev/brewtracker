BEGIN;

-- Enforce consistent signature relationships regardless of
-- whether the operation comes from a driver, manager, or CEO.
CREATE OR REPLACE FUNCTION
  public.validate_service_visit_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_client_id uuid;
  expected_machine_id uuid;
  actual_machine_client_id uuid;
BEGIN
  -- Preserve the identity of an existing signature.
  -- Legitimate retries may update storage_path, signed_at,
  -- and updated_at.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.signed_by IS DISTINCT FROM OLD.signed_by
       OR NEW.source_visit_id IS DISTINCT FROM OLD.source_visit_id
       OR NEW.stop_id IS DISTINCT FROM OLD.stop_id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.machine_id IS DISTINCT FROM OLD.machine_id
    THEN
      RAISE EXCEPTION
        'Cannot reassign an existing service visit signature'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT s.client_id, s.machine_id
  INTO expected_client_id, expected_machine_id
  FROM public.stops AS s
  WHERE s.id = NEW.stop_id;

  IF NOT FOUND
     OR NEW.client_id IS DISTINCT FROM expected_client_id
     OR NEW.machine_id IS DISTINCT FROM expected_machine_id
  THEN
    RAISE EXCEPTION
      'Signature client or machine does not match the assigned stop'
      USING ERRCODE = '23514';
  END IF;

  SELECT m.client_id
  INTO actual_machine_client_id
  FROM public.machines AS m
  WHERE m.id = NEW.machine_id;

  IF NOT FOUND
     OR actual_machine_client_id IS DISTINCT FROM NEW.client_id
  THEN
    RAISE EXCEPTION
      'Signature machine does not belong to the assigned client'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_service_visit_signature_trigger
BEFORE INSERT OR UPDATE
ON public.service_visit_signatures
FOR EACH ROW
EXECUTE FUNCTION public.validate_service_visit_signature();

-- Replace the signature policy that previously checked
-- only whether signed_by matched auth.uid().
DROP POLICY IF EXISTS
  "Drivers manage own service signatures"
ON public.service_visit_signatures;

-- Field staff may insert signatures only for stops
-- belonging to their currently assigned routes.
CREATE POLICY "Field staff insert assigned service signatures"
ON public.service_visit_signatures
FOR INSERT
TO authenticated
WITH CHECK (
  signed_by = (SELECT auth.uid())
  AND (SELECT public.is_field_staff())
  AND EXISTS (
    SELECT 1
    FROM public.stops AS s
    WHERE s.id = stop_id
      AND public.current_user_has_route(s.route_id)
  )
);

-- Allow the original signer to retry an existing signature
-- only while assigned to the stop's route.
-- The validation trigger prevents changing its identity.
DROP POLICY IF EXISTS
  "Field staff update own service signatures"
ON public.service_visit_signatures;
CREATE POLICY "Field staff update own service signatures"
ON public.service_visit_signatures
FOR UPDATE
TO authenticated
USING (
  signed_by = (SELECT auth.uid())
  AND (SELECT public.is_field_staff())
  AND EXISTS (
    SELECT 1
    FROM public.stops AS s
    WHERE s.id = stop_id
      AND public.current_user_has_route(s.route_id)
  )
)
WITH CHECK (
  signed_by = (SELECT auth.uid())
  AND (SELECT public.is_field_staff())
  AND EXISTS (
    SELECT 1
    FROM public.stops AS s
    WHERE s.id = stop_id
      AND public.current_user_has_route(s.route_id)
  )
);

-- Remove the policy that checks the signer's region.
DROP POLICY IF EXISTS
  "Managers manage regional service signatures"
ON public.service_visit_signatures;

-- Managers may access signatures only when the
-- associated stop belongs to a client in their region.
CREATE POLICY "Managers manage regional service signatures"
ON public.service_visit_signatures
FOR ALL
TO authenticated
USING (
  (SELECT public.is_manager())
  AND EXISTS (
    SELECT 1
    FROM public.stops AS s
    WHERE s.id = stop_id
      AND s.client_id = client_id
      AND public.client_is_in_current_user_region(s.client_id)
  )
)
WITH CHECK (
  (SELECT public.is_manager())
  AND EXISTS (
    SELECT 1
    FROM public.stops AS s
    WHERE s.id = stop_id
      AND s.client_id = client_id
      AND public.client_is_in_current_user_region(s.client_id)
  )
);

COMMIT;