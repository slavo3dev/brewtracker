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
  // Bio poznat defekt (service-role klijent bez region filtera — manager je vidio pending
  // unose SVIH regiona). Popravljeno na dev: getTimeEntryReviewQueue()/getTimeEntries() sad
  // idu kroz region-scoped klijenta (requireReviewerContext()). Koristi IZOLOVAN vozač
  // (QA_DRIVER_OTHER_REGION_ID, ne deljeni TRANSFERS vozač ispod) i namerno je van serial
  // grupe ispod — njegov pad ne sme da blokira ostale TCREV-* testove.

  // QA_MANAGER je u regionu Italy; driver1@brewtracker.demo je u regionu Florida —
  // namerno DRUGI region da bismo proverili da li je queue region-scoped.
  await resolveExistingPendingEntries(process.env.QA_DRIVER_OTHER_REGION_ID!);
  await createPendingClockInEntry(process.env.QA_DRIVER_OTHER_REGION_ID!);

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const review = new TimeClockReviewPage(page);
    await review.goto();

    // Očekivani (ispravan) rezultat: manager iz regiona Italy NE sme da vidi pending
    // clock-in vozača iz regiona Florida.
    await review.expectDriverCardNotVisible(process.env.QA_DRIVER_OTHER_REGION_EMAIL!);
  } finally {
    // Ne ostavljaj "šum" u deljenom review queue-u za sledeće testove, bez obzira na ishod.
    await resolveExistingPendingEntries(process.env.QA_DRIVER_OTHER_REGION_ID!);
  }
});

// Preostali testovi dele ISTOG vozača (QA_DRIVER_TRANSFERS_ID) i deljeni review queue — rade
// jedan za drugim da izbegnu da jedan test ostavi "šum" koji drugi pogrešno pročita. Izdvojeni
// u sopstvenu describe grupu (umesto file-wide serial) da WEB-TCREV-01/02 (gore, izolovan
// vozač) ne budu deo ovog lanca.
test.describe(() => {
  test.describe.configure({ mode: 'serial' });

test('WEB-TCREV-03: Card shows the correct geofence distance and status', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  // Default QA magacin (QA_WAREHOUSE_ID) ima region "Global", koji RLS politika
  // ("CEO and managers can read warehouses") ne prepoznaje kao poseban slučaj — manager
  // vidi SAMO magacine iz svog regiona. QA_MANAGER je u "Italy" regionu, pa koristimo
  // Genova magacin (region "Italy") da warehouse/geofence polja stvarno budu vidljiva.
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

// Approve/Flag/Reject pokreću revalidatePath() kao deo iste server action razmene — queue
// se na stranici zamenjuje (kartica nestaje) gotovo istog trenutka, pre nego što Playwright
// stigne da uhvati tranzijentnu "Clock-in X." poruku. Zato se ishod proverava direktno u
// bazi (pouzdano, bez trke), a kroz UI se potvrđuje samo krajnji, stabilan rezultat —
// da kartica nestaje iz pending queue-a.

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

  // Odobren unos više nije pending, pa nestaje iz queue-a nakon osvežavanja.
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
  // canReviewClockIns() dozvoljava svakom aktivnom admin-u (manager/CEO) — u ovom kodu ne
  // postoji "admin bez te dozvole". Driver/tech nalozi se uopšte ne mogu ulogovati na web
  // dashboard (vidi WEB-AUTH-05 — vraćaju se na /login pre nego što ikada stignu do
  // review stranice), pa je review-page-ov sopstveni redirect("/dashboard") za
  // ne-reviewer admine trenutno nedostižan kod; krajnji, korisniku vidljiv ishod je ipak
  // identičan nameri test slučaja — driver ne može da vidi review queue.
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
  // PR #85: clock-in van geofence-a NIJE blokiran, samo se beleži — entry se pojavljuje
  // u queue-u kao pending sa statusom "Outside by N m" i manager i dalje može da ga reši.
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // Vidi napomenu u WEB-TCREV-03: default magacin (region "Global") nije vidljiv manageru
  // (region "Italy") pod RLS-om — koristi Genova magacin da warehouse/geofence poljaradе.
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
  // Stvarna storage putanja preuzeta sa postojećeg unosa iz mobilne upotrebe (ista putanja se
  // može ponovo potpisati za novi test unos — fajl u bucket-u je nezavisan od time_entries reda).
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
  // Simulacija iz regresione tabele: putanja koja NE postoji u storage bucket-u — signing
  // poziv za nju uvek failuje, isto kao manuelni test.
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

  // Sačekaj da server akcija STVARNO završi (potvrđeno u bazi) pre ponovnog učitavanja —
  // inače goto() može da stigne pre nego što se review_status zaista promeni.
  await expect(async () => {
    const outcome = await getReviewOutcome(entryId);
    expect(outcome.review_status).toBe('approved');
  }).toPass({ timeout: 10000 });

  // Osveži queue i proveri da se kartica stvarno sklonila (više nije pending).
  await review.goto();
  await review.expectDriverCardNotVisible(driverEmail);
});
});
