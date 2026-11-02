BEGIN;

ALTER TABLE public.inventory_product_business_types
ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read product availability.
CREATE POLICY
  "Authenticated users can read product business types"
ON public.inventory_product_business_types
FOR SELECT
TO authenticated
USING (true);

-- CEOs can manage availability.
CREATE POLICY
  "CEOs can manage product business types"
ON public.inventory_product_business_types
FOR ALL
TO authenticated
USING (public.is_ceo())
WITH CHECK (public.is_ceo());

-- Managers can manage availability.
CREATE POLICY
  "Managers can manage product business types"
ON public.inventory_product_business_types
FOR ALL
TO authenticated
USING (public.is_manager())
WITH CHECK (public.is_manager());

COMMIT;