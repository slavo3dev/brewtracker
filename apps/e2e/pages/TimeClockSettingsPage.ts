import { Page, expect } from '@playwright/test';

export class TimeClockSettingsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/time-clock/settings');
  }

  async runAutoCloseCheck() {
    await this.page.getByRole('button', { name: 'Run auto-close check' }).click();
  }

  async expectResultMessage(expectedText: string | RegExp) {
    // The server action + redirect + re-render under load (especially in --headed mode)
    // sometimes takes longer than the default 5s.
    await expect(this.page.getByText(expectedText)).toBeVisible({ timeout: 10000 });
  }
}
