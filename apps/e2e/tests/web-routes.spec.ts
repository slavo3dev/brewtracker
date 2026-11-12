import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { RoutesPage } from '../pages/RoutesPage';
import {
  getRouteIdByNotes,
  markFirstStopAsStarted,
  setRouteStatus,
  createTemplateGeneratedRoute,
  deleteRoute,
} from '../helpers/routeSeed';
import { todayLocalIso } from '../helpers/date';
import { supabaseAdmin } from '../helpers/supabaseAdmin';

const QA_DRIVER_ID = process.env.QA_DRIVER_ID!;

// All tests in this file read/mutate the same shared route list (counts, "newest first"
// ordering) — running in parallel causes a race (wrong counts, wrong "first" row), so they
// run one after another.
test.describe.configure({ mode: 'serial' });

test('WEB-RT-02: Creating a one-off route with all required fields', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();
  const before = await routes.getTotalRouteCount();

  const today = todayLocalIso();
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

  // The "Routes today" metric must match the number of routes the list actually shows
  // (the list is filtered to today's date by default) — this is the main check of this test.
  expect(routesToday).toBe(showing);

  // Scheduled and Completed are a SUBSET of "Routes today" (there are also cancelled/in_progress
  // routes for today that count in neither of those two), so we only check <=, not equality.
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

  // "driverId"/"warehouseId" have an HTML required attribute — the browser blocks submission.
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
  const today = todayLocalIso();
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

  // One-off: a freshly, manually created route. The list sorts ONLY by route_date (no
  // tiebreaker on created_at) — with many routes on the same day, the "first" card isn't
  // reliably our newly-created one. A unique note + search guarantee we're looking at
  // EXACTLY it (same pattern as RT-11/14/15).
  await routes.goto();
  const today = todayLocalIso();
  const noteTag = `QA-RT-10-${Date.now()}`;
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.searchRoutes(noteTag);
  await routes.expectOneOffBadge(routes.firstRouteCard());

  const oneOffRouteId = await getRouteIdByNotes(noteTag);
  if (!oneOffRouteId) throw new Error(`Unable to find route with noteTag: ${noteTag}`);

  // Recurring: a route generated from a template (source_route_template_id != null) — we
  // don't run that cron job in tests, so we simulate its result directly via the database.
  const routeId = await createTemplateGeneratedRoute(
    process.env.QA_DIANA_DRIVER_ID!,
    process.env.QA_WAREHOUSE_ID!,
    process.env.QA_DIANA_TEMPLATE_ID!,
    today,
  );

  try {
    // Searching by driver name avoids pagination (10 per page).
    await login.goto();
    await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);
    await routes.goto();
    await routes.clearDateFilter();
    await routes.searchRoutes('Diana');
    await expect(page.locator('article').filter({ hasText: 'Recurring' }).first()).toBeVisible();
  } finally {
    await deleteRoute(routeId);
    await deleteRoute(oneOffRouteId);
  }
});

test('WEB-RT-11: Map preview requires 2+ geocoded stops', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  await routes.goto();

  // A fresh route with no stops at all — guaranteed to have < 2 geocoded stops.
  const today = todayLocalIso();
  // The route list sorts ONLY by route_date (no tiebreaker on created_at) — with many
  // routes on the same day, the "first" card isn't reliably our newly-created one. A unique
  // note + search guarantee we open EXACTLY it (same pattern as RT-19/20/21/12/16).
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

  const today = todayLocalIso();
  // See the note in RT-11: the list sorts only by date, so we need a unique note + search to
  // reliably open EXACTLY this newly-created route.
  const noteTag = `QA-RT-14-${Date.now()}`;
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');

  const stopsBefore = await routes.getStopCountInExpandedCard();
  expect(stopsBefore).toBe(1);

  // Dismissing the dialog — the stop remains.
  const dialogMessage = await routes.attemptRemoveFirstStopAndDismiss();
  expect(dialogMessage).toBe('Remove Italija from the route?');
  expect(await routes.getStopCountInExpandedCard()).toBe(1);

  // Confirming the dialog — the stop is removed.
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

  // Create a fresh route (we don't touch existing data) and check that it's new — scheduled.
  // See the note in RT-11: the list sorts only by date, so we need a unique note + search to
  // reliably open EXACTLY this newly-created route.
  const today = todayLocalIso();
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
  await routes.expectNoCancelButtonOnAnyVisibleRoute();

  await routes.goto();
  await routes.clearDateFilter();
  await routes.filterByStatus('completed');
  await routes.expectNoCancelButtonOnAnyVisibleRoute();
});

test('WEB-RT-18: A scheduled route with a started stop is rejected by the server', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = todayLocalIso();
  // The route list sorts ONLY by route_date (no tiebreaker on created_at) — with many
  // routes on the same day (a shared database, hundreds of routes for "today"), the "first"
  // card isn't reliably our newly-created one. A unique note + search guarantee we open
  // EXACTLY it (same pattern as RT-19/20/21/12/16).
  const noteTag = `QA-RT-18-${Date.now()}`;

  // Create a route and add a stop to it (the route stays "scheduled" — a route's status
  // doesn't change automatically just by adding a stop).
  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  // Wait for the list to ACTUALLY refresh with the new route before clicking the "first"
  // one — otherwise we might catch the old route that was first before the refresh.
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');

  // Directly via the database, mark that stop as started (only the mobile app normally does
  // this). By noteTag, not "latest scheduled" — another route for the same driver/day may
  // have been inserted before this one.
  const routeId = await getRouteIdByNotes(noteTag);
  if (!routeId) throw new Error(`Unable to find route with noteTag: ${noteTag}`);
  await markFirstStopAsStarted(routeId);

  // The route is still "scheduled" in the UI (the Cancel route button still exists), but the
  // server rejects the cancellation request itself.
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
  const today = todayLocalIso();
  // Several tests in the same run create routes for the same day, and the list isn't
  // reliably sorted by creation time for that case — a unique note + search guarantee we
  // open EXACTLY that route instead of relying on the "first" card's position.
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
  const today = todayLocalIso();
  const noteTag = `QA-RT-20-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');

  // By noteTag, not "latest scheduled" — another route for the same driver/day may have
  // been inserted before this one.
  const routeId = await getRouteIdByNotes(noteTag);
  if (!routeId) throw new Error(`Unable to find route with noteTag: ${noteTag}`);
  // The UI has no way to set a route to "in_progress" (only the mobile app does that) — done
  // directly via the database, with a reset back to "scheduled" at the end so we don't leave
  // dirty data for other tests.
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
  const today = todayLocalIso();
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

  // Invalid input (an empty field) is rejected — the order doesn't change.
  await routes.setStopOrder('Italija', '');
  await routes.expectSequenceInvalid();
  expect(await routes.getStopClientNamesInOrder()).toEqual(['Italija', 'Milano Coffee']);

  // Valid input (a number higher than the other stop's current order) moves "Italija" to
  // second place.
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
  // Dynamically derived from the data (sort() in the code) — not a hardcoded list; we check
  // that the options are valid route statuses and that there's more than one (the mixed data
  // in this shared QA environment is guaranteed to contain at least
  // scheduled+cancelled+completed).
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
  const today = todayLocalIso();
  const noteTag = `QA-RT-12-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();
  await routes.addStopToExpandedRoute('Italija', 'Italija Machine');
  await routes.addStopToExpandedRoute('Milano Coffee', 'Milano Coffee Machine');

  // We check the href attribute itself (not real navigation) — Google, in headless
  // Chromium, often intercepts the first visit to its site with an EU consent-wall redirect
  // (consent.google.com), which changes the visible URL and has nothing to do with whether
  // OUR app generated a correct link.
  const href = await routes
    .expandedRouteCard()
    .getByRole('link', { name: 'Open in Google Maps' })
    .getAttribute('href');

  expect(href).toContain('https://www.google.com/maps/dir/');
  expect(href).toContain('api=1');
  expect(href).toContain('travelmode=driving');
  expect(href).toMatch(/origin=[\d.]+%2C[\d.]+|origin=[\d.]+,[\d.]+/);

  // The earlier test only checked the origin/api/travelmode format — never that
  // origin/destination actually match the added stops' coordinates. The link would still
  // "look correct" (every check above would pass) even if the app mixed up/mismapped the
  // stops. buildGoogleMapsDirectionsUrl() sorts stops by sequence_number — the first one
  // added (Italija) is the origin, the last one (Milano Coffee) is the destination (see
  // route-map-preview.tsx); we compare directly against the clients' real coordinates from
  // the database.
  const supabase = supabaseAdmin();
  const { data: clients, error } = await supabase
    .from('clients')
    .select('name, latitude, longitude')
    .in('name', ['Italija', 'Milano Coffee']);
  if (error) throw new Error(`Unable to read client coordinates: ${error.message}`);
  const italija = clients!.find((c) => c.name === 'Italija');
  const milanoCoffee = clients!.find((c) => c.name === 'Milano Coffee');
  if (!italija || !milanoCoffee) throw new Error('Missing fixture client Italija or Milano Coffee.');

  const url = new URL(href!);
  const [originLat, originLng] = url.searchParams.get('origin')!.split(',').map(Number);
  const [destLat, destLng] = url.searchParams.get('destination')!.split(',').map(Number);

  expect(originLat).toBeCloseTo(italija.latitude!, 3);
  expect(originLng).toBeCloseTo(italija.longitude!, 3);
  expect(destLat).toBeCloseTo(milanoCoffee.latitude!, 3);
  expect(destLng).toBeCloseTo(milanoCoffee.longitude!, 3);
});

test('WEB-RT-16: Dismissing the cancel dialog changes nothing', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const routes = new RoutesPage(page);
  const today = todayLocalIso();
  const noteTag = `QA-RT-16-${Date.now()}`;

  await routes.goto();
  const before = await routes.getTotalRouteCount();
  await routes.createOneOffRoute(QA_DRIVER_ID, today, noteTag);
  await routes.expectRouteCountIncreasedBy(before, 1);
  await routes.searchRoutes(noteTag);
  await routes.expandFirstRoute();

  await routes.dismissCancelExpandedRoute();

  // The route remains scheduled — no "Route cancelled." message and no status change.
  await expect(routes.expandedRouteCard().getByText('Route cancelled.')).toHaveCount(0);
  await expect(routes.expandedRouteCard().getByText('scheduled', { exact: true })).toBeVisible();
});
