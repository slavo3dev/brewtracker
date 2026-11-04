import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { WarehousesPage } from '../pages/WarehousesPage';

// Dedicated QA fixture, ne deljen sa drugim test fajlovima (lat/lng/radius mutacije ovde
// ne utiču na geofence testove u web-timeclock-review.spec.ts, koji koriste Smederevo Warehouse).
const WAREHOUSE_NAME = 'Genova Test Warehouse';
const OTHER_WAREHOUSE_NAME = 'Aleksa QA Warehouse';

test('WEB-WH-02: Empty state when there are no warehouses', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): would require deleting all warehouses from the shared database — they are actively used by routes/drivers in other test files, so deleting them would break the rest of the suite and real data. Needs an isolated test database.',
  );
});

test('WEB-WH-01: Warehouse geofence can be updated and saved', async ({ page }) => {
  // Istražio sam direktno: menjanje geofence vrednosti na bilo koju NOVU vrednost (probano
  // i necela, 212.5 ft) ruši stranicu ("This page couldn't load — A server error occurred");
  // re-submit ISTE, već postojeće necele vrednosti ne ruši. Isti koren problema kao WEB-WH-03.
  // Test ispod ne koristi test.fail() — namerno PADA (crveno) dok god je ovaj defekt prisutan.
  test.info().annotations.push({
    type: 'note',
    description:
      'Known app defect: saving any new geofence value crashes the page with a server error ("This page couldn\'t load — A server error occurred") — same root cause as WEB-WH-03. Needs investigation in the geofence update server action (updateWarehouseGeofenceAction or equivalent).',
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const warehouses = new WarehousesPage(page);
  await warehouses.goto();

  // Radius se bira u odnosu na TRENUTNO upisanu vrednost (ne fiksna konstanta) — inače, čim
  // se neki run jednom uspešno sačuva na 212.5, svaki sledeći run samo re-submituje ISTU
  // vrednost i test prestaje da testira update (vidi napomenu gore: resubmit iste vrednosti
  // ne ruši stranicu, pa bi test lažno prolazio bez stvarne provere).
  const current = await warehouses.getGeofenceValues(WAREHOUSE_NAME);
  const newValues = {
    latitude: 44.4056,
    longitude: 8.9463,
    radiusFeet: Number(current.radiusFeet) === 212.5 ? 213.5 : 212.5,
  };
  await warehouses.updateGeofence(WAREHOUSE_NAME, newValues);

  await warehouses.goto();
  const persisted = await warehouses.getGeofenceValues(WAREHOUSE_NAME);
  expect(Number(persisted.latitude)).toBeCloseTo(newValues.latitude, 3);
  expect(Number(persisted.longitude)).toBeCloseTo(newValues.longitude, 3);
  expect(Number(persisted.radiusFeet)).toBeCloseTo(newValues.radiusFeet, 1);
});

test('WEB-WH-03: Invalid geofence values (non-numeric/negative radius) are rejected', async ({ page }) => {
  // Negativan radijus se ispravno blokira NATIVNOM HTML validacijom (input ima min="1") —
  // taj deo već radi ispravno. Ali čuvanje VALJANOG, IZMENJENOG radijusa i dalje ruši
  // stranicu ("This page couldn't load — A server error occurred") — isti koren problema
  // već dokumentovan u WEB-WH-01. Test ispod ne koristi test.fail() — namerno PADA (crveno)
  // dok god je ovaj defekt prisutan.
  test.info().annotations.push({
    type: 'note',
    description:
      'Partial app defect: a negative radius is correctly blocked (HTML min="1") — that part is NOT a problem. BUT saving a valid, changed value still crashes the page with a server error — same root cause as WEB-WH-01. Needs a fix in the geofence update server action.',
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const warehouses = new WarehousesPage(page);
  await warehouses.goto();

  // 1) Negativan radijus se odbija pre slanja na server.
  await warehouses.attemptNegativeRadius(OTHER_WAREHOUSE_NAME, -50);
  await warehouses.expectRadiusFieldInvalid(OTHER_WAREHOUSE_NAME);

  // 2) Valjan, IZMENJEN radijus se stvarno čuva (ne samo da ne ruši stranicu).
  const current = await warehouses.getGeofenceValues(OTHER_WAREHOUSE_NAME);
  const newRadius = Number(current.radiusFeet) === 99 ? 101 : 99;
  await warehouses.updateGeofence(OTHER_WAREHOUSE_NAME, {
    latitude: Number(current.latitude),
    longitude: Number(current.longitude),
    radiusFeet: newRadius,
  });
  await expect(page.getByText(/couldn.t load|server error/i)).toHaveCount(0);

  await warehouses.goto();
  const persisted = await warehouses.getGeofenceValues(OTHER_WAREHOUSE_NAME);
  expect(Number(persisted.radiusFeet)).toBeCloseTo(newRadius, 1);
});
