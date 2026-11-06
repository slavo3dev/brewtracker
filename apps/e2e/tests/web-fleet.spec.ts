import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { FleetMapPage } from '../pages/FleetMapPage';
import {
  ensureDriverIsLiveOnFleetMap,
  removeDriverFromFleetMap,
  getVisibleFleetDriverEmailsAs,
} from '../helpers/fleetSeed';

// Svi Fleet testovi dele istu "živu" kartu (realtime podaci) — paralelno izvršavanje
// bi dovelo do toga da jedan test menja markere dok drugi broji/klikće na njih.
test.describe.configure({ mode: 'serial' });

test('WEB-FLEET-02: Empty state when there are no active drivers', async ({ page }) => {
  // Mora da radi PRE FLEET-01/03/04 (koji čine vozače "živim" i ostavljaju ih tako) —
  // serial mod garantuje redosled unutar fajla. Eksplicitno uklanjamo SVA 3 fixture vozača
  // za determinizam bez obzira na to da li je prethodni run ostavio nekog "živog".
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
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_EMAIL!);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const fleet = new FleetMapPage(page);
  await fleet.goto();
  await fleet.expectAtLeastOneDriverMarker();
});

test('WEB-FLEET-03: Manager sees only their own region, CEO sees all regions', async () => {
  // QA_DRIVER_EMAIL je u regionu Italy (isto kao QA menadžer); QA_DRIVER_OTHER_REGION_EMAIL je u Florida.
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_EMAIL!);
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_OTHER_REGION_EMAIL!);

  // Direktan upit (isti RLS koji UI koristi), bez klikanja po mapi — pouzdanije kad
  // ima više markera blizu jedan drugom.
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

  // Garantuj da ciljani vozač NIJE trenutno vidljiv, bez obzira da li je test
  // skoro pokretan ranije (čini test ponovljivim, ne zavisi od 10-minutnog prozora).
  await removeDriverFromFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  // CEO vidi sve regione, pa izbegavamo komplikacije oko regiona ovde.
  await login.goto();
  await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);
  await fleet.goto();
  const before = await fleet.getMarkerCount();
  // Sačekaj da se realtime subscription na stranici stvarno uspostavi pre nego što pošaljemo ping.
  await page.waitForTimeout(3000);

  // Novi "ping" se šalje DOK je stranica već otvorena, bez ikakvog page.reload().
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  await expect
    .poll(() => fleet.getMarkerCount(), { timeout: 15000 })
    .toBeGreaterThan(before);
});

test('WEB-FLEET-05: Map falls back to 60s polling when the realtime channel is unavailable', async ({ page }) => {
  test.setTimeout(90000); // treba da sačekamo FLEET_REFRESH_INTERVAL_MS (60s) polling fallback

  const login = new LoginPage(page);
  const fleet = new FleetMapPage(page);

  await removeDriverFromFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  // Blokiraj realtime websocket PRE navigacije — simulira kvar kanala. postgres_changes
  // event za novi ping nikad neće stići preko kanala, pa je JEDINI način da se marker
  // pojavi periodični setInterval poll (FLEET_REFRESH_INTERVAL_MS = 60s) u fleet-map.tsx.
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    ws.close({ code: 1006, reason: 'Simulated realtime failure' });
  });

  await login.goto();
  await login.login(process.env.QA_CEO_EMAIL!, process.env.QA_CEO_PASSWORD!);
  await fleet.goto();
  const before = await fleet.getMarkerCount();

  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  // Marker se NE pojavljuje odmah (realtime kanal je blokiran) — čekamo do ~70s da
  // polling fallback preuzme.
  await expect
    .poll(() => fleet.getMarkerCount(), { timeout: 70000, intervals: [2000] })
    .toBeGreaterThan(before);
});

test('WEB-FLEET-07: Fleet page redirects non-admin accounts', async ({ page }) => {
  await page.goto('/dashboard/fleet');
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-FLEET-06: Empty state does not mount the map at all', async ({ page }) => {
  // Ukloni SVE vozače koje prethodni testovi u ovom serial lancu mogu ostaviti "živim"
  // (FLEET-01/03 koriste QA_DRIVER_EMAIL i OTHER_REGION, FLEET-04 koristi REFRESH_TEST).
  await removeDriverFromFleetMap(process.env.QA_DRIVER_EMAIL!);
  await removeDriverFromFleetMap(process.env.QA_DRIVER_OTHER_REGION_EMAIL!);
  await removeDriverFromFleetMap(process.env.QA_DRIVER_REFRESH_TEST_EMAIL!);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const fleet = new FleetMapPage(page);
  await fleet.goto();
  await fleet.expectEmptyState();
  // Mapa (FleetMapLoader/Leaflet) se montira SAMO kad locations.length > 0 — u praznom
  // stanju ne postoji uopšte u DOM-u, ne samo da je bez markera.
  await fleet.expectMapNotMounted();
});

test('WEB-FLEET-08: Map loads client-side with a loading fallback', async ({ page }) => {
  await ensureDriverIsLiveOnFleetMap(process.env.QA_DRIVER_EMAIL!);

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  // "commit" (ne "load") — zaustavlja se čim navigacija počne, PRE nego što se dinamički
  // Leaflet chunk preuzme, dajući priliku da se uhvati tranzijentni "Loading fleet map…"
  // fallback koji inače nestane prebrzo na brzoj vezi.
  await page.goto('/dashboard/fleet', { waitUntil: 'commit' });
  await expect(page.getByText('Loading fleet map…')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
});
