import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TimeClockReviewPage } from '../pages/TimeClockReviewPage';
import {
  createPendingClockInEntry,
  resolveExistingPendingEntries,
  getReviewOutcome,
} from '../helpers/timeClockSeed';

test('WEB-TCREV-02: Prazno stanje kad nema nijednog pending unosa', async () => {
  test.skip(
    true,
    'PRESKOČENO (bezbednosni razlog, ne propust): da bi se ovo testiralo, trebalo bi rešiti/obrisati SVE pending unose u celom projektu (ne samo jednog regiona) — queue trenutno NIJE region-scoped (vidi WEB-TCREV-01 defekt), pa "prazno" znači prazno za ceo sistem. Potrebna izolovana test baza da bi se ovo bezbedno automatizovalo.',
  );
});

test('WEB-TCREV-01: Review queue lista samo review_status=pending unose svog regiona', async ({ page }) => {
  // Poznat, već dokumentovan nalaz u regression tabeli (status: Fail): queue nije
  // region-scoped jer getTimeEntryReviewQueue() koristi service-role klijent bez
  // region filtera — manager vidi pending unose SVIH regiona, ne samo svog. Test ispod ne
  // koristi test.fail() — namerno PADA (crveno) dok god je ovaj defekt prisutan. Koristi
  // IZOLOVAN vozač (QA_DRIVER_OTHER_REGION_ID, ne deljeni TRANSFERS vozač ispod) i namerno
  // je van serial grupe ispod — njegov pad ne sme da blokira ostale TCREV-* testove.
  test.info().annotations.push({
    type: 'note',
    description:
      'POZNAT DEFEKT u aplikaciji: review queue koristi service-role klijent bez region filtera — menadžer vidi i može da odobri/odbije pending clock-in unose vozača iz SVIH regiona, ne samo svog. Treba popraviti: getTimeEntryReviewQueue() da filtrira po regionu ulogovanog menadžera.',
  });

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

test('WEB-TCREV-03: Kartica prikazuje tačnu geofence distancu i status', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  await createPendingClockInEntry(driverId, { geofence: 'inside', leaveOpen: true });
  await createPendingClockInEntry(driverId, { geofence: 'outside', leaveOpen: false });

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

test('WEB-TCREV-07: Approve akcija postavlja status i reviewer metapodatke', async ({ page }) => {
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

test('WEB-TCREV-08: Flag akcija prihvata razlog i ažurira status', async ({ page }) => {
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

test('WEB-TCREV-09: Reject akcija prihvata razlog i ažurira status', async ({ page }) => {
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

test('WEB-TCREV-11: Non-reviewer uloga je blokirana za review queue', async ({ page }) => {
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

test('WEB-TCREV-11b: Izlogovan korisnik je preusmeren na /login', async ({ page }) => {
  const review = new TimeClockReviewPage(page);
  await review.goto();
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-TCREV-12: Clock-in van geofence-a je vidljiv revieweru i akcionabilan', async ({ page }) => {
  // PR #85: clock-in van geofence-a NIJE blokiran, samo se beleži — entry se pojavljuje
  // u queue-u kao pending sa statusom "Outside by N m" i manager i dalje može da ga reši.
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  const entryId = await createPendingClockInEntry(driverId, { geofence: 'outside' });

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

test('WEB-TCREV-04: Selfie se prikazuje kad postoji validan potpisiv URL', async ({ page }) => {
  const driverId = process.env.QA_DRIVER_TRANSFERS_ID!;
  const driverEmail = process.env.QA_DRIVER_TRANSFERS_EMAIL!;

  await resolveExistingPendingEntries(driverId);
  // Stvarna storage putanja preuzeta sa postojećeg unosa iz mobilne upotrebe (ista putanja se
  // može ponovo potpisati za novi test unos — fajl u bucket-u je nezavisan od time_entries reda).
  await createPendingClockInEntry(driverId, {
    clockInSelfieUrl: 'f54a1e63-3545-4907-8b12-63152de2c405/76207c14-0ab4-434f-963c-268c97c92dd8/clock-in-1785766941660.jpg',
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const review = new TimeClockReviewPage(page);
  await review.goto();

  const card = review.cardForDriverEmail(driverEmail);
  await review.expectSelfieImageVisible(card);
});

test('WEB-TCREV-05: Poruka o grešci učitavanja kad selfie putanja postoji ali potpisivanje ne uspeva', async ({ page }) => {
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

test('WEB-TCREV-06: Poruka "No clock-in selfie" kad selfie nije poslat', async ({ page }) => {
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

test('WEB-TCREV-10: Rešen unos nestaje iz pending queue-a posle osvežavanja', async ({ page }) => {
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
