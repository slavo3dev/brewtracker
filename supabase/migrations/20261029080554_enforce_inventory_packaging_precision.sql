ALTER TABLE public.inventory_products
ADD CONSTRAINT inventory_product_conversion_precision
CHECK (
  units_per_issue_unit IS NOT NULL
  AND units_per_issue_unit > 0
  AND units_per_issue_unit = round(units_per_issue_unit, 3)
);