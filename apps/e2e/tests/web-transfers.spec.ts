import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TransfersPage } from '../pages/TransfersPage';
import { supabaseAdmin } from '../helpers/supabaseAdmin';

// VAŽNO: vozač mora biti u ISTOM regionu kao magacin (Milano = Italy), inače server
// puca umesto da prikaže grešku o validaciji (potvrđeno istraživanjem — driver1/2/3 su
// u Florida regionu, za koji ne postoji nijedan magacin, pa transfer uvek puca za njih).
// Takođe namerno NIJE driveraleksa, jer tog vozača koristi web-recon.spec.ts konkurentno.
const QA_DRIVER_ID = process.env.QA_DRIVER_TRANSFERS_ID!; // aleksadriver@brewtracker.com (Italy)

test('WEB-XFER-12: A valid multi-product transfer submits atomically and shows a success message', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const transfers = new TransfersPage(page);
  await transfers.goto();

  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(QA_DRIVER_ID);

  // Proizvod 1: case-only proizvod
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '1');

  // Proizvod 2: proizvod sa box + loose jedinicama
  await transfers.addProductRow();
  await transfers.selectProductForRow(1, 2);
  await transfers.fillQuantityInput(1, '1'); // box quantity
  await transfers.fillQuantityInput(2, '0'); // loose

  const beforeSubmitIso = new Date().toISOString();
  await transfers.submit();
  await transfers.expectProductsIssuedSuccessfully(2);

  // Raniji test se zaustavljao na generičkoj UI poruci o uspehu — "atomically" iz naziva testa
  // nikad nije bilo nezavisno provereno na nivou podataka. recordWarehouseTransferAction() zove
  // JEDAN RPC (record_warehouse_driver_transfer_batch) koji vraća po jedan movement ID po stavci —
  // delimično upisan transfer bi i dalje mogao da prikaže identičnu poruku da server akcija samo
  // vrati broj stavki bez provere stvarnog DB stanja. Ovde se direktno čita custody ledger i
  // potvrđuje da su TAČNO 2 nova "warehouse_issue" reda upisana za ovog vozača.
  const supabase = supabaseAdmin();
  const { data: driverLocation, error: locationError } = await supabase
    .from('inventory_locations')
    .select('id')
    .eq('driver_id', QA_DRIVER_ID)
    .eq('location_type', 'driver')
    .single();
  if (locationError || !driverLocation) {
    throw new Error(`Ne mogu da nađem inventory_locations red za vozača: ${locationError?.message}`);
  }

  const { data: movements, error: movementsError } = await supabase
    .from('inventory_movements')
    .select('id')
    .eq('to_location_id', driverLocation.id)
    .eq('movement_type', 'warehouse_issue')
    .gte('created_at', beforeSubmitIso);
  if (movementsError) {
    throw new Error(`Ne mogu da pročitam inventory_movements: ${movementsError.message}`);
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
  // Linija ostaje sa "Select product" (index 0) — proizvod namerno nije izabran.
  // Količina input se uopšte ne renderuje dok proizvod nije izabran, pa se ništa ne popunjava.

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
  await transfers.selectProductForRow(1, 1); // isti proizvod (index 1) na drugoj liniji
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

  // Podrazumevano: "Issue to driver" — From Warehouse, To Driver/Van.
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
  // "QA Test Sugar Sticks" ima allows_loose_units=false — loose input se uopšte ne renderuje.
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

  // Input ima step="1" — browser nativna validacija (stepMismatch) blokira necelobrojnu
  // vrednost pre nego što ikada stigne do JS validacije na submit-u.
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
  // loose input dobija step="1", pa decimalna vrednost nativno pada na istu proveru.
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
  // "QA Test Coffee Beans": 1 case = 6 bags. 2 case + 3 loose bags = 15 bags ukupno.
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

  // Ukupan broj realnih opcija (bez "Select product" placeholdera) u PRVOM product select-u.
  const productCount = (await page.locator('select').nth(2).locator('option').count()) - 1;

  for (let i = 0; i < productCount; i++) {
    if (i > 0) {
      await transfers.addProductRow();
    }
    await transfers.selectProductForRow(i, i + 1);
  }

  await expect(page.getByRole('button', { name: '+ Add Product' })).toBeDisabled();
});
