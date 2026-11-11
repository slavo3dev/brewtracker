import { Page, expect, Locator } from '@playwright/test';

export class TimeClockEntriesPage {
  constructor(private page: Page) {}

  async goto() {
    // The page has NO limit (see the note below) and many entries have a deliberately
    // nonexistent selfie path (WEB-TCENT-07/WEB-TCREV-05 fixtures) — the default 'load' waits
    // for EVERY image on the page to finish (or fail), which grows with the number of such
    // entries in the shared database. The test only needs the DOM, not for every image to
    // finish loading.
    try {
      await this.page.goto('/dashboard/time-clock/entries', { waitUntil: 'domcontentloaded' });
    } catch (error) {
      // WEB-TCENT-04 calls goto() several times in quick succession (a DB write, then
      // immediately goto() again, with no UI interaction in between) — this occasionally hits
      // a known Playwright/Chromium quirk (ERR_ABORTED) when a new navigation to the SAME URL
      // arrives before the previous one has fully settled. One retry is enough — it doesn't
      // mean the page is actually broken.
      if (error instanceof Error && error.message.includes('ERR_ABORTED')) {
        await this.page.goto('/dashboard/time-clock/entries', { waitUntil: 'domcontentloaded' });
      } else {
        throw error;
      }
    }
  }

  // The page has NO limit — it shows the ENTIRE entry history for all drivers, sorted by
  // clock_in_at descending. The driver we use has hundreds of old entries from this session,
  // so ".first()" (the most recent clock-in for that driver) reliably matches the
  // just-created fixture.
  cardForDriverEmail(email: string): Locator {
    return this.page.locator('article').filter({ hasText: email }).first();
  }

  private fieldValue(card: Locator, label: string): Locator {
    return card.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
  }

  async expectFieldsPopulated(card: Locator) {
    await expect(card.locator('h2')).not.toHaveText('');
    await expect(card.getByText('No email')).toHaveCount(0);
    await expect(card.locator('span.rounded-full.bg-latte-100')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Clock in')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Clock out')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Warehouse')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Review')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Auto closed')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Reason')).not.toHaveText('');
  }

  async getClockOutValue(card: Locator): Promise<string> {
    return this.fieldValue(card, 'Clock out').innerText();
  }

  async getFieldText(card: Locator, label: string): Promise<string> {
    return this.fieldValue(card, label).innerText();
  }

  async getReasonValue(card: Locator): Promise<string> {
    return this.fieldValue(card, 'Reason').innerText();
  }

  async expectSelfieImageVisible(card: Locator) {
    await expect(card.getByText('Clock-in selfie', { exact: true })).toBeVisible();
    const image = card.locator('img');
    await expect(image).toBeVisible();
    // Same reason as TimeClockReviewPage: toBeVisible() doesn't guarantee the image
    // actually LOADED (a broken signed URL is still "visible" in the DOM).
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
