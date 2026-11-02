BEGIN;

DROP TRIGGER IF EXISTS
  trg_validate_client_inventory_product_business_type
ON public.client_inventory_products;

CREATE TRIGGER
  trg_validate_client_inventory_product_business_type
BEFORE INSERT OR UPDATE OF
  client_id,
  product_id,
  is_active
ON public.client_inventory_products
FOR EACH ROW
EXECUTE FUNCTION
  public.validate_client_inventory_product_business_type();

COMMIT;