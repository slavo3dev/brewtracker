import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TimeClockEntriesPage } from '../pages/TimeClockEntriesPage';
import {
  createPendingClockInEntry,
  resolveExistingPendingEntries,
  setTimeEntryReasonFields,
} from '../helpers/timeClockSeed';
import { supabaseAdmin } from '../helpers/supabaseAdmin';

// Deljeni vozač fiksture sa web-timeclock-review.spec.ts — rade jedan za drugim da izbegnu
// trku oko istog "jedan otvoren unos po vozaču" reda.
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
  // Podrazumevani QA magacin (QA_WAREHOUSE_ID) ima region "Global", koji RLS politika na
  // "warehouses" tabeli ne prepoznaje kao poseban slučaj (vidi napomenu u WEB-TCREV-03/WEB-SV-07)
  // — manager iz regiona Italy bi dobio PRAZAN join za njega, pa bi "Warehouse" legitimno
  // prikazao "—" bez obzira da li kolona uopšte radi ispravno. Genova magacin (region Italy) je
  // STVARNO vidljiv manageru, pa test može da potvrdi da se pravo ime magacina renderuje.
  await createPendingClockInEntry(driverId, { leaveOpen: true, warehouseId: process.env.QA_GENOVA_TEST_WAREHOUSE_ID! });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const entries = new TimeClockEntriesPage(page);
  await entries.goto();

  const card = entries.cardForDriverEmail(driverEmail);
  await expect(card).toBeVisible();
  // expectFieldsPopulated() samo proverava da nijedno polje nije PRAZNO — to bi prošlo i da
  // Warehouse/Review/Auto closed/Reason prikažu POGREŠNU (ali ne-praznu) vrednost. Ova fiksturna
  // (createPendingClockInEntry sa leaveOpen:true, bez ikakvih reason polja) ima POTPUNO
  // determinističke vrednosti za ta 4 polja — proveravamo ih konkretno, ne samo "nije prazno".
  await entries.expectFieldsPopulated(card);

  const supabase = supabaseAdmin();
  const { data: warehouse, error: warehouseError } = await supabase
    .from('warehouses')
    .select('name')
    .eq('id', process.env.QA_GENOVA_TEST_WAREHOUSE_ID!)
    .single();
  if (warehouseError || !warehouse) {
    throw new Error(`Ne mogu da pročitam ime magacina: ${warehouseError?.message}`);
  }

  expect(await entries.getFieldText(card, 'Warehouse')).toBe(warehouse.name);
  // <dd class="capitalize"> — innerText() odražava CSS text-transform, pa je renderovan tekst
  // "Pending" (veliko P), iako je sirova DB vrednost "pending".
  expect(await entries.getFieldText(card, 'Review')).toBe('Pending');
  // Mobilni clock-in nikad ne postavlja auto_closed_at, a resolveExistingPendingEntries/
  // createPendingClockInEntry ovde ga ne diraju — "No" je jedina moguća vrednost za OVU fiksturu.
  expect(await entries.getFieldText(card, 'Auto closed')).toBe('No');
  // Nijedno od 4 reason polja nije postavljeno za ovu fiksturu — fallback na "—"
  // (isti lanac prioriteta koji WEB-TCENT-04 testira eksplicitno, korak po korak).
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
  // Stranica nema paginaciju i renderuje CELU istoriju unosa (800+ u deljenoj bazi, raste kroz
  // sesije) — ovaj test zove entries.goto() TRI puta zaredom, pa čak i blago sporiji load (pod
  // opterećenjem) lako premaši podrazumevani 30s budžet za ceo test. Potvrđeno snimkom ekrana iz
  // stvarnog pada: sama navigacija je istekla, ne neki lokator/race unutar stranice.
  test.setTimeout(90000);

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
