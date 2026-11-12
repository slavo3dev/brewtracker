import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TimeClockSettingsPage } from '../pages/TimeClockSettingsPage';
import { TimeClockReviewPage } from '../pages/TimeClockReviewPage';
import {
  createOpenEntryWithPastShiftEnd,
  createOpenEntryWithFutureShiftEnd,
  createOpenEntryWithoutShiftEnd,
  getTimeEntry,
  resolveExistingPendingEntries,
} from '../helpers/timeClockSeed';

// All tests share the same dedicated driver (QA_DRIVER_TCSET_ID) and the "one open entry per
// driver" constraint in the database — BUT every createOpenEntryWith*() function itself
// closes any existing open entry before creating a new one (idempotent, self-healing), so
// the tests don't depend on each other to be correct — they just must not run
// SIMULTANEOUSLY (already guaranteed by --workers=1). DELIBERATELY without
// test.describe.configure({mode:'serial'}) — that mode would skip every other test in the
// file if any one failed (e.g. a transient network hiccup), which isn't needed or wanted
// here.

test('WEB-TCSET-01: "Run auto-close check" closes open entries past the end of the shift', async ({ page }) => {
  // DELIBERATELY a different driver than web-timeclock-review.spec.ts
  // (QA_DRIVER_TRANSFERS_ID) — those two files run in parallel (different workers) and
  // previously collided on the SAME shared time_entries row, leaving duplicate "pending"
  // cards that would break TCREV-03's locators (a strict mode violation).
  const driverId = process.env.QA_DRIVER_TCSET_ID!;
  const entryId = await createOpenEntryWithPastShiftEnd(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const settings = new TimeClockSettingsPage(page);
  await settings.goto();
  await settings.runAutoCloseCheck();

  // The message is generic (at least 1 entry), not exactly "1" — this action processes ALL
  // eligible entries in the system, not just our seeded one, so the exact number could vary
  // if another test in parallel also leaves an eligible entry.
  await settings.expectResultMessage(/Auto-close check completed\. \d+ entr(y was|ies were) flagged for review\./);

  const entry = await getTimeEntry(entryId);
  expect(entry.status).toBe('flagged');
  expect(entry.review_status).toBe('pending');
  expect(entry.review_reason).toBe('Forgotten clock-out auto-closed after shift end.');
  expect(entry.auto_close_reason).toBe('Shift ended without driver clock-out.');
});

test('WEB-TCSET-02: Auto-close does not touch entries whose shift has not ended yet', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TCSET_ID!;
  const entryId = await createOpenEntryWithFutureShiftEnd(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const settings = new TimeClockSettingsPage(page);
  await settings.goto();
  await settings.runAutoCloseCheck();

  // A global check (either "No eligible..." or "N entries were flagged" — depends on whether
  // OTHER eligible entries also exist in the system at that moment) — the important check is
  // that OUR SPECIFIC entry (a future shift_end_at) wasn't touched.
  await settings.expectResultMessage(
    /Auto-close check completed\. (No eligible open entries were found\.|\d+ entr(y was|ies were) flagged for review\.)/,
  );

  const entry = await getTimeEntry(entryId);
  expect(entry.status).toBe('open');
  expect(entry.review_status).toBe('pending');
});

test('WEB-TCSET-03: An auto-closed entry appears in the Review Queue', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TCSET_ID!;
  const driverEmail = process.env.QA_DRIVER_TCSET_EMAIL!;
  // This driver has accumulated dozens of old pending entries over the course of the
  // session — without this, the locator for "this driver's card" matches more than one
  // (a strict mode violation).
  await resolveExistingPendingEntries(driverId);
  await createOpenEntryWithPastShiftEnd(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const settings = new TimeClockSettingsPage(page);
  await settings.goto();
  await settings.runAutoCloseCheck();
  await settings.expectResultMessage(/Auto-close check completed\. \d+ entr(y was|ies were) flagged for review\./);

  const review = new TimeClockReviewPage(page);
  await review.goto();
  await review.expectDriverCardVisible(driverEmail);
});

test('WEB-TCSET-04: Settings page has no selfie-waiver control (documented gap)', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const settings = new TimeClockSettingsPage(page);
  await settings.goto();

  await expect(page.getByRole('heading', { name: 'Forgotten clock-out handling' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Multi-stop days' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Outside geofence override' })).toBeVisible();

  // The only button in the main content is "Run auto-close check" (the header "Sign out"
  // button doesn't count) — there's no selfie-waiver control at all, just informational
  // sections.
  await expect(page.locator('main').getByRole('button')).toHaveCount(1);
  await expect(page.getByText(/waive|waiver|selfie/i)).toHaveCount(0);
});

test('WEB-TCSET-05: Open entries with no shift_end_at are never auto-closed', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TCSET_ID!;
  const entryId = await createOpenEntryWithoutShiftEnd(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const settings = new TimeClockSettingsPage(page);
  await settings.goto();
  await settings.runAutoCloseCheck();
  await settings.expectResultMessage(
    /Auto-close check completed\. (No eligible open entries were found\.|\d+ entr(y was|ies were) flagged for review\.)/,
  );

  const entry = await getTimeEntry(entryId);
  expect(entry.status).toBe('open');
  expect(entry.review_status).toBe('pending');
});
