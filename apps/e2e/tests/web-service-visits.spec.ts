import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { ServiceVisitsPage } from '../pages/ServiceVisitsPage';
import { createServiceVisitStop, deleteServiceVisitRoute } from '../helpers/serviceVisitSeed';

const QA_DRIVER_ID = process.env.QA_DRIVER_ID!;
const CLIENT_NAME = 'Genova Test Client';
const DRIVER_NAME = 'QA Driver Fixture';

// Testovi dele isti client+driver par (jedini garantovano čist od postojeće istorije) za
// svoje fixture-e — paralelno izvršavanje bi privremeno stvorilo više kartica istovremeno
// i polomilo lociranje "tačno jedne" kartice.
test.describe.configure({ mode: 'serial' });

test('WEB-SV-05: Prazno stanje kad nema nijedne service posete', async () => {
  test.skip(
    true,
    'PRESKOČENO (bezbednosni razlog, ne propust): da bi se ovo testiralo, trebalo bi obrisati SVIH 100+ postojećih stanica sa zabeleženim dolaskom iz cele deljene baze (ne samo za jednog vozača/klijenta) — stvarna/simulirana aktivnost drugih korisnika projekta. Potrebna izolovana test baza da bi se ovo bezbedno automatizovalo.',
  );
});

test('WEB-SV-01: Lista prikazuje samo stanice sa zabeleženim dolaskom', async ({ page }) => {
  const arrivedRoute = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(),
    completedAt: new Date(),
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();

    // "Genova Test Client" nema drugih stanica u ovom fidu (proveren prazan presek pre pisanja
    // testa) — tačno jedna kartica se očekuje, za upravo kreiranu (dolazak zabeležen) stanicu.
    await expect(visits.visitCard(CLIENT_NAME, DRIVER_NAME)).toHaveCount(1);
  } finally {
    await deleteServiceVisitRoute(arrivedRoute.routeId);
  }
});

test('WEB-SV-02: "Time on location" tačno računa trajanje za završenu posetu', async ({ page }) => {
  const arrivedAt = new Date(Date.now() - (1 * 3600 + 5 * 60 + 20) * 1000); // -1h 5m 20s
  const completedAt = new Date();

  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt,
    completedAt,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();

    await visits.expectStatus(CLIENT_NAME, DRIVER_NAME, 'Completed');
    const duration = await visits.getTimeOnLocation(CLIENT_NAME, DRIVER_NAME);
    expect(duration).toBe('1h 5m 20s');
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});

test('WEB-SV-03: Poseta u toku prikazuje "In progress" umesto fiksnog trajanja', async ({ page }) => {
  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(Date.now() - 10 * 60 * 1000),
    completedAt: null,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();

    await visits.expectStatus(CLIENT_NAME, DRIVER_NAME, 'In Progress');
    const duration = await visits.getTimeOnLocation(CLIENT_NAME, DRIVER_NAME);
    expect(duration).toBe('In progress');
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});

test('WEB-SV-04: Metrika (Recent/In Progress/Completed) odgovara listi', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const visits = new ServiceVisitsPage(page);
  await visits.goto();

  const counts = await visits.getStatusCounts();
  const totalCards = await visits.getVisitCount();
  const inProgressCards = await page
    .locator('article')
    .filter({ has: page.locator('span.shrink-0.rounded-full.px-3.py-1', { hasText: 'In Progress' }) })
    .count();
  const completedCards = await page
    .locator('article')
    .filter({ has: page.locator('span.shrink-0.rounded-full.px-3.py-1', { hasText: 'Completed' }) })
    .count();

  expect(counts.recent).toBe(totalCards);
  expect(counts.inProgress).toBe(inProgressCards);
  expect(counts.completed).toBe(completedCards);
});

test('WEB-SV-06: Lista poseta ne izlaže foto/potpis/drink-count detalje (dokumentovan gap)', async ({ page }) => {
  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(),
    completedAt: new Date(),
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();
    await expect(visits.visitCard(CLIENT_NAME, DRIVER_NAME)).toBeVisible();

    // ServiceVisitCard prikazuje samo Driver/Arrived/Completed/Time on location — nema
    // slika, potpisa ni drink-count UI-ja nigde na ovoj listi stranici.
    await expect(page.locator('article img')).toHaveCount(0);
    await expect(page.getByText('Signature', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Drink Count', { exact: false })).toHaveCount(0);
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});

test('WEB-SV-07: Poseta se ne prikazuje menadžeru ako skladište rute nema podešen region (dokumentovano region-scoping ponašanje)', async ({ page }) => {
  // Regresiona tabela (napomena uz WEB-TT-10) eksplicitno potvrđuje ovo kao OČEKIVANO
  // ponašanje, ne kao defekt: "The other 8 are hidden by region rules because the route's
  // warehouse is outside Italy (...QA Test Warehouse - MOB-CLK-02 with region 'N/A'...)."
  // RLS politika "Managers can read routes in their region" poredi warehouses.region =
  // current_user_region() — skladište bez podešenog regiona (NULL) se tretira kao "izvan
  // regiona" (NULL = 'Italy' nikad nije true), pa menadžer ne vidi tu rutu/stanicu uopšte.
  const NO_REGION_WAREHOUSE_ID = process.env.QA_NO_REGION_WAREHOUSE_ID!; // "QA Test Warehouse", region: null
  const route = await createServiceVisitStop({
    driverId: QA_DRIVER_ID,
    arrivedAt: new Date(),
    completedAt: new Date(),
    warehouseId: NO_REGION_WAREHOUSE_ID,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const visits = new ServiceVisitsPage(page);
    await visits.goto();
    await expect(visits.visitCard(CLIENT_NAME, DRIVER_NAME)).toHaveCount(0);
  } finally {
    await deleteServiceVisitRoute(route.routeId);
  }
});
