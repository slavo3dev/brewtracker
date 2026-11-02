import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TransfersPage } from '../pages/TransfersPage';

// VAŽNO: vozač mora biti u ISTOM regionu kao magacin (Milano = Italy), inače server
// puca umesto da prikaže grešku o validaciji (potvrđeno istraživanjem — driver1/2/3 su
// u Florida regionu, za koji ne postoji nijedan magacin, pa transfer uvek puca za njih).
// Takođe namerno NIJE driveraleksa, jer tog vozača koristi web-recon.spec.ts konkurentno.
const QA_DRIVER_ID = process.env.QA_DRIVER_TRANSFERS_ID!; // aleksadriver@brewtracker.com (Italy)

test('WEB-XFER-12: Validan multi-product transfer se šalje atomično i prikazuje poruku uspeha', async ({ page }) => {
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

  await transfers.submit();
  await transfers.expectProductsIssuedSuccessfully(2);
});

test('WEB-XFER-02: Submit je blokiran bez izabranog magacina', async ({ page }) => {
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

test('WEB-XFER-03: Submit je blokiran bez izabranog vozača', async ({ page }) => {
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

test('WEB-XFER-04: Submit je blokiran kada liniji nedostaje proizvod', async ({ page }) => {
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

test('WEB-XFER-05: Nulta/prazna količina je odbijena po proizvodu', async ({ page }) => {
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

test('WEB-XFER-09: Duplirani proizvod u više linija je odbijen', async ({ page }) => {
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

test('WEB-XFER-01: Promena smera transfera menja From/To labele', async ({ page }) => {
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

test('WEB-XFER-06: Loose količina je nedostupna za proizvod koji je ne dozvoljava', async ({ page }) => {
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

test('WEB-XFER-07: Decimalna količina pakovanja je odbijena', async ({ page }) => {
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

test('WEB-XFER-08: Decimalna loose količina je odbijena kad proizvod ne dozvoljava delimične jedinice', async ({ page }) => {
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

test('WEB-XFER-11: "Total transfer" readout normalizuje pakovanje+loose u bazne jedinice', async ({ page }) => {
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

test('WEB-XFER-10: "+ Add Product" je onemogućeno kad su svi proizvodi već dodati', async ({ page }) => {
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
