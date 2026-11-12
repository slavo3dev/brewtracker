import { Page, expect, Locator } from '@playwright/test';

export class TimeClockReviewPage {
  constructor(private page: Page) {}

  async goto() {
    // Same reason as TimeClockEntriesPage.goto() — don't wait for ALL selfie images to
    // finish loading, just the DOM.
    await this.page.goto('/dashboard/time-clock/review', { waitUntil: 'domcontentloaded' });
  }

  cardForDriverEmail(email: string): Locator {
    return this.page.locator('article').filter({ hasText: email });
  }

  async expectDriverCardVisible(email: string) {
    await expect(this.cardForDriverEmail(email)).toBeVisible();
  }

  async expectDriverCardNotVisible(email: string) {
    await expect(this.cardForDriverEmail(email)).toHaveCount(0);
  }

  // When the same driver has several pending cards (e.g. one inside, one outside the
  // geofence), extra text (e.g. "Outside by") singles out THAT specific card.
  cardForDriverMatching(email: string, extraText: string | RegExp): Locator {
    return this.cardForDriverEmail(email).filter({ hasText: extraText });
  }

  async expectGeofenceStatus(card: Locator, expectedText: string | RegExp) {
    const geofenceValue = card
      .locator('div')
      .filter({ has: this.page.locator('dt', { hasText: 'Geofence' }) })
      .locator('dd');
    await expect(geofenceValue).toHaveText(expectedText);
  }

  async expectOverrideStatus(card: Locator, expectedText: string) {
    const overrideValue = card
      .locator('div')
      .filter({ has: this.page.locator('dt', { hasText: 'Override' }) })
      .locator('dd');
    await expect(overrideValue).toHaveText(expectedText);
  }

  private formOn(card: Locator, buttonName: string): Locator {
    return card.locator('form').filter({ has: this.page.getByRole('button', { name: buttonName, exact: true }) });
  }

  async approve(card: Locator, note?: string) {
    const form = this.formOn(card, 'Approve');
    if (note) {
      await form.locator('textarea[name="reviewNote"]').fill(note);
    }
    await form.getByRole('button', { name: 'Approve', exact: true }).click();
  }

  async flag(card: Locator, reason: string) {
    const form = this.formOn(card, 'Flag');
    await form.locator('textarea[name="reviewNote"]').fill(reason);
    await form.getByRole('button', { name: 'Flag', exact: true }).click();
  }

  async reject(card: Locator, reason: string) {
    const form = this.formOn(card, 'Reject');
    await form.locator('textarea[name="reviewNote"]').fill(reason);
    await form.getByRole('button', { name: 'Reject', exact: true }).click();
  }

  async expectSelfieImageVisible(card: Locator) {
    await expect(card.getByText('Clock-in selfie', { exact: true })).toBeVisible();
    const image = card.locator('img');
    await expect(image).toBeVisible();
    // toBeVisible() also passes for a broken image (a broken img is still "visible" in the
    // DOM) — check that it actually loaded (the signed URL works), not just that an <img>
    // element exists.
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }

  async expectNoSelfieMessage(card: Locator) {
    await expect(card.getByText('No clock-in selfie was submitted.')).toBeVisible();
  }

  async expectSelfieLoadError(card: Locator) {
    await expect(card.getByText('The selfie exists, but it could not be loaded.')).toBeVisible();
  }
}
