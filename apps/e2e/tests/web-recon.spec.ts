import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { ReconciliationPage } from '../pages/ReconciliationPage';
import { TransfersPage } from '../pages/TransfersPage';
import { supabaseAdmin } from '../helpers/supabaseAdmin';

// Reconciliation tests share the same drivers/baselines in the database — the server
// doesn't handle a concurrent confirmation of the same reconciliation well (it crashes
// instead of a clean error), so these tests run one after another, not in parallel.
test.describe.configure({ mode: 'serial' });

test('WEB-RECON-01: Reconciliation page loads with a driver selector', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.expectDriverSelectorVisible();
});

test('WEB-RECON-02: Selecting a driver loads their expected van inventory', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.selectDriverByLabel(`QA Driver Fixture — ${process.env.QA_DRIVER_EMAIL}`);
  await recon.expectPhysicalCountLoaded();
});

test('WEB-RECON-09: Confirming a reconciliation saves it as the new baseline', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.selectDriverByLabel(`QA Driver Fixture — ${process.env.QA_DRIVER_EMAIL}`);
  await recon.enterFirstPhysicalCount('5');
  await recon.clickReview();
  await recon.clickConfirm();
  await recon.expectConfirmed();

  // Fresh check: reload the page, select the same driver, and confirm EXPECTED was updated.
  await recon.goto();
  await recon.selectDriverByLabel(`QA Driver Fixture — ${process.env.QA_DRIVER_EMAIL}`);
  // The unit (case/box/bag...) depends on which product currently sorts first in the shared
  // catalog — what matters is that the NUMBER 5 persists as the new baseline, not the
  // specific unit.
  await recon.expectExpectedValueForFirstProduct(/^5 \S+$/);
});

test('WEB-RECON-04: Variance is computed live as physical minus expected', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);

  // Use a DIFFERENT driver than WEB-RECON-09 (not driveraleksa) to avoid a concurrent
  // confirmation of the same reconciliation when tests run in parallel (the server doesn't
  // handle that well).
  const driverLabel = `QA Driver Other Region Fixture — ${process.env.QA_DRIVER_OTHER_REGION_EMAIL}`;

  // Make sure the first product has a baseline (a precondition for this test).
  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.enterFirstPhysicalCount('5');
  await recon.clickReview();
  await recon.clickConfirm();
  await recon.expectConfirmed();

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  const expected = await recon.getFirstProductExpectedQuantity();

  // Enter a physical count that's 2 greater than expected and check that the variance
  // displays immediately (without submitting the form) as physical - expected.
  await recon.enterFirstPhysicalCount(String(expected + 2));
  await recon.expectVarianceForFirstProduct(/^\+2 \S+$/);
});

test('WEB-RECON-05: Review is blocked with no counts entered', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  await recon.goto();
  await recon.selectDriverByLabel(`QA Driver Fixture — ${process.env.QA_DRIVER_EMAIL}`);
  await recon.expectReviewBlockedWithNoCounts();
});

test('WEB-RECON-10: Expected quantity becomes the confirmed count after confirmation', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  // A third, separate driver (not used in RECON-09/04) to avoid a concurrent confirmation.
  const driverLabel = `QA Driver Refresh Fixture — ${process.env.QA_DRIVER_REFRESH_TEST_EMAIL}`;
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

test('WEB-RECON-11: Later movements change the expected quantity', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = `QA Driver Fixture — ${process.env.QA_DRIVER_EMAIL}`;

  // 1) Establish a known baseline.
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

  // 2) A new delivery to the driver AFTER the confirmed baseline (without a new reconciliation).
  const transfers = new TransfersPage(page);
  await transfers.goto();
  await transfers.selectWarehouse('Milano Warehouse — Italy');
  await transfers.selectDriver(process.env.QA_DRIVER_ID!);
  await transfers.selectProductForRow(0, 1);
  await transfers.fillQuantityInput(0, '3');
  await transfers.submit();
  await transfers.expectProductsIssuedSuccessfully(1);

  // "Expected" is in BASE units (e.g. sleeve), while the transfer is entered in issue
  // units (e.g. box) — we need to multiply by that product's units_per_issue_unit
  // (the first product, in the same sort_order/name order as on the reconciliation/transfer
  // pages).
  const supabase = supabaseAdmin();
  const { data: firstProduct } = await supabase
    .from('inventory_products')
    .select('units_per_issue_unit')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')
    .limit(1)
    .single();
  const unitsPerIssueUnit = firstProduct!.units_per_issue_unit as number;

  // 3) Expected on the reconciliation page should reflect the baseline + the new movement,
  // without a new confirmation.
  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  const expectedAfterTransfer = await recon.getFirstProductExpectedQuantity();
  expect(expectedAfterTransfer).toBe(baseline + 3 * unitsPerIssueUnit);
});

test('WEB-RECON-03: A product with no baseline shows "No baseline"', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  // A dedicated driver for whom we NEVER confirm a reconciliation — remains permanently
  // without a baseline.
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  await recon.expectNoBaselineForFirstProduct();

  await recon.enterPhysicalCountForRow(0, '3');
  await recon.expectVarianceForFirstProduct('—');
  await recon.expectNoBaselineNoteVisible();
});

test('WEB-RECON-06: Only counted products are included in the review', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);
  // Enter a count for EXACTLY 2 products, leave the rest blank.
  await recon.enterPhysicalCountForRow(0, '4');
  await recon.enterPhysicalCountForRow(1, '2');
  await recon.clickReview();

  await recon.expectReviewItemCount(2);
});

test('WEB-RECON-07: Invalid physical quantity is rejected', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverLabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverLabel);

  const { blockedNatively } = await recon.attemptNegativePhysicalCount('-5');
  if (blockedNatively) {
    // The browser (min="0") blocked submission before it ever reached JS validation.
    expect(blockedNatively).toBe(true);
  } else {
    // The form's JS validation caught the negative value.
    await expect(page.getByText('enter a valid physical quantity.', { exact: false })).toBeVisible();
  }
  // The review screen doesn't appear in either case — "Back to edit" exists ONLY on the
  // review screen (the form's submit button also has the text "Review reconciliation", so
  // that text alone isn't a reliable indicator of whether we moved to the review step).
  await expect(page.getByRole('button', { name: 'Back to edit' })).toHaveCount(0);
});

test('WEB-RECON-12: Reason and notes are saved with the reconciliation', async ({ page }) => {
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

  // History: the reason and notes are also visible there.
  await page.goto('/dashboard/inventory/reconciliation/history');
  const card = page.locator('details').filter({ hasText: 'QA USR-01 Test User' }).first();
  await card.locator('summary').click();
  await expect(card.getByText(notesText)).toBeVisible();
  await expect(card.getByText(reasonText)).toBeVisible();
});

test('WEB-RECON-14: Reconciliation pages enforce admin auth', async ({ page }) => {
  await page.goto('/dashboard/inventory/reconciliation');
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/dashboard/inventory/reconciliation/history');
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-RECON-08: "Back to edit" preserves previously entered values', async ({ page }) => {
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

test('WEB-RECON-13: Changing driver clears entered counts', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const recon = new ReconciliationPage(page);
  const driverALabel = `QA USR-01 Test User — ${process.env.QA_DRIVER_RECON_NOBASELINE_EMAIL}`;
  const driverBLabel = `QA Driver Other Region Fixture — ${process.env.QA_DRIVER_OTHER_REGION_EMAIL}`;

  await recon.goto();
  await recon.selectDriverByLabel(driverALabel);
  await recon.enterPhysicalCountForRow(0, '9');
  expect(await recon.getFirstPhysicalCountValue()).toBe('9');

  await recon.selectDriverByLabel(driverBLabel);
  await recon.expectPhysicalCountLoaded();
  expect(await recon.getFirstPhysicalCountValue()).toBe('');
});
