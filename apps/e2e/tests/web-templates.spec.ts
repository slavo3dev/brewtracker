import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { RouteTemplatesPage } from '../pages/RouteTemplatesPage';
import { RoutesPage } from '../pages/RoutesPage';
import {
  forceCleanupTemplates,
  getTemplateIdByName,
  generateRoutesFromTemplates,
} from '../helpers/routeTemplateSeed';
import { cancelRoutesForMachine } from '../helpers/routeSeed';

const GENOVA_TEST_MACHINE_ID = process.env.QA_GENOVA_TEST_MACHINE_ID!;

const QA_DRIVER_ID = process.env.QA_DRIVER_ID!;

// "QA Conflict E" je postojeći template koji već ima bar jednu stanicu (preduslov za aktivaciju).
const TEMPLATE_NAME = 'QA Conflict E';

// Fajl je sad dovoljno velik (11 testova, mnogi rade create+addStop+activate, neki po dva
// template-a) da 6 paralelnih worker-a istovremeno hammeruje isti staging server — pod tim
// opterećenjem povremeno istekne 5s default timeout na uspeh-porukama (nije logička greška,
// potvrđeno izolovanim ponavljanjem). Isti obrazac kao web-fleet/web-recon/web-routes/web-survey.
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

  // Osiguraj oba preduslova za aktivaciju (bar 1 stanica već postoji na ovom template-u):
  // bar 1 radni dan izabran, i da krećemo od neaktivnog stanja.
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
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  await templates.addSkipException(TEMPLATE_NAME, '2027-01-10');
  await templates.expectExceptionRowVisible(TEMPLATE_NAME, 'Jan 10, 2027', 'Route skipped');
});

test('WEB-TPLEX-02: "Replace driver" exception requires a replacement driver', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  const driverSelect = await templates.attemptDriverExceptionWithoutDriver(TEMPLATE_NAME, '2027-01-24');

  // "overrideDriverId" select ima HTML required atribut — browser blokira submit pre nego
  // što ikada stigne do servera (nema "Route exception saved." poruke, nema novog reda).
  await expect(driverSelect).toHaveJSProperty('validity.valid', false);
  await expect(templates.exceptionRow(TEMPLATE_NAME, 'Jan 24, 2027', 'Driver override')).toHaveCount(0);
});

test('WEB-TPLEX-03: "Replace driver" exception correctly applies for that date', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const templates = new RouteTemplatesPage(page);
  await templates.goto();

  await templates.addDriverException(TEMPLATE_NAME, '2027-01-17');
  await templates.expectExceptionRowVisible(TEMPLATE_NAME, 'Jan 17, 2027', 'Driver override');
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
    // Direktan DB cleanup — garantovano se izvršava i ako assert gore padne na pola,
    // inače aktivan template ostaje trajno "zauzet" (isti vozač + dan + klijent) i
    // izaziva conflict grešku pri svakom narednom pokretanju ovog testa.
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
    // Direktan DB cleanup (ne preko UI-ja) — garantovano se izvršava čak i ako je gornji
    // assert pao na pola, inače aktivan template ostaje trajno "zauzet" i blokira SVAKO
    // naredno pokretanje ovog testa istom conflict greškom.
    await forceCleanupTemplates(['QA TPL-13-A', 'QA TPL-13-B']);
  }
});

test('WEB-TPL-16: Adding a conflicting stop to an active template is blocked', async ({ page }) => {
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

    // Dodavanje stanice na B za ISTU mašinu koju A već servisira tog dana mora biti odbijeno.
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

  // "Active"/"Inactive" labele metrika se broje JEDNOM svaka (plus po jedan bedž po kartici) —
  // oduzimanjem labele dobija se tačan broj kartica sa tim statusom.
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

    // Neaktivan template — bilo koji broj stanica se sme ukloniti bez ograničenja "poslednje stanice".
    await templates.createTemplate({ name, weekday: 'friday' });
    await templates.addStop(name, 'Milano Coffee · Milano');

    await templates.removeStop(name);
    await templates.expectNoStopsConfigured(name);
  } finally {
    await forceCleanupTemplates(['QA TPL-10']);
  }
});

test('WEB-TPL-14: Conflict check falls back to the client when stops have no machine', async ({ page }) => {
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

    // Dodavanje petka (dan koji već koristi A za istu mašinu) na B mora biti odbijeno.
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
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayWeekday = weekdayNames[new Date().getUTCDay()];

  try {
    // Čist preduslov — "osirotela" neotkazana ruta iz nekog ranijeg prekinutog pokretanja ovog
    // testa bi inače trajno blokirala generisanje za ovu mašinu/dan.
    await cancelRoutesForMachine(QA_DRIVER_ID, todayIso, GENOVA_TEST_MACHINE_ID);

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

    // Konfliktna neotkazana ruta već postoji — okurencija se preskače.
    let generated = await generateRoutesFromTemplates(todayIso);
    expect(generated.some((r) => r.route_template_id === templateId)).toBe(false);

    // Otkazivanje konfliktne rute uklanja prepreku — sledeća generacija uspeva.
    await routes.goto();
    await routes.searchRoutes(noteTag);
    await routes.expandFirstRoute();
    await routes.cancelExpandedRoute();
    await expect(routes.expandedRouteCard().getByText('cancelled', { exact: true })).toBeVisible();

    generated = await generateRoutesFromTemplates(todayIso);
    expect(generated.some((r) => r.route_template_id === templateId)).toBe(true);
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

  // Čekiranje DRUGOG dana ne dira prvi — nezavisni toggle, ne radio-dugme.
  await page.locator('label').filter({ has: wednesday }).click();
  expect(await monday.isChecked()).toBe(true);
  expect(await wednesday.isChecked()).toBe(true);

  // Ponovni klik na Monday ga iskljuci, Wednesday ostaje čekiran.
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

  // "Dec 15, 2026" / "One-off stop" red je već zasejan od strane WEB-STOPEX-01 (deljeni
  // TEMPLATE_NAME fixture) — za razliku od schedule exceptions (WEB-TPLEX-04), stop
  // exceptions nemaju Remove dugme uopšte (samo su RouteStopExceptionRow bez forme).
  const row = templates.exceptionRow(TEMPLATE_NAME, 'Dec 15, 2026', 'One-off stop').first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
});
