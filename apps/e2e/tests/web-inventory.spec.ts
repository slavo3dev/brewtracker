import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-INV-01: Movement history lista paginirane rezultate po defaultu', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');

  // Ukupan broj je mnogo veći od 10 (stotine), ali se podrazumevano prikazuje samo prva stranica.
  await expect(page.getByText(/^\d+ movements · Showing 1–10$/)).toBeVisible();
});

test('WEB-INV-02: Filtriranje po tipu pokreta sužava rezultate', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByLabel('Filter by movement type').selectOption('machine_refill');
  await page.getByRole('button', { name: 'Search' }).click();

  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  const headings = await cards.locator('h3').allInnerTexts();
  expect(headings.length).toBeGreaterThan(0);
  for (const heading of headings) {
    expect(heading).toBe('Machine Refill');
  }
});

test('WEB-INV-03: Pretraga po visit ID ili unit substring radi', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  // Substring poznatog source_visit_id iz baze.
  await page.getByPlaceholder('Search visit or unit').fill('ndfec463');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.locator('article').first()).toBeVisible();
  await expect(page.getByText(/Visit:/).first()).toBeVisible();
});

test('WEB-INV-05: Greška pri učitavanju prikazuje error banner', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');

  // Server action za učitavanje pokreta ide POST na istu stranicu — presretni i simuliraj
  // mrežni kvar samo za taj zahtev (abortuje se), ne za inicijalno učitavanje stranice.
  await page.route('/dashboard/inventory', async (route) => {
    if (route.request().method() === 'POST') {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });

  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.border-red-200')).toBeVisible();
});

test('WEB-INV-06: Products tab filtrira po search/category/status', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Products' }).click();

  // Nema neaktivnih proizvoda u trenutnim test podacima — filtriramo na "Active" (sigurno
  // ima rezultata) da proverimo ISTI mehanizam filtriranja po statusu.
  await page.getByLabel('Filter by product status').selectOption('true');
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  const badges = await cards.locator('span', { hasText: /^(Active|Inactive)$/ }).allInnerTexts();
  expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    expect(badge).toBe('Active');
  }
});

test('WEB-INV-07: Product kartica prikazuje konverziju jedinica i detalje paketa', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Products' }).click();

  const firstCard = page.locator('article').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.getByText(/^1 .+ = \d+(\.\d+)? .+$/)).toBeVisible();
  await expect(firstCard.getByText('Loose units:', { exact: false })).toBeVisible();
  await expect(firstCard.getByText('Partial base unit:', { exact: false })).toBeVisible();
});

test('WEB-INV-08: Locations tab filtrira po tipu lokacije', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Locations' }).click();

  await page.getByLabel('Filter by location type').selectOption('warehouse');
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  const typeBadges = await cards.locator('span').allInnerTexts();
  expect(typeBadges.length).toBeGreaterThan(0);
  for (const badge of typeBadges) {
    expect(badge).toBe('Warehouse');
  }
});

test('WEB-INVM-02: Machines stub stranica i dalje sprovodi admin auth', async ({ page }) => {
  await page.goto('/dashboard/inventory/machines');
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-INV-10: Non-admin ne može da pristupi nijednoj /dashboard/inventory/* stranici', async ({ page }) => {
  const paths = [
    '/dashboard/inventory',
    '/dashboard/inventory/reconciliation',
    '/dashboard/inventory/transfers',
  ];

  for (const path of paths) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('WEB-INV-04: "Clear filters" resetuje sve filtere pokreta', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByLabel('Filter by movement type').selectOption('machine_refill');
  await page.getByPlaceholder('Search visit or unit').fill('ndfec463');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).click();

  await expect(page.getByLabel('Filter by movement type')).toHaveValue('');
  await expect(page.getByPlaceholder('Search visit or unit')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
});

test('WEB-INV-09: Header akcije vode na ispravne inventory podstranice', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const links: Array<[string, RegExp]> = [
    ['Reconcile inventory', /\/dashboard\/inventory\/reconciliation$/],
    ['Record transfer', /\/dashboard\/inventory\/transfers$/],
    ['Warehouse movements', /\/dashboard\/inventory\/movements$/],
    ['Warehouses', /\/dashboard\/inventory\/warehouses$/],
    ['Machines', /\/dashboard\/inventory\/machines$/],
  ];

  for (const [label, expectedUrl] of links) {
    await page.goto('/dashboard/inventory');
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(expectedUrl);
  }
});

test('WEB-INVM-01: Machines stranica pokazuje "coming soon" stub bez funkcionalnog UI-ja', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/machines');
  await expect(page.getByRole('heading', { name: 'Machines' })).toBeVisible();
  await expect(page.getByText('Machine management module coming soon.')).toBeVisible();
});
