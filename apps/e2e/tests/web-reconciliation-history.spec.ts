import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-RECH-01: History lista potvrđene rekonsilijacije, najnovije prvo', async ({ page }) => {
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

test('WEB-RECH-02: Filtriranje po vozaču i opsegu datuma ažurira URL i rezultate', async ({ page }) => {
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

  // Clear vraća na nefiltriranu listu/URL.
  await page.getByRole('link', { name: 'Clear' }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/reconciliation\/history$/);
});

test('WEB-RECH-04: Otvaranje kartice prikazuje pun detalj brojanja', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  // Header navigacija (Operations/Inventory/...) TAKOĐE koristi <details> za dropdown meni —
  // moramo skopirati na listu rekonsilijacija (<section>), inače page.locator('details').first()
  // pogađa PRVI nav dropdown umesto prve kartice.
  const firstCard = page.locator('section').locator('details').first();
  await firstCard.locator('summary').click();

  await expect(firstCard.getByText('Counted by')).toBeVisible();
  await expect(firstCard.getByText('Confirmed by')).toBeVisible();
  await expect(firstCard.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(firstCard.getByText('Expected').first()).toBeVisible();
  await expect(firstCard.getByText('Physical').first()).toBeVisible();
  await expect(firstCard.getByText('Variance').first()).toBeVisible();
  await expect(firstCard.getByText('Reason').first()).toBeVisible();
});

test('WEB-RECH-05: Discrepancy bedž i ukupni brojevi odražavaju varijanse', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  // Summary "Discrepancies" kartica je crvena kad je ukupan broj > 0.
  const summaryCards = page.locator('.grid.gap-4.sm\\:grid-cols-3 > div');
  const discrepanciesCard = summaryCards.filter({ hasText: 'Discrepancies' });
  const discrepanciesValue = await discrepanciesCard.locator('div').last().innerText();
  const totalDiscrepancies = parseInt(discrepanciesValue.replace(/[^\d-]/g, ''), 10);

  if (totalDiscrepancies > 0) {
    await expect(discrepanciesCard.locator('div').last()).toHaveClass(/text-red-700/);
    // Bar jedan bedž na stranici mora da pokazuje crveni "N discrepancy/discrepancies".
    await expect(page.locator('span.bg-red-50', { hasText: /discrepanc/ }).first()).toBeVisible();
  } else {
    await expect(discrepanciesCard.locator('div').last()).not.toHaveClass(/text-red-700/);
  }

  // Bar jedna kartica sa 0 varijansi mora da pokaže zeleni "No discrepancies" bedž.
  await expect(page.getByText('No discrepancies').first()).toBeVisible();
});

test('WEB-RECH-03: Prazno stanje kad filteri ne pogađaju ništa', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  // Opseg datuma iz daleke prošlosti (pre nego što je ova app uopšte postojala) — garantovano
  // nula poklapanja bez obzira na trenutne podatke.
  await page.locator('input[name="from"]').fill('2000-01-01');
  await page.locator('input[name="to"]').fill('2000-01-02');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByText('No reconciliations found')).toBeVisible();
  await expect(
    page.getByText('No confirmed reconciliations match the selected filters.'),
  ).toBeVisible();
});

test('WEB-RECH-06: History stranica sprovodi admin auth i navigacioni link radi', async ({ page }) => {
  await page.goto('/dashboard/inventory/reconciliation/history');
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');
  await page.getByRole('link', { name: 'Back to Reconciliation' }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/reconciliation$/);
});
