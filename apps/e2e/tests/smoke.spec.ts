import { test, expect } from '../fixtures/test';

test('the application loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
