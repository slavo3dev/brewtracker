import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { WarehousesPage } from '../pages/WarehousesPage';

// A dedicated QA fixture, not shared with other test files (the lat/lng/radius mutations
// here don't affect the geofence tests in web-timeclock-review.spec.ts, which use the
// Smederevo Warehouse).
const WAREHOUSE_NAME = 'Genova Test Warehouse';
const OTHER_WAREHOUSE_NAME = 'Aleksa QA Warehouse';

test('WEB-WH-02: Empty state when there are no warehouses', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): would require deleting all warehouses from the shared database — they are actively used by routes/drivers in other test files, so deleting them would break the rest of the suite and real data. Needs an isolated test database.',
  );
});

test('WEB-WH-01: Warehouse geofence can be updated and saved', async ({ page }) => {
  // Investigated directly: changing the geofence value to any NEW value (tried with a
  // fractional one too, 212.5 ft) crashes the page ("This page couldn't load — A server
  // error occurred"); re-submitting the SAME, already-existing fractional value doesn't
  // crash. Same root cause as WEB-WH-03. The test below doesn't use test.fail() —
  // intentionally FAILS (red) for as long as this defect is present.
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

  // The radius is chosen relative to the CURRENTLY stored value (not a fixed constant) —
  // otherwise, once some run successfully saves 212.5, every subsequent run would just
  // re-submit the SAME value and the test would stop testing the update (see the note above:
  // resubmitting the same value doesn't crash the page, so the test would falsely pass
  // without a real check).
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
  // A negative radius is correctly blocked by NATIVE HTML validation (the input has
  // min="1") — that part already works correctly. But saving a VALID, CHANGED radius still
  // crashes the page ("This page couldn't load — A server error occurred") — the same root
  // cause already documented in WEB-WH-01. The test below doesn't use test.fail() —
  // intentionally FAILS (red) for as long as this defect is present.
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

  // 1) A negative radius is rejected before being sent to the server.
  await warehouses.attemptNegativeRadius(OTHER_WAREHOUSE_NAME, -50);
  await warehouses.expectRadiusFieldInvalid(OTHER_WAREHOUSE_NAME);

  // 2) A valid, CHANGED radius is actually saved (not just that it doesn't crash the page).
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
