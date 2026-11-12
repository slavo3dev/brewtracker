import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { RoutesPage } from '../pages/RoutesPage';
import { getRouteIdByNotes, deleteRoute } from '../helpers/routeSeed';
import { todayLocalIso } from '../helpers/date';

const QA_DRIVER_ID = process.env.QA_DRIVER_ID!;

test('WEB-RT-13: Add stop requires a client; the machine list is client-scoped', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = todayLocalIso();
  const noteTag = `QA-RT-13-${Date.now()}`;
  await routes.goto();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);

  try {
    await routes.searchRoutes(noteTag);
    await routes.expandFirstRoute();
    await routes.openAddStopForm();

    // Before a client is selected, the machine field is locked to "Select a client first".
    await routes.expectMachineRequiresClientFirst();

    // After a client is selected, the machine list is populated with ONLY that client's machines.
    await routes.selectStopClient('Italija');
    const machineOptions = await routes.getMachineOptionLabels();
    expect(machineOptions).toContain('Italija Machine');
    expect(machineOptions).not.toContain('Select a client first');
  } finally {
    // By noteTag, not "latest scheduled" — if creation failed (before the try block), the
    // "latest scheduled route for this driver" could be someone else's unrelated route.
    const routeId = await getRouteIdByNotes(noteTag);
    if (routeId) await deleteRoute(routeId);
  }
});
