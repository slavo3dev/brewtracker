import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { RouteTemplatesPage } from '../pages/RouteTemplatesPage';
import { RoutesPage } from '../pages/RoutesPage';
import {
  forceCleanupTemplates,
  getTemplateIdByName,
  generateRoutesFromTemplates,
} from '../helpers/routeTemplateSeed';
import { cancelRoutesForMachine, deleteRoute } from '../helpers/routeSeed';
import { todayLocalIso } from '../helpers/date';

const GENOVA_TEST_MACHINE_ID = process.env.QA_GENOVA_TEST_MACHINE_ID!;

const QA_DRIVER_ID = process.env.QA_DRIVER_ID!;

// "QA Conflict E" is an existing template that already has at least one stop (a
// precondition for activation).
const TEMPLATE_NAME = 'QA Conflict E';

// The file is now large enough (11 tests, many doing create+addStop+activate, some with two
// templates) that 6 parallel workers hammering the same staging server at once occasionally
// causes the default 5s timeout on success messages to run out (not a logic error, confirmed
// by isolated retries). Same pattern as web-fleet/web-recon/web-routes/web-survey.
test.describe.configure({ mode: 'serial' });

test('WEB-TPL-04: Empty state when there are no templates', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): would require deleting all 180+ existing route templates in the shared database, including active ones other test files rely on. Needs an isolated test database.',
  );
});

test('WEB-TPL-07: Template activates successfully when valid', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  // Ensure both preconditions for activation (at least 1 stop already exists on this
  // template): at least 1 service day selected, and that we start from an inactive state.
  await templates.ensureHasServiceDay(TEMPLATE_NAME, 'monday');
  await templates.ensureInactive(TEMPLATE_NAME);

  await templates.activate(TEMPLATE_NAME);
  await templates.expectActive(TEMPLATE_NAME);
});

test('WEB-STOPEX-01: Adding a one-off stop exception for a specific date', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  await templates.addOneOffStopException(TEMPLATE_NAME, {
    dateIso: '2026-12-15',
    clientLabel: 'Italija · QA Test City',
  });

  await templates.expectStopExceptionListed(TEMPLATE_NAME, 'Dec 15, 2026');
});

test('WEB-STOPEX-02: Removing a recurring stop for a specific date', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  await templates.removeRecurringStopException(TEMPLATE_NAME, {
    dateIso: '2026-12-22',
    stopLabel: '1. Genova Caffe · TEST-SERIAL-GENOVA-001',
  });

  await templates.expectRecurringStopRemovedListed(TEMPLATE_NAME, 'Dec 22, 2026');
});

test('WEB-STOPEX-03: Remove-recurring-stop mode is disabled when the template has no stops', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const name = `QA STOPEX-03 ${Date.now()}`;
  await templates.createTemplate({ name });

  await templates.switchToRemoveRecurringStopMode(name);
  await templates.expectRemoveRecurringStopDisabledEmpty(name);
});

test('WEB-TPLEX-01: "Skip route" exception prevents generation for that date', async ({ page }) => {
  // The earlier test only checked that the exception row exists in the UI list — never that
  // it actually affects generation (the RPC was never called). The row would show up even if
  // the exception had NO effect whatsoever on generate_routes_from_templates(). Here, using
  // the same pattern as WEB-TPL-20, a dedicated template is used (not the shared
  // TEMPLATE_NAME, whose day/driver/active state aren't under our control) and the RPC is
  // actually called — before adding the exception (proof that generation works for that day)
  // and after (proof the exception actually skips THAT specific date).
  // Two real RPC calls + 4 UI round-trips (create/add stop/activate/add exception) together
  // are slower than the default 30s budget under load on the shared staging server — the
  // same pattern as WEB-FLEET-05 (test.setTimeout(90000)) elsewhere in the suite.
  test.setTimeout(60000);

  const name = `QA TPLEX-01 ${Date.now()}`;
  const exceptionDateIso = '2027-03-15';
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const exceptionWeekday = weekdayNames[new Date(`${exceptionDateIso}T00:00:00Z`).getUTCDay()];

  try {
    // A clean precondition — same reason as WEB-TPL-20: an "orphaned" uncancelled route left
    // over from some earlier, interrupted run of this test would otherwise permanently block
    // the baseline generation below (ROUTE-6 would skip it because of THAT route, not because
    // of the skip exception the test is actually checking).
    await cancelRoutesForMachine(QA_DRIVER_ID, exceptionDateIso, GENOVA_TEST_MACHINE_ID, 'QA-TPLEX-01-');

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: exceptionWeekday, driverId: QA_DRIVER_ID });
    await templates.addStop(name, 'Genova Test Client · Genova', 'Genova Test Machine · SN-GENOVA-TEST-01');
    await templates.activate(name);
    await templates.expectActive(name);

    const templateId = await getTemplateIdByName(name);

    // Baseline BEFORE the exception: generation for that date must actually succeed —
    // without this, the later "no route generated" result wouldn't prove the EXCEPTION is
    // the cause.
    let generated = await generateRoutesFromTemplates(exceptionDateIso, templateId);
    expect(generated.some((r) => r.route_template_id === templateId)).toBe(true);
    const baselineRouteId = generated.find((r) => r.route_template_id === templateId)?.route_id;
    if (baselineRouteId) await deleteRoute(baselineRouteId);

    await templates.addSkipException(name, exceptionDateIso);
    await templates.expectExceptionRowVisible(name, 'Mar 15, 2027', 'Route skipped');

    // Same date, now with the exception — generation for THIS template must be skipped.
    generated = await generateRoutesFromTemplates(exceptionDateIso, templateId);
    expect(generated.some((r) => r.route_template_id === templateId)).toBe(false);
  } finally {
    await forceCleanupTemplates(['QA TPLEX-01']);
  }
});

test('WEB-TPLEX-02: "Replace driver" exception requires a replacement driver', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const driverSelect = await templates.attemptDriverExceptionWithoutDriver(TEMPLATE_NAME, '2027-01-24');

  // The "overrideDriverId" select has an HTML required attribute — the browser blocks
  // submission before it ever reaches the server (no "Route exception saved." message, no
  // new row).
  await expect(driverSelect).toHaveJSProperty('validity.valid', false);
  await expect(templates.exceptionRow(TEMPLATE_NAME, 'Jan 24, 2027', 'Driver override')).toHaveCount(0);
});

test('WEB-TPLEX-03: "Replace driver" exception correctly applies for that date', async ({ page }) => {
  // Same gap as WEB-TPLEX-01: the earlier test only checked that the exception row exists in
  // the UI list, never that the route generated for that date actually uses the override
  // driver instead of the template's own. A dedicated template (not the shared
  // TEMPLATE_NAME) + a real RPC call, the same pattern as WEB-TPL-20.
  test.setTimeout(60000);

  const name = `QA TPLEX-03 ${Date.now()}`;
  const exceptionDateIso = '2027-03-22';
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const exceptionWeekday = weekdayNames[new Date(`${exceptionDateIso}T00:00:00Z`).getUTCDay()];

  try {
    // A clean precondition — see the note in WEB-TPLEX-01.
    await cancelRoutesForMachine(QA_DRIVER_ID, exceptionDateIso, GENOVA_TEST_MACHINE_ID, 'QA-TPLEX-03-');

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: exceptionWeekday, driverId: QA_DRIVER_ID });
    await templates.addStop(name, 'Genova Test Client · Genova', 'Genova Test Machine · SN-GENOVA-TEST-01');
    await templates.activate(name);
    await templates.expectActive(name);

    const templateId = await getTemplateIdByName(name);

    await templates.addDriverException(name, exceptionDateIso);
    await templates.expectExceptionRowVisible(name, 'Mar 22, 2027', 'Driver override');

    const generated = await generateRoutesFromTemplates(exceptionDateIso, templateId);
    const generatedRoute = generated.find((r) => r.route_template_id === templateId);
    expect(generatedRoute).toBeTruthy();
    // addDriverException() picks a replacement driver from the dropdown (second in order,
    // != the template's own driver) — real proof the exception has an effect is that the
    // generated route is NOT on the template's own (QA_DRIVER_ID) driver, not just that the
    // exception row exists in the UI.
    expect(generatedRoute!.driver_id).not.toBe(QA_DRIVER_ID);

    if (generatedRoute) await deleteRoute(generatedRoute.route_id);
  } finally {
    await forceCleanupTemplates(['QA TPLEX-03']);
  }
});

test('WEB-TPL-01: A new template is always created inactive', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const name = `QA TPL-01 ${Date.now()}`;
  await templates.createTemplate({ name, weekday: 'monday' });
  await templates.expectInactive(name);
});

test('WEB-TPL-05: Activation is blocked with no service day selected', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const name = `QA TPL-05 ${Date.now()}`;
  await templates.createTemplate({ name });
  await templates.activate(name);
  await templates.expectActivationError(
    name,
    'Select at least one service day before activating the template.',
  );
});

test('WEB-TPL-06: Activation is blocked with no stops', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const name = `QA TPL-06 ${Date.now()}`;
  await templates.createTemplate({ name, weekday: 'monday' });
  await templates.activate(name);
  await templates.expectActivationError(
    name,
    'Add at least one stop before activating the template.',
  );
});

test('WEB-TPL-09: Removing the last stop of an active template is blocked', async ({ page }) => {
  const name = `QA TPL-09 ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: 'monday' });
    await templates.addStop(name, 'Italija · QA Test City');
    await templates.activate(name);
    await templates.expectActive(name);

    await templates.expectRemoveStopDisabled(
      name,
      'Deactivate the template before removing its last stop.',
    );
  } finally {
    // Direct DB cleanup — guaranteed to run even if the assertion above fails partway
    // through, otherwise an active template stays permanently "occupied" (same driver + day
    // + client) and triggers a conflict error on every subsequent run of this test.
    await forceCleanupTemplates(['QA TPL-09']);
  }
});

test('WEB-TPL-11: Deleting an inactive template', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const name = `QA TPL-11 ${Date.now()}`;
  await templates.createTemplate({ name });
  await templates.deleteTemplate(name);

  await templates.expectTemplateNotListed(name);
});

test('WEB-TPL-12: An active template cannot be deleted', async ({ page }) => {
  // NOTE (investigated, deliberately left this way): this test only checks that the UI hides
  // the Delete button for an active template — not that the protection is also enforced
  // server-side. To verify that without changing app code, we'd need to call the
  // service-role client directly to delete the row — BUT grepping all migrations
  // (supabase/migrations/*.sql) confirms there is NO DELETE trigger on the route_templates
  // table (forceCleanupTemplates below successfully deletes ACTIVE templates directly via
  // the same admin connection, without error) — the protection is EXCLUSIVELY in the server
  // action (application code), not the database. Such a direct DB call would therefore
  // ALWAYS "succeed" regardless of whether the server action is correct, and would prove
  // nothing about it — it would be a falsely reassuring test, not a stronger one. A real
  // check of server-side protection would require either a DB trigger (a database change,
  // outside the allowed scope of this change) or calling the Next.js server action itself
  // bypassing the UI (unstable reverse-engineering, same reason as the note in
  // WEB-SURV-10). Left as a known limitation.
  const name = `QA TPL-12 ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: 'tuesday' });
    await templates.addStop(name, 'Italija · QA Test City');
    await templates.activate(name);
    await templates.expectActive(name);

    await templates.expectNoDeleteButton(name);
  } finally {
    await forceCleanupTemplates(['QA TPL-12']);
  }
});

test('WEB-TPL-13: Activation is blocked when the same machine is already scheduled for that driver that day', async ({ page }) => {
  // Two full create+addStop+activate cycles in a row — under load, each step on its own can
  // get close to its individual timeout (createTemplate 25s, addStop 15s, activate 10s), so
  // the sum easily exceeds the default 30s budget for the WHOLE test. Confirmed by a
  // screenshot from a real failure (WEB-TPL-15, same pattern): the button was still
  // "Updating…"/"Creating…" at the moment of the timeout, not a locator/race bug.
  test.setTimeout(60000);

  const nameA = `QA TPL-13-A ${Date.now()}`;
  const nameB = `QA TPL-13-B ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name: nameA, weekday: 'wednesday' });
    await templates.addStop(nameA, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');
    await templates.activate(nameA);
    await templates.expectActive(nameA);

    await templates.createTemplate({ name: nameB, weekday: 'wednesday' });
    await templates.addStop(nameB, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');
    await templates.activate(nameB);

    await templates.expectActivationError(
      nameB,
      `QA-SN-0003 is already assigned to this driver on Wednesday by route template "${nameA}".`,
    );
    await templates.expectInactive(nameB);
  } finally {
    // Direct DB cleanup (not via the UI) — guaranteed to run even if the assertion above
    // failed partway through, otherwise an active template stays permanently "occupied" and
    // blocks EVERY subsequent run of this test with the same conflict error.
    await forceCleanupTemplates(['QA TPL-13-A', 'QA TPL-13-B']);
  }
});

test('WEB-TPL-16: Adding a conflicting stop to an active template is blocked', async ({ page }) => {
  // See the note in WEB-TPL-13: two full create+addStop+activate cycles easily exceed the
  // default 30s budget under load.
  test.setTimeout(60000);

  const nameA = `QA TPL-16-A ${Date.now()}`;
  const nameB = `QA TPL-16-B ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name: nameA, weekday: 'thursday' });
    await templates.addStop(nameA, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');
    await templates.activate(nameA);
    await templates.expectActive(nameA);

    await templates.createTemplate({ name: nameB, weekday: 'thursday' });
    await templates.addStop(nameB, 'Genova Test Client · Genova', 'Genova Test Machine · SN-GENOVA-TEST-01');
    await templates.activate(nameB);
    await templates.expectActive(nameB);

    // Adding a stop on B for the SAME machine A is already servicing that day must be rejected.
    await templates.attemptAddStop(nameB, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');
    await templates.expectActivationError(
      nameB,
      `QA-SN-0003 is already assigned to this driver on Thursday by route template "${nameA}".`,
    );
  } finally {
    await forceCleanupTemplates(['QA TPL-16-A', 'QA TPL-16-B']);
  }
});

test('WEB-TPL-02: Template metrics (Templates/Active/Inactive) match the real state', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const { total, active, inactive } = await templates.getMetrics();
  expect(active + inactive).toBe(total);

  // The "Active"/"Inactive" metric labels are counted ONCE each (plus one badge per card) —
  // subtracting the label gives the exact number of cards with that status.
  const activeBadgeCount = await page.getByText('Active', { exact: true }).count();
  const inactiveBadgeCount = await page.getByText('Inactive', { exact: true }).count();
  expect(activeBadgeCount - 1).toBe(active);
  expect(inactiveBadgeCount - 1).toBe(inactive);
});

test('WEB-TPL-08: An active template can be freely deactivated', async ({ page }) => {
  const name = `QA TPL-08 ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: 'friday' });
    await templates.addStop(name, 'Milano Coffee · Milano');
    await templates.activate(name);
    await templates.expectActive(name);

    await templates.deactivate(name);
    await templates.expectInactive(name);
    await templates.expectDeleteButtonVisible(name);
  } finally {
    await forceCleanupTemplates(['QA TPL-08']);
  }
});

test('WEB-TPL-10: Removing a stop that is not the last (or any stop on an inactive template) succeeds', async ({ page }) => {
  const name = `QA TPL-10 ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    // An inactive template — any number of stops may be removed without the "last stop"
    // restriction.
    await templates.createTemplate({ name, weekday: 'friday' });
    await templates.addStop(name, 'Milano Coffee · Milano');

    await templates.removeStop(name);
    await templates.expectNoStopsConfigured(name);
  } finally {
    await forceCleanupTemplates(['QA TPL-10']);
  }
});

test('WEB-TPL-14: Conflict check falls back to the client when stops have no machine', async ({ page }) => {
  // See the note in WEB-TPL-13: two full create+addStop+activate cycles easily exceed the
  // default 30s budget under load.
  test.setTimeout(60000);

  const nameA = `QA TPL-14-A ${Date.now()}`;
  const nameB = `QA TPL-14-B ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name: nameA, weekday: 'friday' });
    await templates.addStop(nameA, 'Milano Coffee · Milano');
    await templates.activate(nameA);
    await templates.expectActive(nameA);

    await templates.createTemplate({ name: nameB, weekday: 'friday' });
    await templates.addStop(nameB, 'Milano Coffee · Milano');
    await templates.activate(nameB);

    await templates.expectActivationError(
      nameB,
      `Milano Coffee is already assigned to this driver on Friday by route template "${nameA}".`,
    );
    await templates.expectInactive(nameB);
  } finally {
    await forceCleanupTemplates(['QA TPL-14-A', 'QA TPL-14-B']);
  }
});

test('WEB-TPL-15: No conflict for different days (no overlap)', async ({ page }) => {
  // A real failure (confirmed by a screenshot): the "Activate" button was still "Updating…"
  // at the moment the 30s budget for the whole test ran out — two full
  // create+addStop+activate cycles in a row, under load, easily exceed that budget. See the
  // same note in WEB-TPL-13.
  test.setTimeout(60000);

  const nameA = `QA TPL-15-A ${Date.now()}`;
  const nameB = `QA TPL-15-B ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name: nameA, weekday: 'friday' });
    await templates.addStop(nameA, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');
    await templates.createTemplate({ name: nameB, weekday: 'saturday' });
    await templates.addStop(nameB, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');

    await templates.activate(nameA);
    await templates.expectActive(nameA);
    await templates.activate(nameB);
    await templates.expectActive(nameB);
  } finally {
    await forceCleanupTemplates(['QA TPL-15-A', 'QA TPL-15-B']);
  }
});

test('WEB-TPL-17: Editing an active template into a conflict is blocked', async ({ page }) => {
  // See the note in WEB-TPL-13: two full create+addStop+activate cycles easily exceed the
  // default 30s budget under load.
  test.setTimeout(60000);

  const nameA = `QA TPL-17-A ${Date.now()}`;
  const nameB = `QA TPL-17-B ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name: nameA, weekday: 'friday' });
    await templates.addStop(nameA, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');
    await templates.activate(nameA);
    await templates.expectActive(nameA);

    await templates.createTemplate({ name: nameB, weekday: 'saturday' });
    await templates.addStop(nameB, 'Italija · QA Test City', 'Italija Machine · QA-SN-0003');
    await templates.activate(nameB);
    await templates.expectActive(nameB);

    // Adding Friday (a day A already uses for the same machine) to B must be rejected.
    await templates.toggleEditServiceDay(nameB, 'friday');
    await templates.saveEdit(nameB);
    await templates.expectEditError(
      nameB,
      `QA-SN-0003 is already assigned to this driver on Friday by route template "${nameA}".`,
    );
  } finally {
    await forceCleanupTemplates(['QA TPL-17-A', 'QA TPL-17-B']);
  }
});

test('WEB-TPL-18: Stop validation — end before start is rejected, machines are limited to the client', async ({ page }) => {
  const name = `QA TPL-18 ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: 'friday' });
    await templates.attemptAddStopWithTimes(
      name,
      'Italija · QA Test City',
      'Italija Machine · QA-SN-0003',
      '10:00',
      '09:00',
    );
    await templates.expectAddStopError(name, 'Scheduled end time must be after scheduled start time.');

    const machineOptions = await templates.getStopFormMachineOptionsForClient(name, 'Genova Test Client · Genova');
    expect(machineOptions).toContain('No machine');
    expect(machineOptions.filter((label) => label !== 'No machine').every((label) => label.includes('SN-GENOVA-TEST-01'))).toBe(
      true,
    );
  } finally {
    await forceCleanupTemplates(['QA TPL-18']);
  }
});

test('WEB-TPL-19: An active template must keep at least one service day', async ({ page }) => {
  const name = `QA TPL-19 ${Date.now()}`;

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: 'friday' });
    await templates.addStop(name, 'Milano Coffee · Milano');
    await templates.activate(name);
    await templates.expectActive(name);

    await templates.uncheckAllServiceDays(name);
    await templates.saveEdit(name);
    await templates.expectEditError(name, 'An active route template must have at least one service day.');
  } finally {
    await forceCleanupTemplates(['QA TPL-19']);
  }
});

test('WEB-TPL-20: Daily generation skips an occurrence that conflicts with an existing route', async ({ page }) => {
  const name = `QA TPL-20 ${Date.now()}`;
  const todayIso = todayLocalIso();
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  // Derived FROM todayIso (not a separate "now" call) so the weekday always matches the exact
  // calendar date we use everywhere else below, regardless of timezone.
  const todayWeekday = weekdayNames[new Date(`${todayIso}T00:00:00Z`).getUTCDay()];

  try {
    // A clean precondition — an "orphaned" uncancelled route left over from some earlier,
    // interrupted run of this test would otherwise permanently block generation for this
    // machine/day. notesPrefix ensures ONLY this test's earlier fixture route is touched, not
    // someone else's legitimate scheduled route.
    await cancelRoutesForMachine(QA_DRIVER_ID, todayIso, GENOVA_TEST_MACHINE_ID, 'QA-TPL-20-');

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const templates = new RouteTemplatesPage(page);
    await templates.goto();

    await templates.createTemplate({ name, weekday: todayWeekday, driverId: QA_DRIVER_ID });
    await templates.addStop(name, 'Genova Test Client · Genova', 'Genova Test Machine · SN-GENOVA-TEST-01');
    await templates.activate(name);
    await templates.expectActive(name);

    const templateId = await getTemplateIdByName(name);

    const routes = new RoutesPage(page);
    const noteTag = `QA-TPL-20-${Date.now()}`;
    await routes.goto();
    const before = await routes.getTotalRouteCount();
    await routes.createOneOffRoute(QA_DRIVER_ID, todayIso, noteTag);
    await routes.expectRouteCountIncreasedBy(before, 1);
    await routes.searchRoutes(noteTag);
    await routes.expandFirstRoute();
    await routes.addStopToExpandedRoute('Genova Test Client', 'Genova Test Machine');

    // A conflicting, uncancelled route already exists — the occurrence is skipped.
    let generated = await generateRoutesFromTemplates(todayIso, templateId);
    expect(generated.some((r) => r.route_template_id === templateId)).toBe(false);

    // Cancelling the conflicting route removes the obstacle — the next generation succeeds.
    await routes.goto();
    await routes.searchRoutes(noteTag);
    await routes.expandFirstRoute();
    await routes.cancelExpandedRoute();
    await expect(routes.expandedRouteCard().getByText('cancelled', { exact: true })).toBeVisible();

    generated = await generateRoutesFromTemplates(todayIso, templateId);
    expect(generated.some((r) => r.route_template_id === templateId)).toBe(true);

    // The RPC generates a REAL operational route (notes inherited from the template, usually
    // null — doesn't carry our noteTag), which, without explicit cleanup here, stays
    // permanently "scheduled" for this driver/machine/day and blocks EVERY subsequent run of
    // this test.
    const generatedRouteId = generated.find((r) => r.route_template_id === templateId)?.route_id;
    if (generatedRouteId) {
      await deleteRoute(generatedRouteId);
    }
  } finally {
    await forceCleanupTemplates(['QA TPL-20']);
  }
});

test('WEB-TPLEX-04: Removing an existing exception', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  await templates.addSkipException(TEMPLATE_NAME, '2027-02-05');
  await templates.expectExceptionRowVisible(TEMPLATE_NAME, 'Feb 5, 2027', 'Route skipped');

  await templates.removeException(TEMPLATE_NAME, 'Feb 5, 2027', 'Route skipped');
  await templates.expectExceptionRowNotVisible(TEMPLATE_NAME, 'Feb 5, 2027', 'Route skipped');
});

test('WEB-TPL-03: Weekday chips toggle independently in the create form', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const monday = page.locator('input[name="monday"]');
  const wednesday = page.locator('input[name="wednesday"]');

  await page.locator('label').filter({ has: monday }).click();
  expect(await monday.isChecked()).toBe(true);
  expect(await wednesday.isChecked()).toBe(false);

  // Checking a SECOND day doesn't touch the first — an independent toggle, not a radio button.
  await page.locator('label').filter({ has: wednesday }).click();
  expect(await monday.isChecked()).toBe(true);
  expect(await wednesday.isChecked()).toBe(true);

  // Clicking Monday again unchecks it, Wednesday remains checked.
  await page.locator('label').filter({ has: monday }).click();
  expect(await monday.isChecked()).toBe(false);
  expect(await wednesday.isChecked()).toBe(true);
});

test('WEB-STOPEX-04: Stop exception rows have no Remove control (documented gap)', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  // The "Dec 15, 2026" / "One-off stop" row is already seeded by WEB-STOPEX-01 (the shared
  // TEMPLATE_NAME fixture) — unlike schedule exceptions (WEB-TPLEX-04), stop exceptions have
  // no Remove button at all (they're just a RouteStopExceptionRow with no form).
  const row = templates.exceptionRow(TEMPLATE_NAME, 'Dec 15, 2026', 'One-off stop').first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
});
