import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-HOME-02: "Users" card is shown to a user with canManageUsers', async ({ page }) => {
  // UPDATED (app update): the "User management" card was renamed to "Users" and now lives
  // under the "Management" group (see navigation.config.ts) instead of a flat list of cards.
  // Positive case only — the negative case (an admin WITHOUT canManageUsers) can't be set up
  // because in the code canManageUsers() = canAccessAdminApp() for every active manager/CEO
  // account (there's no narrower role); the same limitation as WEB-AUTH-14/USR-14.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
});

test('WEB-HOME-03: All dashboard navigation cards (grouped) link to the correct pages', async ({ page }) => {
  // UPDATED (app update): the dashboard home was reworked — cards are now grouped into 4
  // sections (Operations/Inventory/Management/Reports) instead of one flat list. Entirely
  // new cards were also added: "Service" and "Inventory Overview" (Operations/Inventory
  // groups) and "Clients" (Management group, new functionality). NOTE: part of this
  // (Clients) was NOT YET deployed to production at the time of writing — verify once the
  // dev branch is deployed.
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
    // level: 2 — groups are <h2>, cards are <h3> (some single-card groups share the same
    // text, e.g. the "Reports" group + "Reports" card).
    await expect(page.getByRole('heading', { name: group, exact: true, level: 2 })).toBeVisible();

    for (const [title, expectedUrl] of cards) {
      await page.goto('/dashboard');
      await page.getByRole('heading', { name: title, exact: true, level: 3 }).click();
      await expect(page).toHaveURL(expectedUrl);
    }
  }
});

test('WEB-HOME-04: "Warehouses" card links to the correct page', async ({ page }) => {
  // UPDATED (app update): the earlier latent bug (a relative href without a leading slash,
  // which happened to work correctly only when clicked from exactly /dashboard) no longer
  // exists — navigation.config.ts now uses an absolute "/dashboard/inventory/warehouses"
  // href for ALL cards, including Warehouses. This is now a plain, robust test without that
  // trap.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Warehouses', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/warehouses$/);
});
