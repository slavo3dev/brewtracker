import { Page, expect } from '@playwright/test';

export class FleetMapPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/fleet');
  }

  async expectAtLeastOneDriverMarker() {
    const markers = this.page.locator('.leaflet-marker-icon');
    await expect(markers.first()).toBeVisible();
  }

  async getMarkerCount(): Promise<number> {
    await this.page.waitForTimeout(500);
    return this.page.locator('.leaflet-marker-icon').count();
  }

  async expectEmptyState() {
    await expect(
      this.page.getByText('No clocked-in drivers have sent a location during the last 10 minutes.'),
    ).toBeVisible();
  }

  async expectMapNotMounted() {
    await expect(this.page.locator('.leaflet-container')).toHaveCount(0);
  }
}
