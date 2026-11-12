import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.locator('#email').fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
    // Wait for the URL to actually CHANGE to /dashboard (success), or for this to time out
    // (meaning login failed — we stay on /login, which the failed-login tests check themselves).
    await this.page.waitForURL(/\/dashboard/, { timeout: 10000 }).catch(() => {});
  }

  async expectLoggedInOnDashboard() {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
