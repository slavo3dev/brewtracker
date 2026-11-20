import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { createTestClient, deleteTestClient } from '../helpers/clientSeed';
import { createTestProduct, deleteProductByName } from '../helpers/productSeed';

// NEW FUNCTIONALITY (app update, dev branch) — /dashboard/clients. The server requires that
// a manager create/edit clients ONLY in their assigned region (see client-actions.ts
// "You can only create/edit clients in your assigned region") — every fixture the manager
// needs to see/edit must have region='Italy' (the same as QA_MANAGER).

test('WEB-CLI-01: /dashboard/clients requires inventory manager access (manager/CEO)', async ({ page }) => {
  await page.goto('/dashboard/clients');
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);
  await page.goto('/dashboard/clients');
  // Previously: /\/login|\/dashboard$/ — that OR regex variant would still have PASSED if a
  // regression let the driver reach /dashboard instead of being rejected to /login
  // (requireInventoryManager() first calls requireAdmin(), which ALWAYS sends a driver back
  // to /login, same as WEB-AUTH-05) — here we require ONLY /login, so the test actually
  // fails if that protection is ever weakened.
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-CLI-02: Creating a client with required fields succeeds and goes to the detail page', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/clients/new');
  const name = `QA CLI-02 Test Client ${Date.now()}`;
  await page.locator('input[name="name"]').fill(name);
  await page.locator('select[name="business_type"]').selectOption('ocs');
  // A manager may only create a client in their OWN assigned region (server-side check).
  await page.locator('input[name="region"]').fill('Italy');
  await page.getByRole('button', { name: 'Create Client' }).click();

  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  // This test creates the client through the real UI flow (not createTestClient()), so the
  // ID has to be read back from the URL to clean it up — without this, the shared QA database
  // grows by one permanent client every time this test runs.
  const clientId = page.url().split('/').pop()!;
  await deleteTestClient(clientId);
});

test('WEB-CLI-03: Creating a client is blocked without a name', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/clients/new');
  await page.getByRole('button', { name: 'Create Client' }).click();

  // "name" has an HTML required attribute — the browser blocks submission before it reaches
  // the server.
  const nameInput = page.locator('input[name="name"]');
  await expect.poll(() => nameInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await expect(page).toHaveURL(/\/dashboard\/clients\/new$/);
});

test('WEB-CLI-04: Search and business-type filter narrow the client list', async ({ page }) => {
  const stamp = Date.now();
  const clientId = await createTestClient({
    name: `QA CLI-04 Unique Client ${stamp}`,
    businessType: 'horeca',
    region: 'Italy',
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    await page.goto('/dashboard/clients');
    await page.getByLabel('Search clients').fill(`QA CLI-04 Unique Client ${stamp}`);
    await expect(page.getByRole('heading', { name: `QA CLI-04 Unique Client ${stamp}` })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(1);

    await page.getByLabel('Search clients').fill('');
    await page.getByLabel('Filter by business type').selectOption('ocs');
    await expect(page.getByText(`QA CLI-04 Unique Client ${stamp}`)).toHaveCount(0);
  } finally {
    await deleteTestClient(clientId);
  }
});

test('WEB-CLI-05: Manager sees only clients in their own region, CEO sees all', async ({ page }) => {
  const stamp = Date.now();
  const otherRegionClientId = await createTestClient({
    name: `QA CLI-05 Other Region ${stamp}`,
    region: 'Florida',
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    // QA_MANAGER is in the Italy region — a client from the Florida region must not be
    // visible.
    await page.goto('/dashboard/clients');
    await expect(page.getByText(`QA CLI-05 Other Region ${stamp}`)).toHaveCount(0);

    // Sign out before switching to the CEO account — middleware redirects a LOGGED-IN user
    // from /login back to /dashboard, so login.goto() without first signing out would miss
    // the form.
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);

    await login.goto();
    await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);

    // The CEO sees clients from ALL regions.
    await page.goto('/dashboard/clients');
    await expect(page.getByText(`QA CLI-05 Other Region ${stamp}`)).toBeVisible();
  } finally {
    await deleteTestClient(otherRegionClientId);
  }
});

test('WEB-CLI-06: Manager cannot open a client detail page from another region directly via URL', async ({ page }) => {
  const otherRegionClientId = await createTestClient({
    name: `QA CLI-06 Other Region ${Date.now()}`,
    region: 'Florida',
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    // A server-side notFound() check, not just UI hiding — direct URL access must also be
    // blocked.
    const response = await page.goto(`/dashboard/clients/${otherRegionClientId}`);
    expect(response?.status()).toBe(404);
  } finally {
    await deleteTestClient(otherRegionClientId);
  }
});

test('WEB-CLI-07: Editing a client persists', async ({ page }) => {
  const clientId = await createTestClient({ name: `QA CLI-07 Original ${Date.now()}`, region: 'Italy' });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    await page.goto(`/dashboard/clients/${clientId}/edit`);
    const updatedName = `QA CLI-07 Updated ${Date.now()}`;
    await page.locator('input[name="name"]').fill(updatedName);
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // The default 5s timeout occasionally runs out under load while the button still reads
    // "Saving changes..." (the server action + redirect hasn't arrived yet) — the same
    // pattern as elsewhere in the suite.
    await expect(page).toHaveURL(`/dashboard/clients/${clientId}`, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: updatedName, exact: true })).toBeVisible();
  } finally {
    await deleteTestClient(clientId);
  }
});

test('WEB-CLI-08: Empty state when no clients match the filters', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/clients');
  await page.getByLabel('Search clients').fill(`qa-cli-08-nonexistent-${Date.now()}`);
  await expect(page.getByText('No clients match your filters.')).toBeVisible();
});

// Client product assignments ("Assigned Inventory Products" on /dashboard/clients/[clientId])
// — new functionality (app update, dev branch), previously untested. A product is only
// eligible for a client if a matching row exists in inventory_product_business_types for the
// CLIENT'S business_type (see getEligibleClientProducts()), so every fixture product here is
// created with an explicit businessTypes array.

test('WEB-CLI-09: Assigning an eligible product with a valid par level succeeds', async ({ page }) => {
  const stamp = Date.now();
  const clientId = await createTestClient({ name: `QA CLI-09 Client ${stamp}`, businessType: 'ocs', region: 'Italy' });
  const productName = `QA CLI-09 Product ${stamp}`;

  try {
    await createTestProduct({ name: productName, businessTypes: ['ocs'] });

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    await page.goto(`/dashboard/clients/${clientId}`);
    await expect(page.getByText('No inventory products assigned to this client yet.')).toBeVisible();

    await page.getByLabel('Product', { exact: true }).selectOption({ label: productName });
    await page.getByLabel('Par Level (base units)').fill('10');
    await page.getByRole('button', { name: 'Assign Product' }).click();

    await expect(page.getByRole('heading', { name: productName, exact: true })).toBeVisible();
    await expect(page.getByText('1 configured products')).toBeVisible();
  } finally {
    await deleteTestClient(clientId);
    await deleteProductByName(productName);
  }
});

test('WEB-CLI-10: Assigning a product with a negative par level is rejected', async ({ page }) => {
  const stamp = Date.now();
  const clientId = await createTestClient({ name: `QA CLI-10 Client ${stamp}`, businessType: 'ocs', region: 'Italy' });
  const productName = `QA CLI-10 Product ${stamp}`;

  try {
    await createTestProduct({ name: productName, businessTypes: ['ocs'] });

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    await page.goto(`/dashboard/clients/${clientId}`);
    await page.getByLabel('Product', { exact: true }).selectOption({ label: productName });
    const parLevelInput = page.getByLabel('Par Level (base units)');
    await parLevelInput.fill('-5');

    // The input has min="0" — native HTML validation blocks the submit before the form's own
    // "Enter a non-negative par level." check ever runs (same pattern as the warehouse
    // geofence radius field).
    await page.getByRole('button', { name: 'Assign Product' }).click();
    await expect.poll(() => parLevelInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    await expect(page.getByText('No inventory products assigned to this client yet.')).toBeVisible();
  } finally {
    await deleteTestClient(clientId);
    await deleteProductByName(productName);
  }
});

test('WEB-CLI-11: Only products eligible for the client\'s business type are offered', async ({ page }) => {
  const stamp = Date.now();
  const clientId = await createTestClient({ name: `QA CLI-11 Client ${stamp}`, businessType: 'ocs', region: 'Italy' });
  const eligibleName = `QA CLI-11 Eligible ${stamp}`;
  const ineligibleName = `QA CLI-11 Ineligible ${stamp}`;

  try {
    await createTestProduct({ name: eligibleName, businessTypes: ['ocs'] });
    await createTestProduct({ name: ineligibleName, businessTypes: ['horeca'] });

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    await page.goto(`/dashboard/clients/${clientId}`);
    const productSelect = page.getByLabel('Product', { exact: true });
    await expect(productSelect.locator('option', { hasText: eligibleName })).toHaveCount(1);
    await expect(productSelect.locator('option', { hasText: ineligibleName })).toHaveCount(0);
  } finally {
    await deleteTestClient(clientId);
    await deleteProductByName(eligibleName);
    await deleteProductByName(ineligibleName);
  }
});

test('WEB-CLI-12: Editing an assignment persists the new par level and active flag', async ({ page }) => {
  const stamp = Date.now();
  const clientId = await createTestClient({ name: `QA CLI-12 Client ${stamp}`, businessType: 'ocs', region: 'Italy' });
  const productName = `QA CLI-12 Product ${stamp}`;

  try {
    await createTestProduct({ name: productName, businessTypes: ['ocs'] });

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    await page.goto(`/dashboard/clients/${clientId}`);
    await page.getByLabel('Product', { exact: true }).selectOption({ label: productName });
    await page.getByLabel('Par Level (base units)').fill('10');
    await page.getByRole('button', { name: 'Assign Product' }).click();
    await expect(page.getByRole('heading', { name: productName, exact: true })).toBeVisible();

    const card = page.locator('article').filter({ hasText: productName });
    await card.getByRole('button', { name: 'Edit' }).click();
    await card.getByLabel('Par Level (base units)').fill('25');
    await card.getByLabel('Active assignment').uncheck();
    await card.getByRole('button', { name: 'Save Changes' }).click();

    // Deactivating hides "Edit" behind the now-inactive card state — reload and re-expand to
    // confirm the change was actually persisted server-side, not just reflected locally.
    await page.goto(`/dashboard/clients/${clientId}`);
    const reloadedCard = page.locator('article').filter({ hasText: productName });
    await expect(reloadedCard.getByText('Inactive', { exact: true })).toBeVisible();
    await reloadedCard.getByRole('button', { name: 'Edit' }).click();
    await expect(reloadedCard.getByLabel('Par Level (base units)')).toHaveValue('25');
  } finally {
    await deleteTestClient(clientId);
    await deleteProductByName(productName);
  }
});
