import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { FleetMapPage } from '../pages/FleetMapPage';
import {
  ensureDriverIsLiveOnFleetMap,
  removeDriverFromFleetMap,
  getVisibleFleetDriverEmailsAs,
} from '../helpers/fleetSeed';

// All Fleet tests share the same "live" map (realtime data) — running them in parallel
// would let one test change markers while another is counting/clicking them.
test.describe.configure({ mode: 'serial' });

test('WEB-FLEET-02: Empty state when there are no active drivers', async ({ page }) => {
  // Must run BEFORE FLEET-01/03/04 (which make drivers "live" and leave them that way) —
  // serial mode guarantees the order within the file. We explicitly remove all 3 fixture
  // drivers for determinism, regardless of whether a previous run left one "live".
  await removeDriverFromFleetMap(process.env.QA_DRIVER_EMAIL!);
  await removeDriverFromFleetMap(process.env.QA_DRIVER_OTHER_REGION_EMAIL!);
  await removeDriverFromFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const fleet = new FleetMapPage(page);
  await fleet.goto();
  await fleet.expectEmptyState();
});

test('WEB-FLEET-01: Fleet map shows markers for recently active drivers', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const fleet = new FleetMapPage(page);
  await fleet.goto();
  // Baseline BEFORE our driver goes "live" — this test runs right after FLEET-02 (which
  // explicitly removes all 3 fixture drivers), so this is usually 0, but we don't assume
  // that value, we just record it.
  const before = await fleet.getMarkerCount();

  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_EMAIL!);
  await fleet.goto();

  // The earlier test only checked "at least one marker exists somewhere on the map" — that
  // would pass even if OUR driver never went "live" (some other, unrelated driver in the
  // shared database would be enough). Clicking markers/popups to identify SPECIFICALLY whose
  // marker it is is already documented (see WEB-FLEET-03 below) as unreliable to automate
  // when several markers are close together — so, same as WEB-FLEET-04, we check that the
  // marker count ACTUALLY increased after our specific action, instead of the absolute
  // "there's at least one".
  await expect.poll(() => fleet.getMarkerCount(), { timeout: 10000 }).toBeGreaterThan(before);
});

test('WEB-FLEET-03: Manager sees only their own region, CEO sees all regions', async () => {
  // QA_DRIVER_EMAIL is in the Italy region (same as the QA manager); QA_DRIVER_OTHER_REGION_EMAIL is in Florida.
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_EMAIL!);
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_OTHER_REGION_EMAIL!);

  // A direct query (the same RLS the UI uses), without clicking the map — more reliable
  // when several markers are close together.
  const managerEmails = await getVisibleFleetDriverEmailsAs(
    process.env.QA_MANAGER_EMAIL!,
    process.env.QA_MANAGER_PASSWORD!,
  );
  expect(managerEmails).toContain(process.env.QA_DRIVER_EMAIL);
  expect(managerEmails).not.toContain(process.env.QA_DRIVER_OTHER_REGION_EMAIL);

  const ceoEmails = await getVisibleFleetDriverEmailsAs(
    process.env.QA_CEO_EMAIL!,
    process.env.QA_CEO_PASSWORD!,
  );
  expect(ceoEmails).toContain(process.env.QA_DRIVER_EMAIL);
  expect(ceoEmails).toContain(process.env.QA_DRIVER_OTHER_REGION_EMAIL);
});

test('WEB-FLEET-04: Map auto-refreshes near-live on a new location ping', async ({ page }) => {
  const login = new LoginPage(page);
  const fleet = new FleetMapPage(page);

  // Guarantee the target driver is NOT currently visible, regardless of whether the test
  // was run recently before (makes the test repeatable, independent of the 10-minute
  // window).
  await removeDriverFromFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  // The CEO sees all regions, so we avoid region-related complications here.
  await login.goto();
  await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);
  await fleet.goto();
  const before = await fleet.getMarkerCount();
  // Wait for the page's realtime subscription to actually be established before we send the
  // ping.
  await page.waitForTimeout(3000);

  // The new "ping" is sent WHILE the page is already open, without any page.reload().
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  await expect
    .poll(() => fleet.getMarkerCount(), { timeout: 15000 })
    .toBeGreaterThan(before);
});

test('WEB-FLEET-05: Map falls back to 60s polling when the realtime channel is unavailable', async ({ page }) => {
  test.setTimeout(90000); // we need to wait for the FLEET_REFRESH_INTERVAL_MS (60s) polling fallback

  const login = new LoginPage(page);
  const fleet = new FleetMapPage(page);

  await removeDriverFromFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  // Block the realtime websocket BEFORE navigating — simulates a channel failure. The
  // postgres_changes event for the new ping will never arrive over the channel, so the ONLY
  // way for the marker to appear is the periodic setInterval poll (FLEET_REFRESH_INTERVAL_MS
  // = 60s) in fleet-map.tsx.
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    ws.close({ code: 1006, reason: 'Simulated realtime failure' });
  });

  await login.goto();
  await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);
  await fleet.goto();
  const before = await fleet.getMarkerCount();

  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  // The marker does NOT appear immediately (the realtime channel is blocked) — we wait up
  // to ~70s for the polling fallback to take over.
  await expect
    .poll(() => fleet.getMarkerCount(), { timeout: 70000, intervals: [2000] })
    .toBeGreaterThan(before);
});

test('WEB-FLEET-07: Fleet page redirects non-admin accounts', async ({ page }) => {
  // The earlier test only checked an anonymous visit (duplicating WEB-AUTH-13), never an
  // actual attempt to log in as a driver — the difference matters because the
  // middleware-level redirect for a LOGGED-OUT user and requireAdmin()'s redirect for a
  // LOGGED-IN-but-wrong-role user are TWO different code branches. Now, same as
  // WEB-USR-14/WEB-TCREV-11/WEB-INVP-04, it actually logs in as a driver before accessing
  // the page — it still doesn't test "a logged-in admin without exactly THIS permission"
  // (that branch is unreachable as long as drivers/techs can't reach the web dashboard at
  // all, see WEB-AUTH-05), but at least it goes through login before the check, not just an
  // anonymous visit.
  await page.goto('/dashboard/fleet');
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);
  await page.goto('/dashboard/fleet');
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-FLEET-06: Empty state does not mount the map at all', async ({ page }) => {
  // Remove ALL drivers that previous tests in this serial chain may leave "live"
  // (FLEET-01/03 use QA_DRIVER_EMAIL and OTHER_REGION, FLEET-04 uses REFRESH_TEST).
  await removeDriverFromFleetMap(process.env.QA_DRIVER_EMAIL!);
  await removeDriverFromFleetMap(process.env.QA_DRIVER_OTHER_REGION_EMAIL!);
  await removeDriverFromFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const fleet = new FleetMapPage(page);
  await fleet.goto();
  await fleet.expectEmptyState();
  // The map (FleetMapLoader/Leaflet) mounts ONLY when locations.length > 0 — in the empty
  // state it doesn't exist in the DOM at all, not just "without markers".
  await fleet.expectMapNotMounted();
});

test('WEB-FLEET-08: Map loads client-side with a loading fallback', async ({ page }) => {
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_EMAIL!);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  // "commit" (not "load") — stops as soon as navigation starts, BEFORE the dynamic Leaflet
  // chunk is fetched, giving us a chance to catch the transient "Loading fleet map…"
  // fallback, which otherwise disappears too quickly on a fast connection.
  await page.goto('/dashboard/fleet', { waitUntil: 'commit' });
  await expect(page.getByText('Loading fleet map…')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
});
