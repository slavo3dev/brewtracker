import { test, expect } from '../fixtures/test';

test('the application loads', async ({ page }) => {
  // Raniji test je proveravao SAMO da postoji NEKI naslov (/.+/ pogađa čak i generičku
  // error/blank stranicu sa bilo kakvim <title>-om) — to ne dokazuje da je NAŠA app stvarno
  // učitana. Sada se proverava tačan, poznat naslov ("BrewTracker", iz root layout.tsx) i da
  // je stvaran sadržaj marketinške početne strane renderovan (ista hero naslov provera kao
  // WEB-MKT-01), ne samo da je neki HTML dokument stigao.
  await page.goto('/');
  await expect(page).toHaveTitle('BrewTracker');
  await expect(
    page.getByRole('heading', { name: 'Every machine. Every stop. Counted.' }),
  ).toBeVisible();
});
