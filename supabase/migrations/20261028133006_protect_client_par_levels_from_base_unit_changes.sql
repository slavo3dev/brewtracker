-- Protect configured client par levels from base-unit changes.
-- Preserve existing inventory movement and reserve snapshot safeguards.

CREATE OR REPLACE FUNCTION
  public.prevent_inventory_product_packaging_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Safeguard 1: Prevent packaging changes when
  -- inventory movements already exist.
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

  -- Safeguard 2: Prevent base-unit changes when
  -- historical client reserve snapshots exist.
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

  -- Safeguard 3: Prevent base-unit changes when
  -- any client assignment has a configured par level.
  -- Include inactive assignments because they may
  -- be reactivated in the future.
  IF OLD.base_unit IS DISTINCT FROM NEW.base_unit
    AND EXISTS (
      SELECT 1
      FROM public.client_inventory_products AS cip
      WHERE cip.product_id = OLD.id
        AND cip.par_level IS NOT NULL
    )
  THEN
    RAISE EXCEPTION
      'Cannot change base unit for product % because client par levels are configured',
      OLD.name
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
