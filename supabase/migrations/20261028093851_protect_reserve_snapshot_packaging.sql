
-- Protect historical client reserve quantities from base-unit changes.
-- Preserve existing safeguards for products with inventory movements.

CREATE OR REPLACE FUNCTION
  public.prevent_inventory_product_packaging_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Existing safeguard: prevent packaging changes
  -- when inventory movements already exist.
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

  -- New safeguard: historical reserve quantities must
  -- retain their original base unit.
  IF OLD.base_unit IS DISTINCT FROM NEW.base_unit
    AND EXISTS (
      SELECT 1
      FROM public.client_reserve_snapshot_items AS item
      WHERE item.product_id = OLD.id
    )
  THEN
    RAISE EXCEPTION
      'Cannot change base unit for product % because client reserve snapshots exist',
      OLD.name
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
