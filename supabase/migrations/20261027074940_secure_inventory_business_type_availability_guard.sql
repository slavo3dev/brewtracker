BEGIN;

-- Check active client assignments across all regions.
-- SECURITY DEFINER prevents regional RLS from hiding
-- dependencies when managers modify global availability.

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

  RETURN OLD;
END;
$$;

COMMIT;