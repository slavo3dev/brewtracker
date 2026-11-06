import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-HOME-02: "Users" card is shown to a user with canManageUsers', async ({ page }) => {
  // AŽURIRANO (app update): kartica "User management" je preimenovana u "Users" i sada živi
  // pod "Management" grupom (vidi navigation.config.ts) umesto u pljosnatoj listi kartica.
  // Pozitivan slučaj — negativan (admin BEZ canManageUsers) se ne može postaviti jer u
  // kodu canManageUsers() = canAccessAdminApp() za svakog aktivnog manager/CEO naloga
  // (nema uže uloge); isto ograničenje kao WEB-AUTH-14/USR-14.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
});

test('WEB-HOME-03: All dashboard navigation cards (grouped) link to the correct pages', async ({ page }) => {
  // AŽURIRANO (app update): dashboard home je prepravljen — kartice su sad grupisane u 4
  // sekcije (Operations/Inventory/Management/Reports) umesto jedne pljosnate liste. Dodate
  // su i potpuno nove kartice: "Service" i "Inventory Overview" (Operations/Inventory grupe)
  // i "Clients" (Management grupa, nova funkcionalnost). NAPOMENA: deo ovoga (Clients) još
  // NIJE deployed na produkciju u trenutku pisanja — verifikovati čim dev grana bude
  // deployed.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const groups: Array<{ group: string; cards: Array<[string, RegExp]> }> = [
    {
      group: 'Operations',
      cards: [
        ['Routes', /\/dashboard\/routes$/],
        ['Service', /\/dashboard\/service$/],
        ['Live Fleet Map', /\/dashboard\/fleet$/],
        ['Time Clock', /\/dashboard\/time-clock$/],
      ],
    },
    {
      group: 'Inventory',
      cards: [
        ['Inventory Overview', /\/dashboard\/inventory$/],
        ['Warehouses', /\/dashboard\/inventory\/warehouses$/],
        ['Machines', /\/dashboard\/inventory\/machines$/],
      ],
    },
    {
      group: 'Management',
      cards: [
        ['Clients', /\/dashboard\/clients$/],
        ['Users', /\/dashboard\/users$/],
      ],
    },
    {
      group: 'Reports',
      cards: [['Reports', /\/dashboard\/reports$/]],
    },
  ];

  for (const { group, cards } of groups) {
    await page.goto('/dashboard');
    // level: 2 — grupe su <h2>, kartice su <h3> (neke grupe sa jednom karticom dele isti
    // tekst, npr. "Reports" grupa + "Reports" kartica).
    await expect(page.getByRole('heading', { name: group, exact: true, level: 2 })).toBeVisible();

    for (const [title, expectedUrl] of cards) {
      await page.goto('/dashboard');
      await page.getByRole('heading', { name: title, exact: true, level: 3 }).click();
      await expect(page).toHaveURL(expectedUrl);
    }
  }
});

test('WEB-HOME-04: "Warehouses" card links to the correct page', async ({ page }) => {
  // AŽURIRANO (app update): raniji latentni bug (relativni href bez vodeće kose crte, koji
  // je slučajno ispravno radio samo kad se klikne sa tačno /dashboard) više NE postoji —
  // navigation.config.ts sada koristi apsolutan "/dashboard/inventory/warehouses" href za
  // SVE kartice, uključujući Warehouses. Ovo je sad običan, robustan test bez te zamke.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Warehouses', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/warehouses$/);
});
