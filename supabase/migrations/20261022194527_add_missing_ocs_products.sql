BEGIN;

-- Choice 8oz White Smooth Double Wall Cups
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
  allows_partial_base_unit
)
SELECT
  '5008DWALLW',
  'Choice 8 oz White Smooth Double Wall Cups',
  'cups_lids',
  'cup',
  'cup',
  'box',
  500,
  '1 box = 500 cups',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_products
  WHERE sku = '5008DWALLW'
);

-- Choice 8oz Sleeves
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
  allows_partial_base_unit
)
SELECT
  NULL,
  'Choice 8 oz Cup Sleeves',
  'cups_lids',
  'sleeve',
  'sleeve',
  'box',
  1200,
  '1 box = 1,200 sleeves',
  false,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_products
  WHERE name = 'Choice 8 oz Cup Sleeves'
);

-- Splenda
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
  allows_partial_base_unit
)
SELECT
  NULL,
  'Splenda Sweetener 2000 Packets',
  'sweeteners_stirrers',
  'box',
  'box',
  'box',
  1,
  '1 box = 2,000 packets',
  false,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_products
  WHERE name = 'Splenda Sweetener 2000 Packets'
);

COMMIT;