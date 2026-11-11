import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TimeClockReviewPage } from '../pages/TimeClockReviewPage';
import {
  createPendingClockInEntry,
  resolveExistingPendingEntries,
  getReviewOutcome,
} from '../helpers/timeClockSeed';

test('WEB-TCREV-02: Empty state when there are no pending entries', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): would require resolving/deleting every pending time entry project-wide, not just one region — the review queue is currently NOT region-scoped (see the WEB-TCREV-01 defect), so "empty" means empty for the whole system. Needs an isolated test database.',
  );
});

test('WEB-TCREV-01: Review queue lists only review_status=pending entries for its own region', async ({ page }) => {
  // This used to be a known defect (a service-role client with no region filter — the
  // manager saw pending entries from ALL regions). Fixed on dev:
  // getTimeEntryReviewQueue()/getTimeEntries() now go through a region-scoped client
  // (requireReviewerContext()). Uses an ISOLATED driver (QA_DRIVER_OTHER_REGION_ID, not the
  // shared TRANSFERS driver below) and is deliberately kept outside the serial group below —
  // its failure must not block the other TCREV-* tests.

  // QA_MANAGER is in the Italy region; driver1@brewtracker.demo is in the Florida region —
  // deliberately a DIFFERENT region so we can check whether the queue is region-scoped.
  await resolveExistingPendingEntries(process.env.QA_DRIVER_OTHER_REGION_ID!);
  await createPendingClockInEntry(process.env.QA_DRIVER_OTHER_REGION_ID!);

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const review = new TimeClockReviewPage(page);
    await review.goto();

    // Expected (correct) result: a manager from the Italy region must NOT see a pending
    // clock-in from a driver in the Florida region.
    await review.expectDriverCardNotVisible(process.env.QA_DRIVER_OTHER_REGION_EMAIL!);
  } finally {
    // Don't leave "noise" in the shared review queue for subsequent tests, regardless of the
    // outcome.
    await resolveExistingPendingEntries(process.env.QA_DRIVER_OTHER_REGION_ID!);
  }
});

// The remaining tests share the SAME driver (QA_DRIVER_TRANSFERS_ID) and a shared review
// queue — they run one after another to avoid one test leaving "noise" that another
// misreads. Split into their own describe group (instead of a file-wide serial) so
// WEB-TCREV-01/02 (above, an isolated driver) aren't part of this chain.
test.describe(() => {
  test.describe.configure({ mode: 'serial' });

test('WEB-TCREV-03: Card shows the correct geofence distance and status', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  // The default QA warehouse (QA_WAREHOUSE_ID) has region "Global", which the RLS policy
  // ("CEO and managers can read warehouses") doesn't recognize as a special case — a manager
  // sees ONLY warehouses from their own region. QA_MANAGER is in the "Italy" region, so we
  // use the Genova warehouse (region "Italy") so the warehouse/geofence fields are actually
  // visible.
  const warehouseId = process.env.QA_GENOVA_TEST_WAREHOUSE_ID!;
  const warehouseLat = 44.4056;
  const warehouseLng = 8.9463;

  await resolveExistingPendingEntries(driverId);
  await createPendingClockInEntry(driverId, { geofence: 'inside', leaveOpen: true, warehouseId, warehouseLat, warehouseLng });
  await createPendingClockInEntry(driverId, { geofence: 'outside', leaveOpen: false, warehouseId, warehouseLat, warehouseLng });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const insideCard = review.cardForDriverMatching(driverEmail, 'Inside geofence');
  await review.expectGeofenceStatus(insideCard, 'Inside geofence');
  await review.expectOverrideStatus(insideCard, 'No');

  const outsideCard = review.cardForDriverMatching(driverEmail, /Outside by/);
  await review.expectGeofenceStatus(outsideCard, /Outside by/);
  await review.expectOverrideStatus(outsideCard, 'No');
});

// Approve/Flag/Reject trigger revalidatePath() as part of the same server action exchange —
// the queue on the page is replaced (the card disappears) almost instantly, before
// Playwright manages to catch the transient "Clock-in X." message. So the outcome is checked
// directly in the database (reliable, race-free), while the UI only confirms the final,
// stable result — that the card disappears from the pending queue.

test('WEB-TCREV-07: Approve action sets status and reviewer metadata', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  const entryId = await createPendingClockInEntry(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.approve(card, 'QA approve note');

  await expect(async () => {
    const outcome = await getReviewOutcome(entryId);
    expect(outcome.review_status).toBe('approved');
    expect(outcome.reviewed_by).toBeTruthy();
    expect(outcome.reviewed_at).toBeTruthy();
    expect(outcome.review_note).toBe('QA approve note');
  }).toPass({ timeout: 10000 });

  // An approved entry is no longer pending, so it disappears from the queue after a refresh.
  await review.goto();
  await review.expectDriverCardNotVisible(driverEmail);
});

test('WEB-TCREV-08: Flag action accepts a reason and updates status', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  const entryId = await createPendingClockInEntry(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.flag(card, 'QA flag reason');

  await expect(async () => {
    const outcome = await getReviewOutcome(entryId);
    expect(outcome.review_status).toBe('flagged');
    expect(outcome.review_note).toBe('QA flag reason');
  }).toPass({ timeout: 10000 });

  await review.goto();
  await review.expectDriverCardNotVisible(driverEmail);
});

test('WEB-TCREV-09: Reject action accepts a reason and updates status', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  const entryId = await createPendingClockInEntry(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.reject(card, 'QA reject reason');

  await expect(async () => {
    const outcome = await getReviewOutcome(entryId);
    expect(outcome.review_status).toBe('rejected');
    expect(outcome.review_note).toBe('QA reject reason');
  }).toPass({ timeout: 10000 });

  await review.goto();
  await review.expectDriverCardNotVisible(driverEmail);
});

test('WEB-TCREV-11: Non-reviewer role is blocked from the review queue', async ({ page }) => {
  // canReviewClockIns() allows every active admin (manager/CEO) — in this code there's no
  // "admin without this permission". Driver/tech accounts can't log into the web dashboard
  // at all (see WEB-AUTH-05 — they're sent back to /login before they ever reach the review
  // page), so the review page's own redirect("/dashboard") for non-reviewer admins is
  // currently unreachable code; the final, user-visible outcome is still identical to the
  // test case's intent — a driver can't see the review queue.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-TCREV-11b: Logged-out user is redirected to /login', async ({ page }) => {
  const review = new TimeClockReviewPage(page);
  await review.goto();
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-TCREV-12: A clock-in outside the geofence is visible and actionable to the reviewer', async ({ page }) => {
  // PR #85: a clock-in outside the geofence is NOT blocked, it's only recorded — the entry
  // appears in the queue as pending with the status "Outside by N m" and the manager can
  // still resolve it.
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // See the note in WEB-TCREV-03: the default warehouse (region "Global") isn't visible to
  // the manager (region "Italy") under RLS — use the Genova warehouse so the
  // warehouse/geofence fields work.
  const entryId = await createPendingClockInEntry(driverId, {
    geofence: 'outside',
    warehouseId: process.env.QA_GENOVA_TEST_WAREHOUSE_ID!,
    warehouseLat: 44.4056,
    warehouseLng: 8.9463,
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverMatching(driverEmail, /Outside by/);
  await review.expectGeofenceStatus(card, /Outside by/);

  await review.approve(card);

  await expect(async () => {
    const outcome = await getReviewOutcome(entryId);
    expect(outcome.review_status).toBe('approved');
  }).toPass({ timeout: 10000 });
});

test('WEB-TCREV-04: Selfie is shown when a valid signable URL exists', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // A real storage path taken from an existing entry from mobile usage (the same path can be
  // re-signed for a new test entry — the file in the bucket is independent of the
  // time_entries row).
  await createPendingClockInEntry(driverId, {
    clockInSelfieUrl: `${process.env.QA_DRIVER_TRANSFERS_ID}/qa-fixture-entry/clock-in-qa-fixture.jpg`,
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.expectSelfieImageVisible(card);
});

test('WEB-TCREV-05: Loading error message when the selfie path exists but signing fails', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // A simulation from the regression table: a path that does NOT exist in the storage
  // bucket — the signing call for it always fails, same as manual testing.
  await createPendingClockInEntry(driverId, {
    clockInSelfieUrl: 'nonexistent-driver-id/nonexistent-entry-id/clock-in-does-not-exist.jpg',
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.expectSelfieLoadError(card);
});

test('WEB-TCREV-06: "No clock-in selfie" message when no selfie was submitted', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  await createPendingClockInEntry(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.expectNoSelfieMessage(card);
});

test('WEB-TCREV-10: A resolved entry disappears from the pending queue after refresh', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  const entryId = await createPendingClockInEntry(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.expectDriverCardVisible(driverEmail);
  await review.approve(card);

  // Wait for the server action to ACTUALLY finish (confirmed in the database) before
  // reloading — otherwise goto() can arrive before review_status actually changes.
  await expect(async () => {
    const outcome = await getReviewOutcome(entryId);
    expect(outcome.review_status).toBe('approved');
  }).toPass({ timeout: 10000 });

  // Refresh the queue and check the card has actually been removed (is no longer pending).
  await review.goto();
  await review.expectDriverCardNotVisible(driverEmail);
});
});
