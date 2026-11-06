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
    // Server akcija + redirect + re-render pod opterećenjem (naročito --headed) ponekad
    // traje duže od podrazumevanog 5s.
    await expect(this.page.getByText(expectedText)).toBeVisible({ timeout: 10000 });
  }
}
