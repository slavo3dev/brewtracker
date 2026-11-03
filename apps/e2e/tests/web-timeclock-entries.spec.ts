import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TimeClockEntriesPage } from '../pages/TimeClockEntriesPage';
import {
  createPendingClockInEntry,
  resolveExistingPendingEntries,
  setTimeEntryReasonFields,
} from '../helpers/timeClockSeed';

// Deljeni vozač fiksture sa web-timeclock-review.spec.ts — rade jedan za drugim da izbegnu
// trku oko istog "jedan otvoren unos po vozaču" reda.
test.describe.configure({ mode: 'serial' });

test('WEB-TCENT-03: Prazno stanje kad nema nijednog time entry-ja', async () => {
  test.skip(
    true,
    'PRESKOČENO (bezbednosni razlog, ne propust): da bi se ovo testiralo, trebalo bi obrisati SVIH 800+ postojećih time entries iz deljene baze — stvarna/simulirana istorija mobilne aktivnosti drugih vozača na projektu. Potrebna izolovana test baza da bi se ovo bezbedno automatizovalo.',
  );
});

test('WEB-TCENT-01: Lista unosa prikazuje sva polja korektno', async ({ page }) => {
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
  await expect(card).toBeVisible();
  await entries.expectFieldsPopulated(card);
});

test('WEB-TCENT-02: Otvoren unos prikazuje "Still open" za clock out', async ({ page }) => {
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

test('WEB-TCENT-04: Reason kolona prolazi kroz ispravan lanac fallback-a', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;
  const login = new LoginPage(page);
  const entries = new TimeClockEntriesPage(page);

  await resolveExistingPendingEntries(driverId);

  // review_note ima najviši prioritet — postavljen zajedno sa ostalima, mora da se prikaže ON.
  const entryId1 = await createPendingClockInEntry(driverId, { leaveOpen: false });
  await setTimeEntryReasonFields(entryId1, {
    review_note: 'Review note tekst',
    review_reason: 'Review reason tekst',
    override_reason: 'Override reason tekst',
    auto_close_reason: 'Auto close reason tekst',
  });

  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);
  await entries.goto();
  expect(await entries.getReasonValue(entries.cardForDriverEmail(driverEmail))).toBe('Review note tekst');

  // Samo auto_close_reason postavljen (najniži prioritet u lancu) — i on treba da se prikaže
  // kad je jedini dostupan.
  const entryId2 = await createPendingClockInEntry(driverId, { leaveOpen: false });
  await setTimeEntryReasonFields(entryId2, { auto_close_reason: 'Samo auto close reason' });

  await entries.goto();
  expect(await entries.getReasonValue(entries.cardForDriverEmail(driverEmail))).toBe('Samo auto close reason');

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

test('WEB-TCENT-05: Entries stranica sprovodi admin auth', async ({ page }) => {
  const entries = new TimeClockEntriesPage(page);
  await entries.goto();
  await expect(page).toHaveURL(/\/login/);

  const login = new LoginPage(page);
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);
  await entries.goto();
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-TCENT-06: Kartica unosa prikazuje clock-in selfie kad postoji', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // Ista stvarna storage putanja korišćena u WEB-TCREV-04 (fajl u bucket-u nezavisan od
  // time_entries reda, može se ponovo potpisati za drugi unos).
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

test('WEB-TCENT-07: Fallback poruke za selfie na Entries stranici (nema selfie / ne može da se potpiše)', async ({ page }) => {
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
