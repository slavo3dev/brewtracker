BEGIN;

-- Preserve the existing active-client dependency safeguard.
-- Return NEW for allowed UPDATE operations so changes persist.
-- Return OLD for allowed DELETE operations.
--
-- SECURITY DEFINER ensures regional RLS cannot hide
-- active client assignments in other regions.

CREATE OR REPLACE FUNCTION
public.prevent_removing_used_product_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.client_inventory_products AS cip
    JOIN public.clients AS c
      ON c.id = cip.client_id
    WHERE cip.product_id = OLD.product_id
      AND cip.is_active = true
      AND c.business_type = OLD.business_type
  ) THEN
    RAISE EXCEPTION
      'Cannot remove product availability while active client assignments exist'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;