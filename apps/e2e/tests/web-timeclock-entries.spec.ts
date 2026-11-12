import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TimeClockEntriesPage } from '../pages/TimeClockEntriesPage';
import {
  createPendingClockInEntry,
  resolveExistingPendingEntries,
  setTimeEntryReasonFields,
} from '../helpers/timeClockSeed';
import { supabaseAdmin } from '../helpers/supabaseAdmin';

// A driver fixture shared with web-timeclock-review.spec.ts — they run one after another to
// avoid a race on the same "one open entry per driver" row.
test.describe.configure({ mode: 'serial' });

test('WEB-TCENT-03: Empty state when there are no time entries', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): testing this would require deleting all 800+ existing time entries in the shared database — real/simulated mobile activity history from other drivers on the project. Needs an isolated test database to automate safely.',
  );
});

test('WEB-TCENT-01: Entry list shows all fields correctly', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // The default QA warehouse (QA_WAREHOUSE_ID) has region "Global", which the RLS policy on
  // the "warehouses" table doesn't recognize as a special case (see the note in
  // WEB-TCREV-03/WEB-SV-07) — a manager in the Italy region would get a BLANK join for it, so
  // "Warehouse" would legitimately show "—" regardless of whether the column works correctly
  // at all. The Genova warehouse (region Italy) is ACTUALLY visible to the manager, so the
  // test can confirm the real warehouse name is rendered.
  await createPendingClockInEntry(driverId, { leaveOpen: true, warehouseId: process.env.QA_GENOVA_TEST_WAREHOUSE_ID! });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const entries = new TimeClockEntriesPage(page);
  await entries.goto();

  const card = entries.cardForDriverEmail(driverEmail);
  await expect(card).toBeVisible();
  // expectFieldsPopulated() only checks that no field is BLANK — that would pass even if
  // Warehouse/Review/Auto closed/Reason showed a WRONG (but non-blank) value. This fixture
  // (createPendingClockInEntry with leaveOpen:true, no reason fields at all) has FULLY
  // deterministic values for those 4 fields — we check them specifically, not just "isn't
  // blank".
  await entries.expectFieldsPopulated(card);

  const supabase = supabaseAdmin();
  const { data: warehouse, error: warehouseError } = await supabase
    .from('warehouses')
    .select('name')
    .eq('id', process.env.QA_GENOVA_TEST_WAREHOUSE_ID!)
    .single();
  if (warehouseError || !warehouse) {
    throw new Error(`Unable to read warehouse name: ${warehouseError?.message}`);
  }

  expect(await entries.getFieldText(card, 'Warehouse')).toBe(warehouse.name);
  // <dd class="capitalize"> — innerText() reflects the CSS text-transform, so the rendered
  // text is "Pending" (capital P), even though the raw DB value is "pending".
  expect(await entries.getFieldText(card, 'Review')).toBe('Pending');
  // A mobile clock-in never sets auto_closed_at, and resolveExistingPendingEntries/
  // createPendingClockInEntry don't touch it here — "No" is the only possible value for THIS
  // fixture.
  expect(await entries.getFieldText(card, 'Auto closed')).toBe('No');
  // None of the 4 reason fields are set for this fixture — falls back to "—" (the same
  // priority chain WEB-TCENT-04 tests explicitly, step by step).
  expect(await entries.getFieldText(card, 'Reason')).toBe('—');
});

test('WEB-TCENT-02: Open entry shows "Still open" for clock out', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  await createPendingClockInEntry(driverId, { leaveOpen: true });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const entries = new TimeClockEntriesPage(page);
  await entries.goto();

  const card = entries.cardForDriverEmail(driverEmail);
  const clockOut = await entries.getClockOutValue(card);
  expect(clockOut).toBe('Still open');
});

test('WEB-TCENT-04: Reason column goes through the correct fallback chain', async ({ page }) => {
  // The page has no pagination and renders the ENTIRE entry history (800+ in the shared
  // database, growing across sessions) — this test calls entries.goto() THREE times in a
  // row, so even a slightly slower load (under load) easily exceeds the default 30s budget
  // for the whole test. Confirmed by a screenshot of a real failure: the navigation itself
  // timed out, not some locator/race inside the page.
  test.setTimeout(90000);

  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;
  const login = new LoginPage(page);
  const entries = new TimeClockEntriesPage(page);

  await resolveExistingPendingEntries(driverId);

  // review_note has the highest priority — set together with the others, IT must be the one
  // shown.
  const entryId1 = await createPendingClockInEntry(driverId, { leaveOpen: false });
  await setTimeEntryReasonFields(entryId1, {
    review_note: 'Review note text',
    review_reason: 'Review reason text',
    override_reason: 'Override reason text',
    auto_close_reason: 'Auto close reason text',
  });

  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);
  await entries.goto();
  expect(await entries.getReasonValue(entries.cardForDriverEmail(driverEmail))).toBe('Review note text');

  // Only auto_close_reason is set (the lowest priority in the chain) — it should still be
  // shown when it's the only one available.
  const entryId2 = await createPendingClockInEntry(driverId, { leaveOpen: false });
  await setTimeEntryReasonFields(entryId2, { auto_close_reason: 'Only auto close reason' });

  await entries.goto();
  expect(await entries.getReasonValue(entries.cardForDriverEmail(driverEmail))).toBe('Only auto close reason');

  // Nijedno od 4 polja nije postavljeno — fallback na "—".
  const entryId3 = await createPendingClockInEntry(driverId, { leaveOpen: false });
  await setTimeEntryReasonFields(entryId3, {
    review_note: null,
    review_reason: null,
    override_reason: null,
    auto_close_reason: null,
  });

  await entries.goto();
  expect(await entries.getReasonValue(entries.cardForDriverEmail(driverEmail))).toBe('—');
});

test('WEB-TCENT-05: Entries page enforces admin auth', async ({ page }) => {
  const entries = new TimeClockEntriesPage(page);
  await entries.goto();
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);
  await entries.goto();
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-TCENT-06: Entry card shows the clock-in selfie when one exists', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // The same real storage path used in WEB-TCREV-04 (the file in the bucket is independent
  // of the time_entries row, it can be re-signed for a different entry).
  await createPendingClockInEntry(driverId, {
    clockInSelfieUrl: `${process.env.QA_DRIVER_TRANSFERS_ID}/qa-fixture-entry/clock-in-qa-fixture.jpg`,
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const entries = new TimeClockEntriesPage(page);
  await entries.goto();

  const card = entries.cardForDriverEmail(driverEmail);
  await entries.expectSelfieImageVisible(card);
});

test('WEB-TCENT-07: Fallback messages for the selfie on the Entries page (no selfie / cannot be signed)', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;
  const login = new LoginPage(page);
  const entries = new TimeClockEntriesPage(page);

  await resolveExistingPendingEntries(driverId);
  await createPendingClockInEntry(driverId, { leaveOpen: false });

  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);
  await entries.goto();
  await entries.expectNoSelfieMessage(entries.cardForDriverEmail(driverEmail));

  await createPendingClockInEntry(driverId, {
    leaveOpen: false,
    clockInSelfieUrl: 'nonexistent-driver-id/nonexistent-entry-id/clock-in-does-not-exist.jpg',
  });

  await entries.goto();
  await entries.expectSelfieLoadError(entries.cardForDriverEmail(driverEmail));
});
