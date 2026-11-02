import { test, expect } from '../fixtures/test';

test('aplikacija se učitava', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
