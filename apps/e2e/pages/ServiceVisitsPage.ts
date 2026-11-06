import { Page, expect, Locator } from '@playwright/test';

export class ServiceVisitsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/service/visits');
  }

  visitCard(clientName: string, driverName: string): Locator {
    return this.page
      .locator('article')
      .filter({ hasText: clientName })
      .filter({ hasText: driverName });
  }

  async getStatusCounts(): Promise<{ recent: number; inProgress: number; completed: number }> {
    const values = await this.page
      .locator('.mt-7.grid.gap-3.sm\\:grid-cols-3 > div p.mt-1')
      .allInnerTexts();
    return {
      recent: parseInt(values[0], 10),
      inProgress: parseInt(values[1], 10),
      completed: parseInt(values[2], 10),
    };
  }

  async getVisitCount(): Promise<number> {
    return this.page.locator('article').count();
  }

  async expectEmptyState() {
    await expect(this.page.getByText('No service visits')).toBeVisible();
    await expect(
      this.page.getByText('Visits will appear here after a driver confirms arrival.'),
    ).toBeVisible();
  }

  async getTimeOnLocation(clientName: string, driverName: string): Promise<string> {
    const card = this.visitCard(clientName, driverName);
    const dd = card.locator('dt', { hasText: 'Time on location' }).locator('xpath=following-sibling::dd[1]');
    return dd.innerText();
  }

  // "Completed"/"In Progress" tekst se javlja i kao dt labela polja ("Completed: ...") pored
  // samog status bedža — bedž se skopuje preko njegove specifične CSS klase da se izbegne ta
  // dvosmislenost.
  statusBadge(clientName: string, driverName: string): Locator {
    return this.visitCard(clientName, driverName).locator('span.shrink-0.rounded-full.px-3.py-1');
  }

  async expectStatus(clientName: string, driverName: string, status: string) {
    await expect(this.statusBadge(clientName, driverName)).toHaveText(status);
  }
}
