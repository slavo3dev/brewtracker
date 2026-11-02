import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-MVMT-02: Per-product agregatne kolone se tačno računaju (NET = TAKEN - DELIVERED - MACHINE - RETURNED)', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/movements');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  const rows = await page.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = tr.querySelectorAll('td');
      const parseNum = (cell: Element) => {
        const text = cell.querySelector('span')?.textContent ?? '0';
        return parseInt(text.replace(/[^\d-]/g, ''), 10);
      };
      return {
        product: cells[0].querySelector('p')?.textContent,
        taken: parseNum(cells[1]),
        delivered: parseNum(cells[2]),
        machine: parseNum(cells[3]),
        returned: parseNum(cells[4]),
        net: parseNum(cells[5]),
      };
    }),
  );

  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    const expectedNet = row.taken - row.delivered - row.machine - row.returned;
    expect(row.net, `NET za "${row.product}"`).toBe(expectedNet);
  }
});

test('WEB-MVMT-03: Stranica jasno naglašava da je izveštaj, ne autoritativno stanje', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/movements');
  await expect(
    page.getByText('not a confirmed physical on-hand balance.', { exact: false }),
  ).toBeVisible();
});
