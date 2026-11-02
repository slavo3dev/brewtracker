import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-MVMT-01: Filteri (magacin/vozač/datum) ažuriraju URL i rezultate', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/movements');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  const warehouseSelect = page.getByLabel('Warehouse');
  const selectedValue = await warehouseSelect.locator('option').nth(1).getAttribute('value');
  await warehouseSelect.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page).toHaveURL(new RegExp(`warehouse=${selectedValue}`));
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // Clear filters vraća na nefiltriranu URL (bez querystring-a).
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/movements$/);
});
