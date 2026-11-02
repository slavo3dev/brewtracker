BEGIN;

-- Prevent removing product availability while
-- active client assignments depend on it.

CREATE OR REPLACE FUNCTION
public.prevent_removing_used_product_availability()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE TRIGGER
trg_prevent_removing_used_product_availability
BEFORE DELETE OR UPDATE OF product_id, business_type
ON public.inventory_product_business_types
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_removing_used_product_availability();


-- Prevent changing a client's business type when
-- its active assigned products are incompatible.

CREATE OR REPLACE FUNCTION
public.validate_client_business_type_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.business_type IS DISTINCT FROM NEW.business_type
    AND EXISTS (
      SELECT 1
      FROM public.client_inventory_products AS cip
      WHERE cip.client_id = NEW.id
        AND cip.is_active = true
        AND NOT EXISTS (
          SELECT 1
          FROM public.inventory_product_business_types AS a
          WHERE a.product_id = cip.product_id
            AND a.business_type = NEW.business_type
        )
    )
  THEN
    RAISE EXCEPTION
      'Cannot change client business type: incompatible active product assignments exist'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER
trg_validate_client_business_type_change
BEFORE UPDATE OF business_type
ON public.clients
FOR EACH ROW
EXECUTE FUNCTION
public.validate_client_business_type_change();

COMMIT;