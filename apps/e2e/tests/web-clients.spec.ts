import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { createTestClient, deleteTestClient } from '../helpers/clientSeed';

// NOVA FUNKCIONALNOST (app update, dev grana) — /dashboard/clients. Server zahteva da
// manager kreira/menja klijente ISKLJUČIVO u svom dodeljenom regionu (vidi client-actions.ts
// "You can only create/edit clients in your assigned region") — svi fixture-i koje manager
// treba da vidi/menja moraju imati region='Italy' (isti kao QA_MANAGER).

test('WEB-CLI-01: /dashboard/clients requires inventory manager access (manager/CEO)', async ({ page }) => {
  await page.goto('/dashboard/clients');
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);
  await page.goto('/dashboard/clients');
  await expect(page).toHaveURL(/\/login|\/dashboard$/);
});

test('WEB-CLI-02: Creating a client with required fields succeeds and goes to the detail page', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/clients/new');
  const name = `QA CLI-02 Test Client ${Date.now()}`;
  await page.locator('input[name="name"]').fill(name);
  await page.locator('select[name="business_type"]').selectOption('ocs');
  // Manager sme da kreira klijenta SAMO u svom dodeljenom regionu (server-side provera).
  await page.locator('input[name="region"]').fill('Italy');
  await page.getByRole('button', { name: 'Create Client' }).click();

  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
});

test('WEB-CLI-03: Creating a client is blocked without a name', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/clients/new');
  await page.getByRole('button', { name: 'Create Client' }).click();

  // "name" ima HTML required atribut — browser blokira submit pre nego što stigne do servera.
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

    // QA_MANAGER je u regionu Italy — klijent iz Florida regiona ne sme da se vidi.
    await page.goto('/dashboard/clients');
    await expect(page.getByText(`QA CLI-05 Other Region ${stamp}`)).toHaveCount(0);

    await login.goto();
    await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);

    // CEO vidi klijente iz SVIH regiona.
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

    // Server-side notFound() provera, ne samo UI sakrivanje — direktan URL pristup mora
    // takođe biti blokiran.
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

    await expect(page).toHaveURL(`/dashboard/clients/${clientId}`);
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
