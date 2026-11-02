import { Page, Locator, expect } from '@playwright/test';

export class WarehousesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/inventory/warehouses');
  }

  private form(warehouseName: string): Locator {
    return this.page.locator('form').filter({ has: this.page.getByRole('heading', { name: warehouseName, exact: true }) });
  }

  async updateGeofence(
    warehouseName: string,
    values: { latitude: number; longitude: number; radiusFeet: number },
  ) {
    const form = this.form(warehouseName);
    await form.locator('input[name="latitude"]').fill(String(values.latitude));
    await form.locator('input[name="longitude"]').fill(String(values.longitude));
    await form.locator('input[name="radiusFeet"]').fill(String(values.radiusFeet));
    await form.getByRole('button', { name: 'Save geofence' }).click();
  }

  async getGeofenceValues(warehouseName: string): Promise<{
    latitude: string;
    longitude: string;
    radiusFeet: string;
  }> {
    const form = this.form(warehouseName);
    return {
      latitude: await form.locator('input[name="latitude"]').inputValue(),
      longitude: await form.locator('input[name="longitude"]').inputValue(),
      radiusFeet: await form.locator('input[name="radiusFeet"]').inputValue(),
    };
  }

  async attemptNegativeRadius(warehouseName: string, radiusFeet: number) {
    const form = this.form(warehouseName);
    await form.locator('input[name="radiusFeet"]').fill(String(radiusFeet));
    await form.getByRole('button', { name: 'Save geofence' }).click();
  }

  async expectRadiusFieldInvalid(warehouseName: string) {
    const input = this.form(warehouseName).locator('input[name="radiusFeet"]');
    await expect(input).toHaveJSProperty('validity.valid', false);
  }
}
