import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { ServiceVisitsPage } from '../pages/ServiceVisitsPage';
import { createServiceVisitStop, deleteServiceVisitRoute } from '../helpers/serviceVisitSeed';

const QA_DRIVER_ID = process.env.QA_DRIVER_ID!;
const CLIENT_NAME = 'Genova Test Client';
const DRIVER_NAME = 'QA Driver Fixture';

// Tests share the same client+driver pair (the only one guaranteed clean of existing
// history) for their fixtures — running in parallel would temporarily create multiple cards
// at once and break locating "exactly one" card.
test.describe.configure({ mode: 'serial' });

test('WEB-SV-05: Empty state when there are no service visits', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): testing this would require deleting all 100+ existing service-visit records (arrived_at set) across the whole shared database, not just for one driver/client — this is real/simulated activity from other project users. Needs an isolated test database to automate safely.',
  );
});

test('WEB-SV-01: List shows only stops with a recorded arrival', async ({ page }) => {
  const arrivedRoute = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(),
    completedAt: new Date(),
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();

    // "Genova Test Client" has no other stops in this feed (an empty intersection was
    // verified before writing the test) — exactly one card is expected, for the
    // just-created (arrival recorded) stop.
    await expect(visits.visitCard(CLIENT_NAME, DRIVER_NAME)).toHaveCount(1);
  } finally {
    await deleteServiceVisitRoute(arrivedRoute.routeId);
  }
});

test('WEB-SV-02: "Time on location" correctly computes duration for a completed visit', async ({ page }) => {
  const arrivedAt = new Date(Date.now() - (1 * 3600 + 5 * 60 + 20) * 1000); // -1h 5m 20s
  const completedAt = new Date();

  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt,
    completedAt,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();

    await visits.expectStatus(CLIENT_NAME, DRIVER_NAME, 'Completed');
    const duration = await visits.getTimeOnLocation(CLIENT_NAME, DRIVER_NAME);
    expect(duration).toBe('1h 5m 20s');
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});

test('WEB-SV-03: A visit in progress shows "In progress" instead of a fixed duration', async ({ page }) => {
  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(Date.now() - 10 * 60 * 1000),
    completedAt: null,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();

    await visits.expectStatus(CLIENT_NAME, DRIVER_NAME, 'In Progress');
    const duration = await visits.getTimeOnLocation(CLIENT_NAME, DRIVER_NAME);
    expect(duration).toBe('In progress');
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});

test('WEB-SV-04: Metrics (Recent/In Progress/Completed) match the list', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const visits = new ServiceVisitsPage(page);
  await visits.goto();

  const counts = await visits.getStatusCounts();
  const totalCards = await visits.getVisitCount();
  const inProgressCards = await page
    .locator('article')
    .filter({ has: page.locator('span.shrink-0.rounded-full.px-3.py-1', { hasText: 'In Progress' }) })
    .count();
  const completedCards = await page
    .locator('article')
    .filter({ has: page.locator('span.shrink-0.rounded-full.px-3.py-1', { hasText: 'Completed' }) })
    .count();

  expect(counts.recent).toBe(totalCards);
  expect(counts.inProgress).toBe(inProgressCards);
  expect(counts.completed).toBe(completedCards);
});

test('WEB-SV-06: List does not expose photo/signature/drink-count details (documented gap)', async ({ page }) => {
  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(),
    completedAt: new Date(),
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();
    await expect(visits.visitCard(CLIENT_NAME, DRIVER_NAME)).toBeVisible();

    // ServiceVisitCard only displays Driver/Arrived/Completed/Time on location — there are
    // no images, signature, or drink-count UI anywhere on this list page.
    await expect(page.locator('article img')).toHaveCount(0);
    await expect(page.getByText('Signature', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Drink Count', { exact: false })).toHaveCount(0);
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});

test('WEB-SV-07: A visit is not shown to the manager when the route\'s warehouse has no region set', async ({ page }) => {
  // The regression table (note next to WEB-TT-10) explicitly confirms this as EXPECTED
  // behavior, not a defect: "The other 8 are hidden by region rules because the route's
  // warehouse is outside Italy (...QA Test Warehouse - MOB-CLK-02 with region 'N/A'...)."
  // The "Managers can read routes in their region" RLS policy compares warehouses.region =
  // current_user_region() — a warehouse with no region set (NULL) is treated as "outside
  // the region" (NULL = 'Italy' is never true), so the manager doesn't see that route/stop
  // at all.
  const NO_REGION_WAREHOUSE_ID = process.env.QA_NO_REGION_WAREHOUSE_ID!; // "QA Test Warehouse", region: null
  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(),
    completedAt: new Date(),
    warehouseId: NO_REGION_WAREHOUSE_ID,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();
    await expect(visits.visitCard(CLIENT_NAME, DRIVER_NAME)).toHaveCount(0);
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});
