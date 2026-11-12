import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-RECH-01: History lists confirmed reconciliations, newest first', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  const dateTexts = await page.locator('details summary div.mt-1.text-sm.text-steam-400').allInnerTexts();
  expect(dateTexts.length).toBeGreaterThan(1);

  const dates = dateTexts.map((text) => new Date(text).getTime());
  const sortedDescending = [...dates].sort((a, b) => b - a);
  expect(dates).toEqual(sortedDescending);
});

test('WEB-RECH-02: Filtering by driver and date range updates the URL and results', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  const driverSelect = page.locator('select[name="driverId"]');
  const driverId = await driverSelect.locator('option').nth(1).getAttribute('value');
  await driverSelect.selectOption({ index: 1 });
  await page.locator('input[name="from"]').fill('2026-01-01');
  await page.locator('input[name="to"]').fill('2026-12-31');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page).toHaveURL(new RegExp(`driverId=${driverId}.*from=2026-01-01.*to=2026-12-31`));

  // Clear returns to the unfiltered list/URL.
  await page.getByRole('link', { name: 'Clear' }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/reconciliation\/history$/);
});

test('WEB-RECH-04: Opening a card shows the full count detail', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  // The header navigation (Operations/Inventory/...) ALSO uses <details> for its dropdown
  // menu — we need to scope to the reconciliation list (<section>), otherwise
  // page.locator('details').first() hits the FIRST nav dropdown instead of the first card.
  const firstCard = page.locator('section').locator('details').first();
  await firstCard.locator('summary').click();

  // The earlier test only checked that a label existed somewhere on the card — that would
  // pass even if the value next to it were blank/undefined (e.g. if the server returned null
  // where a string was expected). The label and value are adjacent elements in the DOM (see
  // ReconciliationCard/Metric in reconciliation/history/page.tsx) — below, in addition to
  // the label's visibility, we also read the text of the NEXT sibling element and check it
  // isn't blank. "Confirmed by"/"Confirmed" can legitimately be "—" (unconfirmed) — that's
  // why we check "isn't a blank string", not a specific value.
  const summaryFieldValue = (label: string) =>
    firstCard.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');

  await expect(firstCard.getByText('Counted by', { exact: true })).toBeVisible();
  await expect(summaryFieldValue('Counted by')).not.toHaveText('');

  await expect(firstCard.getByText('Confirmed by', { exact: true })).toBeVisible();
  await expect(summaryFieldValue('Confirmed by')).not.toHaveText('');

  await expect(firstCard.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(summaryFieldValue('Confirmed')).not.toHaveText('');

  // Metric (Expected/Physical/Variance) and Reason are per-item (per product) — we check the
  // FIRST item, the same scoping as in the original test.
  const itemFieldValue = (label: string) =>
    firstCard.getByText(label, { exact: true }).first().locator('xpath=following-sibling::div[1]');

  await expect(firstCard.getByText('Expected', { exact: true }).first()).toBeVisible();
  await expect(itemFieldValue('Expected')).not.toHaveText('');

  await expect(firstCard.getByText('Physical', { exact: true }).first()).toBeVisible();
  await expect(itemFieldValue('Physical')).not.toHaveText('');

  await expect(firstCard.getByText('Variance', { exact: true }).first()).toBeVisible();
  await expect(itemFieldValue('Variance')).not.toHaveText('');

  await expect(firstCard.getByText('Reason', { exact: true }).first()).toBeVisible();
  await expect(itemFieldValue('Reason')).not.toHaveText('');
});

test('WEB-RECH-05: Discrepancy badge and summary totals reflect the variances', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  // The summary "Discrepancies" card is red when the total is > 0.
  const summaryCards = page.locator('.grid.gap-4.sm\\:grid-cols-3 > div');
  const discrepanciesCard = summaryCards.filter({ hasText: 'Discrepancies' });
  const discrepanciesValue = await discrepanciesCard.locator('div').last().innerText();
  const totalDiscrepancies = parseInt(discrepanciesValue.replace(/[^\d-]/g, ''), 10);

  if (totalDiscrepancies > 0) {
    await expect(discrepanciesCard.locator('div').last()).toHaveClass(/text-red-700/);
    // At least one badge on the page must show a red "N discrepancy/discrepancies".
    await expect(page.locator('span.bg-red-50', { hasText: /discrepanc/ }).first()).toBeVisible();
  } else {
    await expect(discrepanciesCard.locator('div').last()).not.toHaveClass(/text-red-700/);
  }

  // The earlier test only compared the summary number against ITS OWN style/CSS class — it
  // never independently recomputed the total from the individual per-card badges, so a wrong
  // SUMMARY number (while the individual card badges were correct) would have gone
  // unnoticed. Every card (even collapsed — the badge is in the <summary>, not the hidden
  // part) carries its OWN "N discrepancy/discrepancies" or "No discrepancies" badge; the sum
  // of those numbers must match the summary card.
  const perCardBadges = page.locator('section details summary span.rounded-full');
  const badgeTexts = await perCardBadges.allInnerTexts();
  expect(badgeTexts.length).toBeGreaterThan(0);

  const recomputedTotal = badgeTexts.reduce((sum, text) => {
    if (text.includes('No discrepancies')) return sum;
    const match = text.match(/\d+/);
    return sum + (match ? parseInt(match[0], 10) : 0);
  }, 0);
  expect(recomputedTotal).toBe(totalDiscrepancies);

  // At least one card with 0 variances must show a green "No discrepancies" badge.
  await expect(page.getByText('No discrepancies').first()).toBeVisible();
});

test('WEB-RECH-03: Empty state when filters match nothing', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  // A date range from the distant past (before this app even existed) — guaranteed zero
  // matches regardless of the current data.
  await page.locator('input[name="from"]').fill('2000-01-01');
  await page.locator('input[name="to"]').fill('2000-01-02');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByText('No reconciliations found')).toBeVisible();
  await expect(
    page.getByText('No confirmed reconciliations match the selected filters.'),
  ).toBeVisible();
});

test('WEB-RECH-06: History page enforces admin auth and the nav link works', async ({ page }) => {
  await page.goto('/dashboard/inventory/reconciliation/history');
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');
  await page.getByRole('link', { name: 'Back to Reconciliation' }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/reconciliation$/);
});
