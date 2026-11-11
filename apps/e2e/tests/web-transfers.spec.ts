import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TransfersPage } from '../pages/TransfersPage';
import { supabaseAdmin } from '../helpers/supabaseAdmin';

// IMPORTANT: the driver must be in the SAME region as the warehouse (Milano = Italy),
// otherwise the server crashes instead of showing a validation error (confirmed by
// investigation — driver1/2/3 are in the Florida region, for which no warehouse exists, so
// the transfer always crashes for them). Also deliberately NOT driveraleksa, since that
// driver is used concurrently by web-recon.spec.ts.
const QA_DRIVER_ID = process.env.QA_DRIVER_TRANSFERS_ID!; // aleksadriver@brewtracker.com (Italy)

test('WEB-XFER-12: A valid multi-product transfer submits atomically and shows a success message', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);

  // Product 1: a case-only product
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '1');

  // Product 2: a product with box + loose units
  await transfers.addProductRow();
  await transfers.selectProductForRow(1, 2);
  await transfers.fillQuantityInput(1, '1'); // box quantity
  await transfers.fillQuantityInput(2, '0'); // loose

  const beforeSubmitIso = new Date().toISOString();
  await transfers.submit();
  await transfers.expectProductsIssuedSuccessfully(2);

  // The earlier test stopped at the generic UI success message — "atomically" from the
  // test's name was never independently verified at the data layer. recordWarehouseTransferAction()
  // calls A SINGLE RPC (record_warehouse_driver_transfer_batch) that returns one movement ID
  // per line item — a partially-committed transfer could still show an identical message if
  // the server action just returned the item count without checking the real DB state. Here
  // the custody ledger is read directly, confirming EXACTLY 2 new "warehouse_issue" rows were
  // written for this driver.
  const supabase = supabaseAdmin();
  const { data: driverLocation, error: locationError } = await supabase
    .from('inventory_locations')
    .select('id')
    .eq('driver_id', QA_DRIVER_ID)
    .eq('location_type', 'driver')
    .single();
  if (locationError || !driverLocation) {
    throw new Error(`Unable to find inventory_locations row for driver: ${locationError?.message}`);
  }

  const { data: movements, error: movementsError } = await supabase
    .from('inventory_movements')
    .select('id')
    .eq('to_location_id', driverLocation.id)
    .eq('movement_type', 'warehouse_issue')
    .gte('created_at', beforeSubmitIso);
  if (movementsError) {
    throw new Error(`Unable to read inventory_movements: ${movementsError.message}`);
  }
  expect(movements?.length).toBe(2);
});

test('WEB-XFER-02: Submit is blocked without a selected warehouse', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectDriver(QA_DRIVER_ID);
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '1');

  await transfers.submit();
  await transfers.expectError('Select a warehouse.');
});

test('WEB-XFER-03: Submit is blocked without a selected driver', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '1');

  await transfers.submit();
  await transfers.expectError('Select a driver.');
});

test('WEB-XFER-04: Submit is blocked when a line is missing a product', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);
  // The line stays at "Select product" (index 0) — the product is deliberately not selected.
  // The quantity input doesn't render at all until a product is selected, so nothing is filled in.

  await transfers.submit();
  await transfers.expectError('Select a product for every transfer item.');
});

test('WEB-XFER-05: Zero/empty quantity is rejected per product', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '0');

  await transfers.submit();
  await transfers.expectError(/transfer quantity must be greater than zero\./);
});

test('WEB-XFER-09: The same product added on more than one line is rejected', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '1');

  await transfers.addProductRow();
  await transfers.selectProductForRow(1, 1); // the same product (index 1) on a second line
  await transfers.fillQuantityInput(1, '1');

  await transfers.submit();
  await transfers.expectError('The same product cannot be added more than once.');
});

test('WEB-XFER-01: Changing the transfer direction swaps the From/To labels', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  // Default: "Issue to driver" — From Warehouse, To Driver/Van.
  let custody = await transfers.getCustodyValues();
  expect(custody.from).toBe('Warehouse');
  expect(custody.to).toBe('Driver / Van');

  await transfers.selectMovementType('Return to warehouse');
  custody = await transfers.getCustodyValues();
  expect(custody.from).toBe('Driver / Van');
  expect(custody.to).toBe('Warehouse');
});

test('WEB-XFER-06: Loose quantity is unavailable for a product that does not allow it', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);
  // "QA Test Sugar Sticks" has allows_loose_units=false — the loose input doesn't render at all.
  await transfers.selectProductForRowByLabel(0, 'QA-SKU-SUGAR-01 — QA Test Sugar Sticks');
  await transfers.expectLooseQuantityInputMissingForRow(0);
});

test('WEB-XFER-07: Decimal package quantity is rejected', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);
  await transfers.selectProductForRowByLabel(0, 'QA-SKU-SUGAR-01 — QA Test Sugar Sticks');

  // The input has step="1" — the browser's native validation (stepMismatch) blocks a
  // non-integer value before it ever reaches JS validation on submit.
  await transfers.fillIssueQuantityForRow(0, '2.5');
  await transfers.expectIssueQuantityInvalidForRow(0);
});

test('WEB-XFER-08: Decimal loose quantity is rejected when the product does not allow partial units', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);
  // "QA Test Coffee Beans": allows_loose_units=true, allows_partial_base_unit=false —
  // the loose input gets step="1", so a decimal value natively fails the same check.
  await transfers.selectProductForRowByLabel(0, 'QA-SKU-COFFEE-01 — QA Test Coffee Beans');
  await transfers.fillLooseQuantityForRow(0, '2.5');
  await transfers.expectLooseQuantityInvalidForRow(0);
});

test('WEB-XFER-11: "Total transfer" readout normalizes package+loose into base units', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);
  // "QA Test Coffee Beans": 1 case = 6 bags. 2 cases + 3 loose bags = 15 bags total.
  await transfers.selectProductForRowByLabel(0, 'QA-SKU-COFFEE-01 — QA Test Coffee Beans');
  await transfers.fillIssueQuantityForRow(0, '2');
  await transfers.fillLooseQuantityForRow(0, '3');

  await expect(async () => {
    const readout = await transfers.getTotalTransferReadoutForRow(0);
    expect(readout).toContain('15');
  }).toPass({ timeout: 5000 });
});

test('WEB-XFER-10: "+ Add Product" is disabled once every product has been added', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);

  // The total number of real options (excluding the "Select product" placeholder) in the
  // FIRST product select.
  const productCount = (await page.locator('select').nth(2).locator('option').count()) - 1;

  for (let i = 0; i < productCount; i++) {
    if (i > 0) {
      await transfers.addProductRow();
    }
    await transfers.selectProductForRow(i, i + 1);
  }

  await expect(page.getByRole('button', { name: '+ Add Product' })).toBeDisabled();
});
