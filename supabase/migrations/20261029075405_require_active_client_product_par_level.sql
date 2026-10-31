ALTER TABLE public.client_inventory_products
ADD CONSTRAINT active_client_product_requires_par_level
CHECK (
  is_active IS NOT TRUE
  OR (
    par_level IS NOT NULL
    AND par_level >= 0
  )
);