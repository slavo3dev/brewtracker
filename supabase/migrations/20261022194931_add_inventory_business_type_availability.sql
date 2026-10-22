BEGIN;

-- 1. Define supported business types.
CREATE TYPE public.inventory_business_type AS ENUM (
  'ocs',
  'horeca'
);

-- 2. Every client belongs to one business type.
-- Safe to make required because the development DB has no clients.
ALTER TABLE public.clients
ADD COLUMN business_type public.inventory_business_type
NOT NULL DEFAULT 'ocs';

-- 3. Define product availability by business type.
CREATE TABLE public.inventory_product_business_types (
  product_id uuid NOT NULL
    REFERENCES public.inventory_products(id)
    ON DELETE CASCADE,

  business_type public.inventory_business_type NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (product_id, business_type)
);

-- 4. Existing products remain available to both business types
-- until explicitly classified.
INSERT INTO public.inventory_product_business_types (
  product_id,
  business_type
)
SELECT
  product.id,
  business_type.business_type
FROM public.inventory_products AS product
CROSS JOIN (
  VALUES
    ('ocs'::public.inventory_business_type),
    ('horeca'::public.inventory_business_type)
) AS business_type(business_type);

-- 5. Known HORECA-only product.
DELETE FROM public.inventory_product_business_types
WHERE product_id = (
  SELECT id
  FROM public.inventory_products
  WHERE sku = '7161'
)
AND business_type = 'ocs';

-- 6. Known OCS-only product.
DELETE FROM public.inventory_product_business_types
WHERE product_id = (
  SELECT id
  FROM public.inventory_products
  WHERE sku = '5008DWALLW'
)
AND business_type = 'horeca';

-- 7. Validate client-product compatibility.
CREATE OR REPLACE FUNCTION
public.validate_client_inventory_product_business_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  client_type public.inventory_business_type;
BEGIN
  SELECT business_type
  INTO client_type
  FROM public.clients
  WHERE id = NEW.client_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_product_business_types AS availability
    WHERE availability.product_id = NEW.product_id
      AND availability.business_type = client_type
  ) THEN
    RAISE EXCEPTION
      'Product is not available for the client business type'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER
trg_validate_client_inventory_product_business_type
BEFORE INSERT OR UPDATE OF client_id, product_id
ON public.client_inventory_products
FOR EACH ROW
EXECUTE FUNCTION
public.validate_client_inventory_product_business_type();

-- 8. Index for filtering by business type.
CREATE INDEX
idx_inventory_product_business_types_business_type
ON public.inventory_product_business_types (
  business_type,
  product_id
);

COMMIT;