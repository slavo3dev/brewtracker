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

  // Clear vraća na nefiltriranu listu/URL.
  await page.getByRole('link', { name: 'Clear' }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/reconciliation\/history$/);
});

test('WEB-RECH-04: Opening a card shows the full count detail', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/reconciliation/history');

  // Header navigacija (Operations/Inventory/...) TAKOĐE koristi <details> za dropdown meni —
  // moramo skopirati na listu rekonsilijacija (<section>), inače page.locator('details').first()
  // pogađa PRVI nav dropdown umesto prve kartice.
  const firstCard = page.locator('section').locator('details').first();
  await firstCard.locator('summary').click();

  // Raniji test je proveravao SAMO da labela postoji negde na kartici — to bi prošlo i da je
  // vrednost pored nje prazna/nedefinisana (npr. da server vrati null gde treba string).
  // Labela i vrednost su susedni elementi u DOM-u (vidi ReconciliationCard/Metric u
  // reconciliation/history/page.tsx) — ispod se, pored vidljivosti labele, čita i tekst
  // SLEDEĆEG sibling elementa i provera da nije prazan. "Confirmed by"/"Confirmed" legitimno
  // mogu biti "—" (nepotvrđeno) — zato se provera "nije prazan string", ne konkretna vrednost.
  const summaryFieldValue = (label: string) =>
    firstCard.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');

  await expect(firstCard.getByText('Counted by', { exact: true })).toBeVisible();
  await expect(summaryFieldValue('Counted by')).not.toHaveText('');

  await expect(firstCard.getByText('Confirmed by', { exact: true })).toBeVisible();
  await expect(summaryFieldValue('Confirmed by')).not.toHaveText('');

  await expect(firstCard.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(summaryFieldValue('Confirmed')).not.toHaveText('');

  // Metric (Expected/Physical/Variance) i Reason su po stavci (proizvodu) — proveravamo PRVU
  // stavku, isto skopovanje kao u originalnom testu.
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

  // Raniji test je samo poredio summary broj sa SOPSTVENIM stilom/CSS klasom — nikad nije
  // nezavisno preračunao ukupan broj iz pojedinačnih bedževa po kartici, pa bi pogrešan
  // SUMMARY broj (dok su pojedinačni bedževi na karticama ispravni) prošao neopaženo. Svaka
  // kartica (čak i nerazvijena — bedž je u <summary>, ne u skrivenom delu) nosi SVOJ
  // "N discrepancy/discrepancies" ili "No discrepancies" bedž; zbir tih brojeva mora da se
  // poklopi sa summary karticom.
  const perCardBadges = page.locator('section details summary span.rounded-full');
  const badgeTexts = await perCardBadges.allInnerTexts();
  expect(badgeTexts.length).toBeGreaterThan(0);

  const recomputedTotal = badgeTexts.reduce((sum, text) => {
    if (text.includes('No discrepancies')) return sum;
    const match = text.match(/\d+/);
    return sum + (match ? parseInt(match[0], 10) : 0);
  }, 0);
  expect(recomputedTotal).toBe(totalDiscrepancies);

  // Bar jedna kartica sa 0 varijansi mora da pokaže zeleni "No discrepancies" bedž.
  await expect(page.getByText('No discrepancies').first()).toBeVisible();
});

test('WEB-RECH-03: Empty state when filters match nothing', async ({ page }) => {
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
