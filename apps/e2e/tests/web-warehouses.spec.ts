import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { WarehousesPage } from '../pages/WarehousesPage';

// Dedicated QA fixture, ne deljen sa drugim test fajlovima (lat/lng/radius mutacije ovde
// ne utiču na geofence testove u web-timeclock-review.spec.ts, koji koriste Smederevo Warehouse).
const WAREHOUSE_NAME = 'Genova Test Warehouse';
const OTHER_WAREHOUSE_NAME = 'Aleksa QA Warehouse';

test('WEB-WH-02: Prazno stanje kad nema nijednog magacina', async () => {
  test.skip(
    true,
    'PRESKOČENO (bezbednosni razlog, ne propust): da bi se ovo testiralo, trebalo bi obrisati SVE magacine iz deljene baze — oni se trenutno aktivno koriste u stvarnim rutama/vozačima drugih test fajlova, pa bi brisanje pokvarilo ostatak suite-a i potencijalno stvarne podatke. Potrebna izolovana test baza da bi se ovo bezbedno automatizovalo.',
  );
});

test('WEB-WH-01: Geofence magacina se može ažurirati i sačuvati', async ({ page }) => {
  // Istražio sam direktno: menjanje geofence vrednosti na bilo koju NOVU vrednost (probano
  // i necela, 212.5 ft) ruši stranicu ("This page couldn't load — A server error occurred");
  // re-submit ISTE, već postojeće necele vrednosti ne ruši. Isti koren problema kao WEB-WH-03.
  // Test ispod ne koristi test.fail() — namerno PADA (crveno) dok god je ovaj defekt prisutan.
  test.info().annotations.push({
    type: 'note',
    description:
      'POZNAT DEFEKT u aplikaciji: čuvanje BILO KOJE nove geofence vrednosti ruši stranicu server greškom ("This page couldn\'t load — A server error occurred") — isti koren problema kao WEB-WH-03. Treba istražiti server akciju za update geofence-a (updateWarehouseGeofenceAction ili ekvivalent).',
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const warehouses = new WarehousesPage(page);
  await warehouses.goto();

  const newValues = { latitude: 44.4056, longitude: 8.9463, radiusFeet: 212.5 };
  await warehouses.updateGeofence(WAREHOUSE_NAME, newValues);

  await warehouses.goto();
  const persisted = await warehouses.getGeofenceValues(WAREHOUSE_NAME);
  expect(Number(persisted.latitude)).toBeCloseTo(newValues.latitude, 3);
  expect(Number(persisted.longitude)).toBeCloseTo(newValues.longitude, 3);
  expect(Number(persisted.radiusFeet)).toBeCloseTo(newValues.radiusFeet, 1);
});

test('WEB-WH-03: Nevalidne geofence vrednosti (non-numeric/negativan radijus) su odbijene', async ({ page }) => {
  // Negativan radijus se ispravno blokira NATIVNOM HTML validacijom (input ima min="1") —
  // taj deo već radi ispravno. Ali čuvanje VALJANOG, IZMENJENOG radijusa i dalje ruši
  // stranicu ("This page couldn't load — A server error occurred") — isti koren problema
  // već dokumentovan u WEB-WH-01. Test ispod ne koristi test.fail() — namerno PADA (crveno)
  // dok god je ovaj defekt prisutan.
  test.info().annotations.push({
    type: 'note',
    description:
      'DELIMIČAN DEFEKT u aplikaciji: negativan radijus se ispravno blokira (HTML min="1") — to NIJE problem. ALI čuvanje validne izmenjene vrednosti i dalje ruši stranicu server greškom — isti koren problema kao WEB-WH-01. Treba popraviti: server akcija za update geofence-a.',
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
