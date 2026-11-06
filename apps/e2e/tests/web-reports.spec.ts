import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-RPT-01: Reports page shows placeholder text only', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(
    page.getByText(
      'Reports placeholder. Later this page will show operational KPIs, route completion, service quality, and inventory loss.',
    ),
  ).toBeVisible();
});

test('WEB-RPT-02: Reports page enforces admin auth', async ({ page }) => {
  await page.goto('/dashboard/reports');
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);
  await page.goto('/dashboard/reports');
  await expect(page).toHaveURL(/\/login/);
});
