import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { RoutesPage } from '../pages/RoutesPage';

test('WEB-RT-13: Add stop zahteva klijenta; lista mašina je client-scoped', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  await routes.expandFirstRoute();
  await routes.openAddStopForm();

  // Pre izbora klijenta, polje za mašinu je zaključano na "Select a client first".
  await routes.expectMachineRequiresClientFirst();

  // Posle izbora klijenta, lista mašina se puni SAMO mašinama tog klijenta.
  await routes.selectStopClient('Italija');
  const machineOptions = await routes.getMachineOptionLabels();
  expect(machineOptions).toContain('Italija Machine');
  expect(machineOptions).not.toContain('Select a client first');
});
