import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { ReconciliationPage } from '../pages/ReconciliationPage';
import { TransfersPage } from '../pages/TransfersPage';

// Reconciliation testovi dele iste vozače/baseline-ove u bazi — server ne podnosi
// dobro konkurentnu potvrdu iste rekonsilijacije (puca umesto čiste greške), pa ovi
// testovi rade jedan za drugim, ne paralelno.
test.describe.configure({ mode: 'serial' });

test('WEB-RECON-01: Reconciliation stranica se učitava sa driver selektorom', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.expectDriverSelectorVisible();
});

test('WEB-RECON-02: Izbor vozača učitava očekivani inventar vozila', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.selectDriverByLabel('New User — driveraleksa@brewtracker.com');
  await recon.expectPhysicalCountLoaded();
});

test('WEB-RECON-09: Potvrda rekonsilijacije čuva je kao novu osnovu', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.selectDriverByLabel('New User — driveraleksa@brewtracker.com');
  await recon.enterFirstPhysicalCount('5');
  await recon.clickReview();
  await recon.clickConfirm();
  await recon.expectConfirmed();

  // Sveža provera: ponovo učitaj stranicu, izaberi istog vozača i potvrdi da je EXPECTED ažuriran.
  await recon.goto();
  await recon.selectDriverByLabel('New User — driveraleksa@brewtracker.com');
  await recon.expectExpectedValueForFirstProduct('5 case');
});

test('WEB-RECON-04: Varijansa se računa uživo kao physical minus expected', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);

  // Koristi DRUGOG vozača od WEB-RECON-09 (ne driveraleksa) da izbegnemo konkurentnu
  // potvrdu iste rekonsilijacije kad testovi rade paralelno (server ne podnosi to dobro).
  const driverLabel = `New User — ${process.env.QA_DRIVER_OTHER_REGION_EMAIL}`;

  // Osiguraj da prvi proizvod ima baseline (preduslov za ovaj test).
  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.enterFirstPhysicalCount('5');
  await recon.clickReview();
  await recon.clickConfirm();
  await recon.expectConfirmed();

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  const expected = await recon.getFirstProductExpectedQuantity();

  // Unesi fizičko stanje koje je za 2 veće od očekivanog i proveri da se varijansa
  // odmah prikaže (bez slanja forme) kao razlika physical - expected.
  await recon.enterFirstPhysicalCount(String(expected + 2));
  await recon.expectVarianceForFirstProduct('+2 case');
});

test('WEB-RECON-05: Review je blokiran bez unetih brojeva', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.selectDriverByLabel('New User — driveraleksa@brewtracker.com');
  await recon.expectReviewBlockedWithNoCounts();
});

test('WEB-RECON-10: Expected količina postaje potvrđeni count nakon potvrde', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  // Treći, zaseban vozač (ne koristi se u RECON-09/04) da izbegnemo konkurentnu potvrdu.
  const driverLabel = `New User — ${process.env.QA_DRIVER_REFRESH_TEST_EMAIL}`;
  const confirmedCount = '9';

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.enterFirstPhysicalCount(confirmedCount);
  await recon.clickReview();
  await recon.clickConfirm();
  await recon.expectConfirmed();

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  const expected = await recon.getFirstProductExpectedQuantity();
  expect(expected).toBe(parseInt(confirmedCount, 10));
});

test('WEB-RECON-11: Kasniji pokreti menjaju očekivanu količinu', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = 'New User — driveraleksa@brewtracker.com';

  // 1) Uspostavi poznatu osnovu (baseline).
  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.enterFirstPhysicalCount('5');
  await recon.clickReview();
  await recon.clickConfirm();
  await recon.expectConfirmed();

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  const baseline = await recon.getFirstProductExpectedQuantity();
  expect(baseline).toBe(5);

  // 2) Nova isporuka vozaču POSLE potvrđene osnove (bez nove rekonsilijacije).
  const transfers = new TransfersPage(page);
  await transfers.goto();
  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(process.env.QA_DRIVER_ID!);
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '3');
  await transfers.submit();
  await transfers.expectProductsIssuedSuccessfully(1);

  // 3) Expected na reconciliation stranici treba da odražava bazu + novi pokret, bez nove potvrde.
  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  const expectedAfterTransfer = await recon.getFirstProductExpectedQuantity();
  expect(expectedAfterTransfer).toBe(baseline + 3);
});

test('WEB-RECON-03: Proizvod bez osnove pokazuje "No baseline"', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  // Dedikovan vozač za koji NIKADA ne potvrđujemo rekonsilijaciju — ostaje trajno bez osnove.
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.expectNoBaselineForFirstProduct();

  await recon.enterPhysicalCountForRow(0, '3');
  await recon.expectVarianceForFirstProduct('—');
  await recon.expectNoBaselineNoteVisible();
});

test('WEB-RECON-06: Samo izbrojani proizvodi su uključeni u review', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  // Unesi count za TAČNO 2 proizvoda, ostale ostavi prazne.
  await recon.enterPhysicalCountForRow(0, '4');
  await recon.enterPhysicalCountForRow(1, '2');
  await recon.clickReview();

  await recon.expectReviewItemCount(2);
});

test('WEB-RECON-07: Nevalidna fizička količina je odbijena', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);

  const { blockedNatively } = await recon.attemptNegativePhysicalCount('-5');
  if (blockedNatively) {
    // Browser (min="0") je blokirao submit pre nego što je ikada stigao do JS validacije.
    expect(blockedNatively).toBe(true);
  } else {
    // JS validacija u formi je uhvatila negativnu vrednost.
    await expect(page.getByText('enter a valid physical quantity.', { exact: false })).toBeVisible();
  }
  // Review ekran se ne prikazuje u oba slučaja — "Back to edit" postoji SAMO na review
  // ekranu (submit dugme na formi takođe ima tekst "Review reconciliation", pa taj tekst
  // sam po sebi nije pouzdan indikator da li smo prešli na review korak).
  await expect(page.getByRole('button', { name: 'Back to edit' })).toHaveCount(0);
});

test('WEB-RECON-12: Razlog i napomene se čuvaju uz rekonsilijaciju', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON12_EMAIL}`;
  const reasonText = 'QA RECON-12 reason text';
  const notesText = 'QA RECON-12 notes text';

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.enterPhysicalCountForRow(0, '6');
  await recon.enterReasonForRow(0, reasonText);
  await recon.fillNotes(notesText);
  await recon.clickReview();
  await recon.expectReviewContainsReason(reasonText);

  await recon.clickConfirm();
  await recon.expectConfirmed();
  await recon.expectReviewContainsReason(reasonText);

  // Istorija: razlog i napomene se vide i tamo.
  await page.goto('/dashboard/inventory/reconciliation/history');
  const card = page.locator('details').filter({ hasText: 'QA USR-01 Test User' }).first();
  await card.locator('summary').click();
  await expect(card.getByText(notesText)).toBeVisible();
  await expect(card.getByText(reasonText)).toBeVisible();
});

test('WEB-RECON-14: Reconciliation stranice sprovode admin auth', async ({ page }) => {
  await page.goto('/dashboard/inventory/reconciliation');
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/dashboard/inventory/reconciliation/history');
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-RECON-08: "Back to edit" čuva prethodno unete vrednosti', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.enterPhysicalCountForRow(0, '7');
  await recon.enterReasonForRow(0, 'QA RECON-08 reason');
  await recon.fillNotes('QA RECON-08 notes');
  await recon.clickReview();
  await recon.expectReviewItemCount(1);

  await recon.clickBackToEdit();

  expect(await recon.getFirstPhysicalCountValue()).toBe('7');
  expect(await recon.getFirstReasonValue()).toBe('QA RECON-08 reason');
  expect(await recon.getNotesValue()).toBe('QA RECON-08 notes');
});

test('WEB-RECON-13: Promena vozača briše unete count-ove', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverALabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;
  const driverBLabel = `New User — ${process.env.QA_DRIVER_OTHER_REGION_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverALabel);
  await recon.enterPhysicalCountForRow(0, '9');
  expect(await recon.getFirstPhysicalCountValue()).toBe('9');

  await recon.selectDriverByLabel(driverBLabel);
  await recon.expectPhysicalCountLoaded();
  expect(await recon.getFirstPhysicalCountValue()).toBe('');
});
