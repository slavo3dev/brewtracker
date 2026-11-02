BEGIN;

CREATE OR REPLACE FUNCTION public.update_inventory_product(
  p_product_id uuid,
  p_name text,
  p_category public.inventory_product_category,
  p_unit_label text,
  p_base_unit text,
  p_issue_unit text,
  p_units_per_issue_unit numeric,
  p_business_types public.inventory_business_type[],
  p_sku text DEFAULT NULL,
  p_package_description text DEFAULT NULL,
  p_allows_loose_units boolean DEFAULT false,
  p_allows_partial_base_unit boolean DEFAULT false,
  p_sort_order integer DEFAULT 0,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  -- Only authenticated CEOs and managers can update products.
  IF auth.uid() IS NULL
     OR NOT (
       COALESCE(public.is_ceo(), false)
       OR COALESCE(public.is_manager(), false)
     )
  THEN
    RAISE EXCEPTION
      'Not authorized to update inventory products'
      USING ERRCODE = '42501';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Product ID is required';
  END IF;

  IF NULLIF(BTRIM(p_name), '') IS NULL
     OR NULLIF(BTRIM(p_unit_label), '') IS NULL
     OR NULLIF(BTRIM(p_base_unit), '') IS NULL
     OR NULLIF(BTRIM(p_issue_unit), '') IS NULL
     OR p_category IS NULL
  THEN
    RAISE EXCEPTION 'Required product fields cannot be empty';
  END IF;

  IF p_business_types IS NULL
     OR CARDINALITY(p_business_types) = 0
     OR ARRAY_POSITION(p_business_types, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION
      'Select at least one valid business type';
  END IF;

  IF (
    SELECT COUNT(DISTINCT selected.business_type)
    FROM UNNEST(p_business_types) AS selected(business_type)
  ) <> CARDINALITY(p_business_types)
  THEN
    RAISE EXCEPTION 'Duplicate business types are not allowed';
  END IF;

  IF p_units_per_issue_unit IS NULL
     OR p_units_per_issue_unit <= 0
  THEN
    RAISE EXCEPTION
      'Units per issue unit must be greater than zero';
  END IF;

  IF p_allows_loose_units IS NULL
     OR p_allows_partial_base_unit IS NULL
     OR p_is_active IS NULL
     OR p_sort_order IS NULL
  THEN
    RAISE EXCEPTION 'Invalid product configuration';
  END IF;

  -- Update the product.
  -- Existing packaging safeguards remain active.
  UPDATE public.inventory_products
  SET
    sku = NULLIF(BTRIM(p_sku), ''),
    name = BTRIM(p_name),
    category = p_category,
    unit_label = BTRIM(p_unit_label),
    base_unit = BTRIM(p_base_unit),
    issue_unit = BTRIM(p_issue_unit),
    units_per_issue_unit = p_units_per_issue_unit,
    package_description = NULLIF(BTRIM(p_package_description), ''),
    allows_loose_units = p_allows_loose_units,
    allows_partial_base_unit = p_allows_partial_base_unit,
    sort_order = p_sort_order,
    is_active = p_is_active,
    updated_at = NOW()
  WHERE id = p_product_id
  RETURNING id INTO v_product_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Inventory product not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Remove availability that is no longer selected.
  -- Existing trigger blocks removal when active client
  -- assignments depend on that business type.
  DELETE FROM public.inventory_product_business_types
  WHERE product_id = v_product_id
    AND NOT (business_type = ANY(p_business_types));

  -- Add newly selected business types.
  INSERT INTO public.inventory_product_business_types (
    product_id,
    business_type
  )
  SELECT
    v_product_id,
    selected.business_type
  FROM UNNEST(p_business_types) AS selected(business_type)
  ON CONFLICT (product_id, business_type) DO NOTHING;

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_inventory_product(
  uuid,
  text,
  public.inventory_product_category,
  text,
  text,
  text,
  numeric,
  public.inventory_business_type[],
  text,
  text,
  boolean,
  boolean,
  integer,
  boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_inventory_product(
  uuid,
  text,
  public.inventory_product_category,
  text,
  text,
  text,
  numeric,
  public.inventory_business_type[],
  text,
  text,
  boolean,
  boolean,
  integer,
  boolean
) TO authenticated;

COMMIT;