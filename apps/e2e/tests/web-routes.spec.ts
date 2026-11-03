import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { RoutesPage } from '../pages/RoutesPage';
import {
  getLatestScheduledRouteId,
  markFirstStopAsStarted,
  setRouteStatus,
  createTemplateGeneratedRoute,
  deleteRoute,
} from '../helpers/routeSeed';

const QA_DRIVER_ID = process.env.QA_DRIVER_ID!;

// Svi testovi u ovom fajlu čitaju/menjaju istu deljenu listu ruta (brojevi, redosled
// "najnovije prvo") — paralelno izvršavanje izaziva race (pogrešni brojevi, pogrešan
// "prvi" red), pa rade jedan za drugim.
test.describe.configure({ mode: 'serial' });

test('WEB-RT-02: Creating a one-off route with all required fields', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  const before = await routes.getTotalRouteCount();

  const today = new Date().toISOString().slice(0, 10);
  await routes.createOneOffRoute(QA_DRIVER_ID, today);

  await routes.expectRouteCountIncreasedBy(before, 1);
});

test('WEB-RT-01: Metric cards reflect the correct route count for today', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();

  const routesToday = await routes.getRoutesTodayCount();
  const scheduled = await routes.getScheduledCount();
  const completed = await routes.getCompletedCount();
  const showing = await routes.getShowingCount();

  // "Routes today" metrika mora da se poklapa sa brojem ruta koje lista stvarno prikazuje
  // (lista je podrazumevano filtrirana na današnji datum) — ovo je glavna provera ovog testa.
  expect(routesToday).toBe(showing);

  // Scheduled i Completed su PODSKUP "Routes today" (postoje i cancelled/in_progress rute
  // za danas koje se ne računaju ni u jedno od ta dva), pa samo <= proveravamo, ne jednakost.
  expect(scheduled + completed).toBeLessThanOrEqual(routesToday);
});

test('WEB-RT-03: Creating a route is blocked without a driver/warehouse', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  const before = await routes.getTotalRouteCount();

  await routes.attemptCreateRouteWithoutRequiredFields();

  // "driverId"/"warehouseId" imaju HTML required atribut — browser blokira submit.
  await routes.expectRequiredFieldInvalid('driverId');
  await expect(page.getByText(`of ${before} routes`)).toBeVisible();
});

test('WEB-RT-05: Search filters routes by driver/warehouse/notes', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  await routes.clearDateFilter();
  await routes.searchRoutes('Milano');

  await routes.expectAllVisibleCardsContain('Milano');
});

test('WEB-RT-07: "Reset to today" link appears when the date changes', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();

  await routes.setDateFilter('2026-01-15');
  await routes.expectResetToTodayVisible();

  await routes.clickResetToToday();
  const today = new Date().toISOString().slice(0, 10);
  await expect(page.locator('input[type="date"]')).toHaveValue(today);
});

test('WEB-RT-08: Empty filter result shows the correct empty state', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  await routes.clearDateFilter();
  await routes.searchRoutes('qa-nonexistent-search-term-zzz-999');

  await routes.expectEmptyState();
});

test('WEB-RT-09: Pagination shows 10 routes per page with Prev/Next', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  await routes.clearDateFilter();

  await routes.expectPaginationVisible();
  await routes.expectPreviousDisabled();
  await expect(page.locator('article')).toHaveCount(10);

  await routes.clickNextPage();
  const label = await routes.getPaginationLabel();
  expect(label).toMatch(/Page 2 of \d+/);
});

test('WEB-RT-10: Recurring vs one-off badge displays correctly', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);

  // One-off: sveže ručno kreirana ruta.
  await routes.goto();
  const today = new Date().toISOString().slice(0, 10);
  await routes.createOneOffRoute(QA_DRIVER_ID, today);
  await routes.expectOneOffBadge(routes.firstRouteCard());

  // Recurring: ruta generisana iz template-a (source_route_template_id != null) — taj cron
  // posao ne pokrećemo u testovima, pa simuliramo njegov rezultat direktno preko baze.
  const routeId = await createTemplateGeneratedRoute(
    process.env.QA_DIANA_DRIVER_ID!,
    process.env.QA_WAREHOUSE_ID!,
    process.env.QA_DIANA_TEMPLATE_ID!,
    today,
  );

  try {
    // Pretraga po imenu vozača izbegava paginaciju (10 po strani).
    await login.goto();
    await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);
    await routes.goto();
    await routes.clearDateFilter();
    await routes.searchRoutes('Diana');
    await expect(page.locator('article').filter({ hasText: 'Recurring' }).first()).toBeVisible();
  } finally {
    await deleteRoute(routeId);
  }
});

test('WEB-RT-11: Map preview requires 2+ geocoded stops', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();

  // Sveža ruta bez ijedne stanice — sigurno ima < 2 geokodirane stanice.
  const today = new Date().toISOString().slice(0, 10);
  // Lista ruta sortira SAMO po route_date (bez tiebreaker-a po created_at) — sa mnogo ruta
  // za isti dan, "prva" kartica nije pouzdano naša novokreirana. Jedinstvena napomena +
  // pretraga garantuju da otvaramo BAŠ nju (isti obrazac kao RT-19/20/21/12/16).
  const noteTag = `QA-RT-11-${Date.now()}`;
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.expectMapPreviewMissingMessage();
});

test('WEB-RT-14: Removing a stop requires dialog confirmation', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  const before = await routes.getTotalRouteCount();

  const today = new Date().toISOString().slice(0, 10);
  // Vidi napomenu u RT-11: lista sortira samo po datumu, pa nam treba jedinstvena napomena
  // + pretraga da pouzdano otvorimo BAŠ ovu, novokreiranu rutu.
  const noteTag = `QA-RT-14-${Date.now()}`;
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');

  const stopsBefore = await routes.getStopCountInExpandedCard();
  expect(stopsBefore).toBe(1);

  // Odbijanje dijaloga — stanica ostaje.
  const dialogMessage = await routes.attemptRemoveFirstStopAndDismiss();
  expect(dialogMessage).toBe('Remove Italija from the route?');
  expect(await routes.getStopCountInExpandedCard()).toBe(1);

  // Potvrda dijaloga — stanica se uklanja.
  await routes.removeFirstStopAndConfirm();
  await routes.expectStopRemoved();
  expect(await routes.getStopCountInExpandedCard()).toBe(0);
});

test('WEB-RT-15: Cancelling a scheduled route', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();

  // Napravi svežu rutu (ne diramo postojeće podatke) i proveri da je nova — na vrhu liste, "scheduled".
  // Vidi napomenu u RT-11: lista sortira samo po datumu, pa nam treba jedinstvena napomena
  // + pretraga da pouzdano otvorimo BAŠ ovu, novokreiranu rutu.
  const today = new Date().toISOString().slice(0, 10);
  const noteTag = `QA-RT-15-${Date.now()}`;
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.searchRoutes(noteTag);
  await expect(routes.firstRouteCard().getByText('scheduled', { exact: true })).toBeVisible();

  await routes.expandFirstRoute();
  await routes.cancelExpandedRoute();

  await expect(routes.expandedRouteCard().getByText('cancelled', { exact: true })).toBeVisible();
});

test('WEB-RT-17: A route in progress or completed cannot be cancelled', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);

  await routes.goto();
  await routes.clearDateFilter();
  await routes.filterByStatus('in_progress');
  await routes.expectNoCancelButtonOnFirstRoute();

  await routes.goto();
  await routes.clearDateFilter();
  await routes.filterByStatus('completed');
  await routes.expectNoCancelButtonOnFirstRoute();
});

test('WEB-RT-18: A scheduled route with a started stop is rejected by the server', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = new Date().toISOString().slice(0, 10);
  // Lista ruta sortira SAMO po route_date (bez tiebreaker-a po created_at) — sa mnogo ruta
  // za isti dan (deljena baza, stotine ruta za "danas"), "prva" kartica nije pouzdano naša
  // novokreirana. Jedinstvena napomena + pretraga garantuju da otvaramo BAŠ nju (isti
  // obrazac kao RT-19/20/21/12/16).
  const noteTag = `QA-RT-18-${Date.now()}`;

  // Napravi rutu i dodaj joj stanicu (ruta ostaje "scheduled" — status rute se ne menja
  // automatski samim dodavanjem stanice).
  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  // Sačekaj da se lista STVARNO osveži sa novom rutom pre nego što kliknemo "prvu" —
  // inače možemo da uhvatimo staru rutu koja je bila prva pre osvežavanja.
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');

  // Direktno preko baze označi tu stanicu kao započetu (to inače radi samo mobilna app).
  const routeId = await getLatestScheduledRouteId(QA_DRIVER_ID, today);
  await markFirstStopAsStarted(routeId);

  // Ruta je i dalje "scheduled" u UI-ju (dugme Cancel route i dalje postoji), ali server
  // odbija sam zahtev za otkazivanje.
  await routes.goto();
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.cancelExpandedRoute();

  await routes.expectCancelRejected(
    'Unable to cancel route: This route cannot be cancelled because service has already started.',
  );
});

test('WEB-RT-19: A cancelled route does not allow managing stops', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = new Date().toISOString().slice(0, 10);
  // Više testova u istom prolazu pravi rute za isti dan, a lista se ne sortira pouzdano po
  // vremenu kreiranja za taj slučaj — jedinstvena napomena + pretraga garantuju da otvaramo BAŠ
  // tu rutu umesto da se oslanjamo na poziciju "prve" kartice.
  const noteTag = `QA-RT-19-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');

  await routes.cancelExpandedRoute();
  await expect(routes.expandedRouteCard().getByText('cancelled', { exact: true })).toBeVisible();

  await routes.expectCancelledHistoricalMessage();
  await routes.expectAddStopDisabled();
  await routes.expectStopControlsDisabledFor('Italija');
});

test('WEB-RT-20: A route in progress does not allow managing stops', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = new Date().toISOString().slice(0, 10);
  const noteTag = `QA-RT-20-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');

  const routeId = await getLatestScheduledRouteId(QA_DRIVER_ID, today);
  // UI nema put da rutu postavi u "in_progress" (to radi samo mobilna app) — direktno preko baze,
  // uz vraćanje na "scheduled" na kraju da ne zaprlja podatke za druge testove.
  await setRouteStatus(routeId, 'in_progress');
  try {
    await routes.goto();
    await routes.searchRoutes(noteTag);
    await routes.expandFirstRoute();

    await routes.expectAddStopDisabled();
    await routes.expectStopControlsDisabledFor('Italija');
  } finally {
    await setRouteStatus(routeId, 'scheduled');
  }
});

test('WEB-RT-21: Updating stop order', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = new Date().toISOString().slice(0, 10);
  const noteTag = `QA-RT-21-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');
  await routes.addStopToExpandedRoute('Milano Coffee', 'Milano Coffee Machine');

  expect(await routes.getStopClientNamesInOrder()).toEqual(['Italija', 'Milano Coffee']);

  // Nevalidan unos (prazno polje) je odbijen — redosled se ne menja.
  await routes.setStopOrder('Italija', '');
  await routes.expectSequenceInvalid();
  expect(await routes.getStopClientNamesInOrder()).toEqual(['Italija', 'Milano Coffee']);

  // Valjan unos (veći broj od trenutnog redosleda druge stanice) pomera "Italija" na drugo mesto.
  await routes.setStopOrder('Italija', '3');
  await routes.expectStopOrderUpdated();
  expect(await routes.getStopClientNamesInOrder()).toEqual(['Milano Coffee', 'Italija']);
});

test('WEB-RT-04: "Create one-off route" toggle button changes label and hides the form', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();

  await routes.expectCreateFormClosed();
  await expect(page.locator('select[name="driverId"]')).toHaveCount(0);

  await routes.createOneOffRouteToggle().click();
  await routes.expectCreateFormOpen();
  await expect(page.locator('select[name="driverId"]')).toBeVisible();

  await routes.createOneOffRouteToggle().click();
  await routes.expectCreateFormClosed();
  await expect(page.locator('select[name="driverId"]')).toHaveCount(0);
});

test('WEB-RT-06: Status filter options reflect the real statuses in the data', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();

  const options = await routes.getStatusFilterOptions();
  // Dinamički izvedeno iz podataka (sort() u kodu) — ne hardkodovana lista; proveravamo da
  // su opcije validni route statusi i da ih ima više od jedne (mešoviti podaci u ovom
  // deljenom QA okruženju garantovano sadrže bar scheduled+cancelled+completed).
  const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];
  expect(options.length).toBeGreaterThan(1);
  for (const opt of options) {
    expect(validStatuses).toContain(opt);
  }
  expect(options).toEqual([...options].sort());
});

test('WEB-RT-12: "Open in Google Maps" generates the correct directions URL', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = new Date().toISOString().slice(0, 10);
  const noteTag = `QA-RT-12-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');
  await routes.addStopToExpandedRoute('Milano Coffee', 'Milano Coffee Machine');

  // Proveravamo sam href atribut (ne stvarnu navigaciju) — Google u headless Chromium-u
  // često presreće prvi odlazak na svoj sajt EU consent-wall redirectom (consent.google.com),
  // koji menja vidljiv URL i nema veze sa tim da li je NAŠA app generisala ispravan link.
  const href = await routes
    .expandedRouteCard()
    .getByRole('link', { name: 'Open in Google Maps' })
    .getAttribute('href');

  expect(href).toContain('https://www.google.com/maps/dir/');
  expect(href).toContain('api=1');
  expect(href).toContain('travelmode=driving');
  expect(href).toMatch(/origin=[\d.]+%2C[\d.]+|origin=[\d.]+,[\d.]+/);
});

test('WEB-RT-16: Dismissing the cancel dialog changes nothing', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = new Date().toISOString().slice(0, 10);
  const noteTag = `QA-RT-16-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();

  await routes.dismissCancelExpandedRoute();

  // Ruta ostaje scheduled — nema "Route cancelled." poruke ni promene statusa.
  await expect(routes.expandedRouteCard().getByText('Route cancelled.')).toHaveCount(0);
  await expect(routes.expandedRouteCard().getByText('scheduled', { exact: true })).toBeVisible();
});
