import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-HOME-02: "User management" kartica je prikazana korisniku sa canManageUsers', async ({ page }) => {
  // Pozitivan slučaj — negativan (admin BEZ canManageUsers) se ne može postaviti jer u
  // kodu canManageUsers() = canAccessAdminApp() za svakog aktivnog manager/CEO naloga
  // (nema uže uloge); isto ograničenje kao WEB-AUTH-14/USR-14.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();
});

test('WEB-HOME-03: Sve dashboard navigacione kartice vode na ispravne stranice', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const cards: Array<[string, RegExp]> = [
    ['Routes', /\/dashboard\/routes$/],
    ['Machines', /\/dashboard\/inventory\/machines$/],
    ['Time Clock', /\/dashboard\/time-clock$/],
    ['Reports', /\/dashboard\/reports$/],
    ['Live Fleet Map', /\/dashboard\/fleet$/],
  ];

  for (const [title, expectedUrl] of cards) {
    await page.goto('/dashboard');
    await page.getByRole('heading', { name: title, exact: true }).click();
    await expect(page).toHaveURL(expectedUrl);
  }
});

test('WEB-HOME-04: "Warehouses" kartica (relativni href) se ispravno razrešava', async ({ page }) => {
  // Poznat latentni bug u kodu: href="dashboard/inventory/warehouses" (BEZ vodeće kose
  // crte), za razliku od svih ostalih kartica koje imaju apsolutni "/dashboard/...".
  // Kliknuto sa TAČNO /dashboard (bez trailing slash-a), relativna rezolucija slučajno
  // ispadne ispravna (poslednji segment "dashboard" se zamenjuje, ne dodaje).
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Warehouses', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/warehouses$/);
});
