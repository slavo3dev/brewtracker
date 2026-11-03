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

// Svi testovi dele istog dedikovanog vozača (QA_DRIVER_TCSET_ID) i "jedan otvoren unos po
// vozaču" ogranicenje u bazi — ALI svaka createOpenEntryWith*() funkcija SAMA zatvara
// eventualni postojeći otvoren unos pre nego što napravi novi (idempotentno, samoisceljujuće),
// pa testovi ne zavise jedan od drugog da bi bili ispravni — samo ne smeju da rade ISTOVREMENO
// (već zagarantovano sa --workers=1). NAMERNO bez test.describe.configure({mode:'serial'}) —
// taj mod bi poskipovao sve ostale testove u fajlu ako bilo koji padne (npr. prolazni mrežni
// hiccup), što ovde nije potrebno niti poželjno.

test('WEB-TCSET-01: "Run auto-close check" closes open entries past the end of the shift', async ({ page }) => {
  // NAMERNO drugi vozač od web-timeclock-review.spec.ts (QA_DRIVER_TRANSFERS_ID) —
  // ta dva fajla rade paralelno (razliciti workeri) i ranije su se sudarala na ISTOM
  // deljenom time_entries redu, ostavljajući duplirane "pending" kartice koje bi
  // pokvarile TCREV-03 locator-e (strict mode violation).
  const driverId = process.env.QA_DRIVER_TCSET_ID!;
  const entryId = await createOpenEntryWithPastShiftEnd(driverId);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const settings = new TimeClockSettingsPage(page);
  await settings.goto();
  await settings.runAutoCloseCheck();

  // Poruka je generička (bar 1 unos), ne tačno "1" — ovaj akcija obrađuje SVE kvalifikovane
  // unose u sistemu, ne samo naš seedovan, pa bi tačan broj mogao da varira ako paralelno
  // drugi test takođe ostavi kvalifikovan unos.
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

  // Globalna provera (bilo "No eligible..." ili "N entries were flagged" — zavisi od toga
  // da li u sistemu postoje I DRUGI kvalifikovani unosi u tom trenutku) — bitna provera je
  // da NAŠ KONKRETAN unos (budući shift_end_at) nije dirnut.
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
  // Ovaj vozač je kroz sesiju nagomilao desetine starih pending unosa — bez ovoga,
  // locator za "kartica ovog vozača" pogađa više njih (strict mode violation).
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

  // Jedino dugme u glavnom sadržaju je "Run auto-close check" (header "Sign out" dugme se ne
  // računa) — nema nikakve selfie-waiver kontrole, samo informativne sekcije.
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
