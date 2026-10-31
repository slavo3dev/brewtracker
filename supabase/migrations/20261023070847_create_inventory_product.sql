BEGIN;

CREATE OR REPLACE FUNCTION public.create_inventory_product(
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
  v_business_type public.inventory_business_type;
BEGIN
  -- Authorization
  IF auth.uid() IS NULL
     OR NOT (
       COALESCE(public.is_ceo(), false)
       OR COALESCE(public.is_manager(), false)
     )
  THEN
    RAISE EXCEPTION
      'Not authorized to create inventory products'
      USING ERRCODE = '42501';
  END IF;

  -- Required fields
  IF NULLIF(BTRIM(p_name), '') IS NULL
     OR NULLIF(BTRIM(p_unit_label), '') IS NULL
     OR NULLIF(BTRIM(p_base_unit), '') IS NULL
     OR NULLIF(BTRIM(p_issue_unit), '') IS NULL
  THEN
    RAISE EXCEPTION 'Required product fields cannot be empty';
  END IF;

  -- Business-type availability is required
  IF p_business_types IS NULL
     OR CARDINALITY(p_business_types) = 0
     OR ARRAY_POSITION(p_business_types, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION
      'Select at least one valid business type';
  END IF;

  -- Prevent duplicate availability entries
  IF (
    SELECT COUNT(DISTINCT business_type)
    FROM UNNEST(p_business_types) AS selected(business_type)
  ) <> CARDINALITY(p_business_types)
  THEN
    RAISE EXCEPTION 'Duplicate business types are not allowed';
  END IF;

  -- Packaging validation
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

  -- Insert product
  INSERT INTO public.inventory_products (
    sku,
    name,
    category,
    unit_label,
    base_unit,
    issue_unit,
    units_per_issue_unit,
    package_description,
    allows_loose_units,
    allows_partial_base_unit,
    sort_order,
    is_active
  )
  VALUES (
    NULLIF(BTRIM(p_sku), ''),
    BTRIM(p_name),
    p_category,
    BTRIM(p_unit_label),
    BTRIM(p_base_unit),
    BTRIM(p_issue_unit),
    p_units_per_issue_unit,
    NULLIF(BTRIM(p_package_description), ''),
    p_allows_loose_units,
    p_allows_partial_base_unit,
    p_sort_order,
    p_is_active
  )
  RETURNING id INTO v_product_id;

  -- Insert OCS/HORECA availability
  FOREACH v_business_type IN ARRAY p_business_types
  LOOP
    INSERT INTO public.inventory_product_business_types (
      product_id,
      business_type
    )
    VALUES (
      v_product_id,
      v_business_type
    );
  END LOOP;

  RETURN v_product_id;
END;
$$;

-- Restrict function execution to authenticated users.
REVOKE ALL ON FUNCTION public.create_inventory_product(
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

GRANT EXECUTE ON FUNCTION public.create_inventory_product(
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