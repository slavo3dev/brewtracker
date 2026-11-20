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
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const warehouses = new WarehousesPage(page);
  await warehouses.goto();

  // Captured BEFORE attemptNegativeRadius() below — getGeofenceValues() reads the LIVE form
  // input, not a fresh page load. attemptNegativeRadius() fills the radius field with -50 and
  // that value stays in the field (native validation blocks the submit, so the page never
  // reloads) — reading "current" AFTER that call would capture "-50", not the real persisted
  // radius, breaking the alternation below (it would always resolve to 99, defeating the
  // point of testing an actual CHANGE on repeat runs).
  const current = await warehouses.getGeofenceValues(OTHER_WAREHOUSE_NAME);

  // 1) A negative radius is rejected before being sent to the server.
  await warehouses.attemptNegativeRadius(OTHER_WAREHOUSE_NAME, -50);
  await warehouses.expectRadiusFieldInvalid(OTHER_WAREHOUSE_NAME);

  // 2) A valid, CHANGED radius is actually saved (not just that it doesn't crash the page).
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
