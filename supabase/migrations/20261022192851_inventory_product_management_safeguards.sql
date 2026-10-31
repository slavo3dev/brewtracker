-- Ensure quantities use whole base units when
-- fractional base units are not permitted.

ALTER TABLE public.inventory_products
ADD CONSTRAINT inventory_products_whole_unit_conversion
CHECK (
  allows_partial_base_unit
  OR units_per_issue_unit = TRUNC(units_per_issue_unit)
);

-- Protect product packaging after stock movements exist.

CREATE OR REPLACE FUNCTION
  public.prevent_inventory_product_packaging_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    OLD.base_unit IS DISTINCT FROM NEW.base_unit
    OR OLD.issue_unit IS DISTINCT FROM NEW.issue_unit
    OR OLD.units_per_issue_unit
      IS DISTINCT FROM NEW.units_per_issue_unit
    OR OLD.allows_loose_units
      IS DISTINCT FROM NEW.allows_loose_units
    OR OLD.allows_partial_base_unit
      IS DISTINCT FROM NEW.allows_partial_base_unit
  )
  AND EXISTS (
    SELECT 1
    FROM public.inventory_movements AS movement
    WHERE movement.product_id = OLD.id
  )
  THEN
    RAISE EXCEPTION
      'Cannot change packaging for product % because inventory movements exist',
      OLD.name
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER
  trg_prevent_inventory_product_packaging_change
BEFORE UPDATE ON public.inventory_products
FOR EACH ROW
EXECUTE FUNCTION
  public.prevent_inventory_product_packaging_change();