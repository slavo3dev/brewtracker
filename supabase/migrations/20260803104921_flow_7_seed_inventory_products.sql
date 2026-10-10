insert into public.inventory_products (
  sku,
  name,
  category,
  unit_label,
  sort_order
)
values
  -- Coffee
  ('A021', 'ILLY Bib Cold Brew 4.5 L Bag in Box', 'coffee', 'bag', 10),
  ('A038', 'ILLY Breakfast Matina - Illy Black 12 x 1 kg', 'coffee', 'case', 20),
  ('3654', 'ILLY Intenso 500 g Beans 6 x 500 g Bags', 'coffee', 'bag', 30),
  ('3847', 'ILLY Classico 500 g Beans 6 x 500 g Bags', 'coffee', 'bag', 40),
  ('7161', 'ILLY Cold Brew Pillow Pack 20 x 175 g', 'coffee', 'pack', 50),
  ('7178', 'ILLY Classico Beans 2 x 3 kg Cans', 'coffee', 'can', 60),
  ('7179', 'ILLY Intenso Beans 2 x 3 kg Cans', 'coffee', 'can', 70),
  ('7382', 'ILLY Decaf Beans 1.5 kg', 'coffee', 'bag', 80),
  ('7895', 'ILLY 5 Litre Cold Brew Bag in Box', 'coffee', 'bag', 90),
  ('9886', 'ILLY Iperespresso H Caps Classico 300 Caps', 'coffee', 'case', 100),
  ('DECAF', 'Reliant Signature Ground Decaf Arabica 10 x 1 lb Bags', 'coffee', 'bag', 110),
  ('US1010', 'ILLY Frac Pack Intenso 64 g / 2.2 oz', 'coffee', 'pack', 120),
  ('US1012', 'ILLY Frac Pack Decaf 64 g / 2.2 oz', 'coffee', 'pack', 130),
  ('US1020', 'ILLY Frac Pack Intenso 192 g / 6.7 oz', 'coffee', 'pack', 140),

  -- Powders
  (null, 'Reliant Soluble Milk 6 x 2 lb Bags', 'powders', 'bag', 210),
  (null, 'Reliant Hot Chocolate 6 x 2 lb Bags', 'powders', 'bag', 220),
  (null, 'Reliant French Vanilla 6 x 2 lb Bags', 'powders', 'bag', 230),
  (null, 'Reliant Spiced Chai 6 x 2 lb Bags', 'powders', 'bag', 240),

  -- Sweeteners and stirrers
  ('SUGAR', 'Domino Regular Sugar - 2k Packets', 'sweeteners_stirrers', 'packet', 310),
  ('STIRRERS', 'Wood Stirrers R810 5-1/2 inch 10/1000 CT', 'sweeteners_stirrers', 'box', 320),
  ('USSWT2000', 'ILLY Sugar Sticks Regular 2k Packs', 'sweeteners_stirrers', 'pack', 330),
  ('USSWT2000P', 'ILLY Sugar Sticks 0 Calorie 2k Packs', 'sweeteners_stirrers', 'pack', 340),
  ('USSWT2000R', 'ILLY Sugar Sticks Raw Cane Brown Sugar 2k Packs', 'sweeteners_stirrers', 'pack', 350),

  -- Cups and lids
  ('US3415', 'ILLY Paper Cups 4 oz', 'cups_lids', 'sleeve', 410),
  ('US3425', 'ILLY Paper Cups 8 oz', 'cups_lids', 'sleeve', 420),
  ('US3431', 'ILLY Paper Cup Lids 8 oz', 'cups_lids', 'sleeve', 430),
  ('US35012', 'ILLY Plastic Cups 12 oz 1000 CT', 'cups_lids', 'case', 440),
  ('US3435', 'ILLY Paper Cups 12 oz 1000 CT', 'cups_lids', 'case', 450),
  ('US3445', 'ILLY Paper Cups 16 oz 1000 CT', 'cups_lids', 'case', 460),
  ('US35016', 'ILLY Logo Plastic Cups 16 oz 1000 CT', 'cups_lids', 'case', 470),
  ('US3468', 'ILLY Paper Cup Lids 12/16/20 oz 1000 CT', 'cups_lids', 'case', 480),
  ('US35116', 'ILLY Plastic Lid 12/16/20 Flat 1000 CT', 'cups_lids', 'case', 490),
  ('5008W', '8 oz Choice White Hot Cups 1k - 20 Packs x 50', 'cups_lids', 'case', 500),

  -- Creamers
  (null, 'CoffeeMate Creamer Nestle 2 Pump Bottles', 'creamers', 'bottle', 610),
  (null, 'CoffeeMate Creamer Nestle 180 Count Cups', 'creamers', 'case', 620),

  -- Cleaning
  ('HLF-BLUE', 'Milk Line Detergent Cleaner - Alkaline - MFC Blue 700', 'cleaning', 'bottle', 710),
  ('HLF-RED', 'Milk Line Detergent Cleaner - Acid Based Descaler - Green 700W', 'cleaning', 'bottle', 720),
  ('US3551ST', 'Cafiza Coffee Cleaning Powder - 20 oz Can', 'cleaning', 'can', 730),
  ('US3550ST', 'Cafiza 2 g Tablet - 100 CT E31', 'cleaning', 'container', 740)
on conflict (sku)
do update set
  name = excluded.name,
  category = excluded.category,
  unit_label = excluded.unit_label,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();