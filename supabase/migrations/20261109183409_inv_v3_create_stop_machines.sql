-- INV-V3-02 / Step 1: Multi-machine route-stop assignments.
-- Additive migration: preserves legacy stops.machine_id and existing service APIs.
-- Run only after reviewing against the linked development database.

CREATE TABLE public.stop_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id uuid NOT NULL REFERENCES public.stops(id) ON DELETE RESTRICT,
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE RESTRICT,
  sequence_number integer NOT NULL,
  drink_count_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stop_machines_unique_machine UNIQUE (stop_id, machine_id),
  CONSTRAINT stop_machines_unique_sequence UNIQUE (stop_id, sequence_number),
  CONSTRAINT stop_machines_positive_sequence CHECK (sequence_number > 0)
);

CREATE INDEX stop_machines_machine_id_idx ON public.stop_machines(machine_id);

-- All assignment checks take a SHARE lock on the machine row. A concurrent
-- UPDATE machines.client_id cannot pass an assignment that is being created.
CREATE FUNCTION public.inv_v3_validate_stop_machine()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_stop_client uuid;
  v_stop_status public.stop_status;
  v_route_status text;
  v_machine_client uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT s.status, r.status::text
      INTO v_stop_status, v_route_status
      FROM public.stops s
      JOIN public.routes r ON r.id = s.route_id
      WHERE s.id = OLD.stop_id
      FOR SHARE OF s, r;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent stop is unavailable' USING ERRCODE = '23503';
    END IF;
    IF v_stop_status IN ('completed', 'skipped') OR v_route_status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot change machine assignments on a closed stop or cancelled route'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- Lock the original parent too if an assignment is moved to another stop.
  IF TG_OP = 'UPDATE' AND NEW.stop_id IS DISTINCT FROM OLD.stop_id THEN
    PERFORM 1 FROM public.stops WHERE id = OLD.stop_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Original stop does not exist' USING ERRCODE = '23503';
    END IF;
    SELECT s.status, r.status::text
      INTO v_stop_status, v_route_status
      FROM public.stops s JOIN public.routes r ON r.id = s.route_id
      WHERE s.id = OLD.stop_id;
    IF v_stop_status IN ('completed', 'skipped') OR v_route_status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot move an assignment from a closed stop or cancelled route'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT s.client_id, s.status, r.status::text
    INTO v_stop_client, v_stop_status, v_route_status
    FROM public.stops s
    JOIN public.routes r ON r.id = s.route_id
    WHERE s.id = NEW.stop_id
    FOR SHARE OF s, r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stop does not exist' USING ERRCODE = '23503';
  END IF;
  IF v_stop_status IN ('completed', 'skipped') OR v_route_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot change machine assignments on a closed stop or cancelled route'
      USING ERRCODE = '23514';
  END IF;

  SELECT m.client_id INTO v_machine_client
    FROM public.machines m WHERE m.id = NEW.machine_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine does not exist' USING ERRCODE = '23503';
  END IF;
  IF v_machine_client IS DISTINCT FROM v_stop_client THEN
    RAISE EXCEPTION 'Assigned machine does not belong to the stop client'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_validate_stop_machine_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.stop_machines
FOR EACH ROW EXECUTE FUNCTION public.inv_v3_validate_stop_machine();

-- Protect the legacy single-machine assignment and the stop's historical
-- client/route identity. Do not freeze unrelated operational fields, because
-- the existing mobile app still updates stops during service completion.
CREATE FUNCTION public.inv_v3_guard_stop()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_route_status text;
  v_machine_client uuid;
  v_mismatch boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('completed', 'skipped') THEN
      RAISE EXCEPTION 'Closed stops cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('completed', 'skipped') AND (
      NEW.client_id IS DISTINCT FROM OLD.client_id OR
      NEW.machine_id IS DISTINCT FROM OLD.machine_id OR
      NEW.route_id IS DISTINCT FROM OLD.route_id
    ) THEN
      RAISE EXCEPTION 'Historical stop identity and machine assignment are immutable'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Completed stops cannot be reopened' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT r.status::text INTO v_route_status
    FROM public.routes r WHERE r.id = NEW.route_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route does not exist' USING ERRCODE = '23503';
  END IF;

  IF v_route_status = 'cancelled' THEN
    IF TG_OP = 'INSERT' OR (
      TG_OP = 'UPDATE' AND (
        NEW.client_id IS DISTINCT FROM OLD.client_id OR
        NEW.machine_id IS DISTINCT FROM OLD.machine_id OR
        NEW.route_id IS DISTINCT FROM OLD.route_id OR
        NEW.status IS DISTINCT FROM OLD.status
      )
    ) THEN
      RAISE EXCEPTION 'Cannot create, reassign or reopen stops on a cancelled route'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- A skipped stop may be reopened only when its assignments are valid now.
  -- The same validation covers changing the client or legacy machine on an
  -- active stop, and initial legacy stop creation.
  IF NEW.status IN ('pending', 'in_progress') AND v_route_status <> 'cancelled' THEN
    IF NEW.machine_id IS NOT NULL THEN
      SELECT m.client_id INTO v_machine_client
        FROM public.machines m WHERE m.id = NEW.machine_id FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Legacy machine does not exist' USING ERRCODE = '23503';
      END IF;
      IF v_machine_client IS DISTINCT FROM NEW.client_id THEN
        RAISE EXCEPTION 'Legacy stop machine does not belong to the stop client'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Lock all assigned machines before checking their ownership. Existing
    -- rows of stop_machines cannot change concurrently without a stop lock.
    PERFORM 1 FROM public.machines m
      JOIN public.stop_machines sm ON sm.machine_id = m.id
      WHERE sm.stop_id = NEW.id
      ORDER BY m.id FOR SHARE OF m;

    SELECT EXISTS (
      SELECT 1 FROM public.stop_machines sm
      JOIN public.machines m ON m.id = sm.machine_id
      WHERE sm.stop_id = NEW.id AND m.client_id IS DISTINCT FROM NEW.client_id
    ) INTO v_mismatch;
    IF v_mismatch THEN
      RAISE EXCEPTION 'Stop has machines belonging to another client'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_guard_stop_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.stops
FOR EACH ROW EXECUTE FUNCTION public.inv_v3_guard_stop();

-- A transfer is allowed after all unfinished assignments have been resolved.
-- A pending stop on a cancelled route is inert, but an in-progress stop on a
-- cancelled route is treated as inconsistent and still blocks transfer.
CREATE FUNCTION public.inv_v3_guard_machine_transfer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;

  -- Lock all existing legacy and V3 stop assignments before deciding.
  -- Assignment writes take a SHARE lock on the machine, so they cannot
  -- commit a new assignment while this machine ownership update is active.
  -- Locking routes also stabilizes cancellation state for this decision.
  PERFORM 1
    FROM public.stops s
    JOIN public.routes r ON r.id = s.route_id
    WHERE s.machine_id = OLD.id
       OR EXISTS (
         SELECT 1
         FROM public.stop_machines sm
         WHERE sm.stop_id = s.id
           AND sm.machine_id = OLD.id
       )
    ORDER BY s.id, r.id
    FOR SHARE OF s, r;

  IF EXISTS (
    SELECT 1 FROM public.stops s
    JOIN public.routes r ON r.id = s.route_id
    WHERE s.machine_id = OLD.id
      AND (
        s.status = 'in_progress' OR
        (s.status = 'pending' AND r.status::text <> 'cancelled')
      )
  ) THEN
    RAISE EXCEPTION 'Cannot transfer machine: unresolved legacy stop assignment'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stop_machines sm
    JOIN public.stops s ON s.id = sm.stop_id
    JOIN public.routes r ON r.id = s.route_id
    WHERE sm.machine_id = OLD.id
      AND (
        s.status = 'in_progress' OR
        (s.status = 'pending' AND r.status::text <> 'cancelled')
      )
  ) THEN
    RAISE EXCEPTION 'Cannot transfer machine: unresolved multi-machine stop assignment'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_guard_machine_transfer_trigger
BEFORE UPDATE OF client_id ON public.machines
FOR EACH ROW EXECUTE FUNCTION public.inv_v3_guard_machine_transfer();

-- Do not reactivate a cancelled route with historical assignments whose
-- machines may already have been transferred to another client.
CREATE FUNCTION public.inv_v3_guard_route_reactivation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF OLD.status::text = 'cancelled' AND NEW.status::text <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled routes cannot be reactivated without audited reassignment'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inv_v3_guard_route_reactivation_trigger
BEFORE UPDATE OF status ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.inv_v3_guard_route_reactivation();

REVOKE ALL ON FUNCTION public.inv_v3_validate_stop_machine() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inv_v3_guard_stop() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inv_v3_guard_machine_transfer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inv_v3_guard_route_reactivation() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.stop_machines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stop_machines TO authenticated;

CREATE POLICY "CEO can manage stop machines"
ON public.stop_machines FOR ALL TO authenticated
USING (public.is_ceo()) WITH CHECK (public.is_ceo());

CREATE POLICY "Managers can manage regional stop machines"
ON public.stop_machines FOR ALL TO authenticated
USING (
  public.is_manager() AND EXISTS (
    SELECT 1 FROM public.stops s
    WHERE s.id = stop_machines.stop_id
      AND public.client_is_in_current_user_region(s.client_id)
  )
)
WITH CHECK (
  public.is_manager() AND EXISTS (
    SELECT 1 FROM public.stops s
    WHERE s.id = stop_machines.stop_id
      AND public.client_is_in_current_user_region(s.client_id)
  )
);

CREATE POLICY "Field staff can read assigned stop machines"
ON public.stop_machines FOR SELECT TO authenticated
USING (
  public.is_field_staff() AND EXISTS (
    SELECT 1 FROM public.stops s
    WHERE s.id = stop_machines.stop_id
      AND public.current_user_has_route(s.route_id)
  )
);
