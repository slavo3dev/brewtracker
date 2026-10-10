------------------------------------------------------------
-- INV-8: Product packaging and normalized quantity model
--
-- Adds packaging metadata required by the approved V2
-- inventory model and configures the existing BrewTracker
-- product catalogue where packaging can be determined from
-- the current product definition.
------------------------------------------------------------

------------------------------------------------------------
-- 1. ADD PACKAGING COLUMNS
------------------------------------------------------------

alter table public.inventory_products
add column base_unit text,
add column issue_unit text,
add column units_per_issue_unit numeric,
add column package_description text,
add column allows_loose_units boolean not null default false,
add column allows_partial_base_unit boolean not null default false;


------------------------------------------------------------
-- 2. SAFE DEFAULT FOR ALL EXISTING PRODUCTS
--
-- Every existing product starts with its current operational
-- unit as a 1:1 base/issue unit.
--
-- More specific known package configurations are applied
-- below.
------------------------------------------------------------

update public.inventory_products
set
  base_unit = unit_label,
  issue_unit = unit_label,
  units_per_issue_unit = 1,
  package_description = unit_label;


------------------------------------------------------------
-- 3. COFFEE
------------------------------------------------------------

-- A021 - 4.5 L Bag in Box
--
-- Do not attempt to measure partial liquid.
-- The operationally countable unit is the complete box.

update public.inventory_products
set
  base_unit = 'box',
  issue_unit = 'box',
  units_per_issue_unit = 1,
  package_description = '4.5 L bag-in-box',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = 'A021';


-- A038 - 12 x 1 kg bags

update public.inventory_products
set
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 12,
  package_description = '12 × 1 kg bags',
  allows_loose_units = true,
  allows_partial_base_unit = false
where sku = 'A038';


-- 3654 - 6 x 500 g bags

update public.inventory_products
set
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 6,
  package_description = '6 × 500 g bags',
  allows_loose_units = true,
  allows_partial_base_unit = false
where sku = '3654';


-- 3847 - 6 x 500 g bags

update public.inventory_products
set
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 6,
  package_description = '6 × 500 g bags',
  allows_loose_units = true,
  allows_partial_base_unit = false
where sku = '3847';


-- 7161 - 20 x 175 g pillow packs

update public.inventory_products
set
  base_unit = 'pack',
  issue_unit = 'case',
  units_per_issue_unit = 20,
  package_description = '20 × 175 g packs',
  allows_loose_units = true,
  allows_partial_base_unit = false
where sku = '7161';


-- 7178 - 2 x 3 kg cans

update public.inventory_products
set
  base_unit = 'can',
  issue_unit = 'case',
  units_per_issue_unit = 2,
  package_description = '2 × 3 kg cans',
  allows_loose_units = true,
  allows_partial_base_unit = false
where sku = '7178';


-- 7179 - 2 x 3 kg cans

update public.inventory_products
set
  base_unit = 'can',
  issue_unit = 'case',
  units_per_issue_unit = 2,
  package_description = '2 × 3 kg cans',
  allows_loose_units = true,
  allows_partial_base_unit = false
where sku = '7179';


-- 7382 - single 1.5 kg bag

update public.inventory_products
set
  base_unit = 'bag',
  issue_unit = 'bag',
  units_per_issue_unit = 1,
  package_description = '1.5 kg bag',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = '7382';


-- 7895 - 5 L Bag in Box

update public.inventory_products
set
  base_unit = 'box',
  issue_unit = 'box',
  units_per_issue_unit = 1,
  package_description = '5 L bag-in-box',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = '7895';


-- 9886 - 300 capsules.
--
-- Do not ask drivers to count individual capsules.

update public.inventory_products
set
  base_unit = 'case',
  issue_unit = 'case',
  units_per_issue_unit = 1,
  package_description = '300 capsules per case',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = '9886';


-- DECAF - 10 x 1 lb bags

update public.inventory_products
set
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 10,
  package_description = '10 × 1 lb bags',
  allows_loose_units = true,
  allows_partial_base_unit = false
where sku = 'DECAF';


-- Frac packs.
-- Current catalogue does not specify outer-case quantities,
-- therefore retain pack as the operational unit.

update public.inventory_products
set
  base_unit = 'pack',
  issue_unit = 'pack',
  units_per_issue_unit = 1,
  package_description = case sku
    when 'US1010' then '64 g / 2.2 oz pack'
    when 'US1012' then '64 g / 2.2 oz pack'
    when 'US1020' then '192 g / 6.7 oz pack'
  end,
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku in ('US1010', 'US1012', 'US1020');


------------------------------------------------------------
-- 4. POWDERS
--
-- These products do not have SKUs in the current seed, so
-- match their exact catalogue names.
------------------------------------------------------------

update public.inventory_products
set
  base_unit = 'bag',
  issue_unit = 'case',
  units_per_issue_unit = 6,
  package_description = '6 × 2 lb bags',
  allows_loose_units = true,
  allows_partial_base_unit = false
where name in (
  'Reliant Soluble Milk 6 x 2 lb Bags',
  'Reliant Hot Chocolate 6 x 2 lb Bags',
  'Reliant French Vanilla 6 x 2 lb Bags',
  'Reliant Spiced Chai 6 x 2 lb Bags'
);


------------------------------------------------------------
-- 5. SWEETENERS / STIRRERS
--
-- Do not ask drivers to count thousands of individual
-- packets/sticks.
------------------------------------------------------------

update public.inventory_products
set
  base_unit = 'box',
  issue_unit = 'box',
  units_per_issue_unit = 1,
  package_description = '2,000 packets per box',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = 'SUGAR';


update public.inventory_products
set
  base_unit = 'box',
  issue_unit = 'box',
  units_per_issue_unit = 1,
  package_description = '10 × 1,000 stirrers',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = 'STIRRERS';


update public.inventory_products
set
  base_unit = 'box',
  issue_unit = 'box',
  units_per_issue_unit = 1,
  package_description = '2,000 sugar sticks per box',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku in (
  'USSWT2000',
  'USSWT2000P',
  'USSWT2000R'
);


------------------------------------------------------------
-- 6. CUPS / LIDS
------------------------------------------------------------

-- Products currently described only as sleeves.
-- Keep sleeve as the reliable operational unit because the
-- catalogue does not specify units per sleeve.

update public.inventory_products
set
  base_unit = 'sleeve',
  issue_unit = 'sleeve',
  units_per_issue_unit = 1,
  package_description = 'sleeve',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku in (
  'US3415',
  'US3425',
  'US3431'
);


-- 1,000-count products.
-- Track the case, not individual cups/lids.

update public.inventory_products
set
  base_unit = 'case',
  issue_unit = 'case',
  units_per_issue_unit = 1,
  package_description = '1,000 count case',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku in (
  'US35012',
  'US3435',
  'US3445',
  'US35016',
  'US3468',
  'US35116'
);


-- 5008W is explicitly 20 packs x 50 = 1,000 cups.
-- Operationally track complete cases to avoid counting cups.

update public.inventory_products
set
  base_unit = 'case',
  issue_unit = 'case',
  units_per_issue_unit = 1,
  package_description = '20 packs × 50 cups (1,000 cups)',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = '5008W';


------------------------------------------------------------
-- 7. CREAMERS
------------------------------------------------------------

-- Two pump bottles can be reliably counted individually.

update public.inventory_products
set
  base_unit = 'bottle',
  issue_unit = 'case',
  units_per_issue_unit = 2,
  package_description = '2 pump bottles',
  allows_loose_units = true,
  allows_partial_base_unit = false
where name = 'CoffeeMate Creamer Nestle 2 Pump Bottles';


-- 180 individual creamer cups should not be manually counted.

update public.inventory_products
set
  base_unit = 'case',
  issue_unit = 'case',
  units_per_issue_unit = 1,
  package_description = '180 creamer cups per case',
  allows_loose_units = false,
  allows_partial_base_unit = false
where name = 'CoffeeMate Creamer Nestle 180 Count Cups';


------------------------------------------------------------
-- 8. CLEANING PRODUCTS
------------------------------------------------------------

update public.inventory_products
set
  base_unit = 'bottle',
  issue_unit = 'bottle',
  units_per_issue_unit = 1,
  package_description = 'bottle',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku in ('HLF-BLUE', 'HLF-RED');


update public.inventory_products
set
  base_unit = 'can',
  issue_unit = 'can',
  units_per_issue_unit = 1,
  package_description = '20 oz can',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = 'US3551ST';


-- Do not ask drivers to count 100 individual tablets.

update public.inventory_products
set
  base_unit = 'container',
  issue_unit = 'container',
  units_per_issue_unit = 1,
  package_description = '100 tablets per container',
  allows_loose_units = false,
  allows_partial_base_unit = false
where sku = 'US3550ST';


------------------------------------------------------------
-- 9. REQUIRED FIELDS
------------------------------------------------------------

alter table public.inventory_products
alter column base_unit set not null,
alter column issue_unit set not null,
alter column units_per_issue_unit set not null;


------------------------------------------------------------
-- 10. VALIDATION CONSTRAINTS
------------------------------------------------------------

alter table public.inventory_products
add constraint inventory_products_base_unit_not_blank
check (length(trim(base_unit)) > 0);

alter table public.inventory_products
add constraint inventory_products_issue_unit_not_blank
check (length(trim(issue_unit)) > 0);

alter table public.inventory_products
add constraint inventory_products_units_per_issue_unit_positive
check (units_per_issue_unit > 0);

alter table public.inventory_products
add constraint inventory_products_package_description_not_blank
check (
  package_description is null
  or length(trim(package_description)) > 0
);

alter table public.inventory_products
add constraint inventory_products_loose_units_require_multi_unit_issue
check (
  not allows_loose_units
  or units_per_issue_unit > 1
);


------------------------------------------------------------
-- 11. DOCUMENTATION
------------------------------------------------------------

comment on column public.inventory_products.base_unit is
'Smallest operationally reliable unit used for normalized inventory calculations.';

comment on column public.inventory_products.issue_unit is
'Package or unit normally issued or delivered.';

comment on column public.inventory_products.units_per_issue_unit is
'Number of base units represented by one issue unit.';

comment on column public.inventory_products.package_description is
'Driver-friendly package description such as 6 × 500 g bags.';

comment on column public.inventory_products.allows_loose_units is
'Whether individual base units may be counted separately from the issue package.';

comment on column public.inventory_products.allows_partial_base_unit is
'Whether fractions of a base unit may be entered when reliably measurable.';