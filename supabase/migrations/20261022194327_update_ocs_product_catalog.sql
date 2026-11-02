BEGIN;

-- ILLY INTENSO
UPDATE public.inventory_products
SET
  sku = 'I0003654',
  name = 'ILLY Intenso 500 g Beans',
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 6,
  unit_label = 'bag',
  package_description = '6 × 500 g bags',
  allows_loose_units = true,
  allows_partial_base_unit = false,
  updated_at = NOW()
WHERE sku = '3654';

-- ILLY CLASSICO
UPDATE public.inventory_products
SET
  sku = 'I0003847',
  name = 'ILLY Classico 500 g Beans',
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 6,
  unit_label = 'bag',
  package_description = '6 × 500 g bags',
  allows_loose_units = true,
  allows_partial_base_unit = false,
  updated_at = NOW()
WHERE sku = '3847';

-- ILLY DECAF
UPDATE public.inventory_products
SET
  name = 'ILLY Decaf Beans 1.5 kg',
  base_unit = 'can',
  issue_unit = 'case',
  units_per_issue_unit = 4,
  unit_label = 'can',
  package_description = '4 × 1.5 kg cans',
  allows_loose_units = true,
  allows_partial_base_unit = false,
  updated_at = NOW()
WHERE sku = '7382';

-- ROYAL PAPER R810 STIRRERS
UPDATE public.inventory_products
SET
  name = 'Royal Paper R810 Eco-Friendly Wood Coffee Stirrers',
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 10,
  unit_label = 'bag',
  package_description = '10 × 1,000 stirrers',
  allows_loose_units = true,
  allows_partial_base_unit = false,
  updated_at = NOW()
WHERE sku = 'STIRRERS';

-- CHOICE 8 OZ WHITE CUPS
UPDATE public.inventory_products
SET
  name = 'Choice 8 oz White Hot Cups',
  base_unit = 'cup',
  issue_unit = 'box',
  units_per_issue_unit = 1000,
  unit_label = 'cup',
  package_description = '20 sleeves × 50 cups = 1,000 cups',
  allows_loose_units = true,
  allows_partial_base_unit = false,
  updated_at = NOW()
WHERE sku = '5008W';

-- ILLY 8 OZ CUP LIDS
UPDATE public.inventory_products
SET
  name = 'ILLY Paper Cup Lids 8 oz',
  base_unit = 'lid',
  issue_unit = 'box',
  units_per_issue_unit = 1000,
  unit_label = 'lid',
  package_description = '1 box = 1,000 lids',
  allows_loose_units = true,
  allows_partial_base_unit = false,
  updated_at = NOW()
WHERE sku = 'US3431';

COMMIT;