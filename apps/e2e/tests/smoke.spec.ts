import { test, expect } from '../fixtures/test';

test('the application loads', async ({ page }) => {
  // The earlier test only checked that SOME title exists (/.+/ matches even a generic
  // error/blank page with any <title>) — that doesn't prove OUR app actually loaded. Now it
  // checks an exact, known title ("BrewTracker", from root layout.tsx) and that real
  // marketing homepage content is rendered (the same hero heading check as WEB-MKT-01), not
  // just that some HTML document arrived.
  await page.goto('/');
  await expect(page).toHaveTitle('BrewTracker');
  await expect(
    page.getByRole('heading', { name: 'Every machine. Every stop. Counted.' }),
  ).toBeVisible();
});
