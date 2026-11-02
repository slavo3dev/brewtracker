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
    // Sačekaj da URL stvarno PREĐE na /dashboard (uspeh), ili istekne vreme (znači login nije uspeo —
    // ostajemo na /login, što testovi za neuspešan login sami proveravaju).
    await this.page.waitForURL(/\/dashboard/, { timeout: 10000 }).catch(() => {});
  }

  async expectLoggedInOnDashboard() {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
