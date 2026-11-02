import { Page, expect, Locator } from '@playwright/test';

export class TechnicalIssuesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/service');
  }

  ticketCard(ticketDescription: string): Locator {
    return this.page.locator('article').filter({ hasText: ticketDescription });
  }

  async assignTechnician(ticketDescription: string, technicianLabel: string) {
    const card = this.ticketCard(ticketDescription);
    await card.getByRole('combobox').selectOption({ label: technicianLabel });
    await card.getByRole('button', { name: 'Assign' }).click();
  }

  async expectInProgress(ticketDescription: string) {
    await expect(this.ticketCard(ticketDescription).getByText('In Progress', { exact: true })).toBeVisible();
  }

  async expectResolveDisabled(ticketDescription: string) {
    const card = this.ticketCard(ticketDescription);
    await expect(card.getByRole('button', { name: 'Mark as Resolved' })).toBeDisabled();
  }

  // Čim status postane "resolved", ceo akcioni blok (uključujući i samu "Technical ticket
  // resolved." poruku) se uklanja iz DOM-a ({ if (isClosed) return null }) — poruka zna da
  // nestane pre nego što stignemo da je uhvatimo. Krajnje stanje (status + nestale kontrole)
  // se proverava odvojeno, umesto da se oslanjamo na tu tranzijentnu poruku.
  async resolveTicket(ticketDescription: string) {
    const card = this.ticketCard(ticketDescription);
    await card.getByRole('button', { name: 'Mark as Resolved' }).click();
  }

  async expectResolvedStatus(ticketDescription: string) {
    await expect(this.ticketCard(ticketDescription).getByText('Resolved', { exact: true })).toBeVisible({
      timeout: 10000,
    });
  }

  async expectNoActionControls(ticketDescription: string) {
    const card = this.ticketCard(ticketDescription);
    await expect(card.getByRole('button', { name: 'Assign' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Reassign' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Mark as Resolved' })).toHaveCount(0);
    await expect(card.getByRole('combobox')).toHaveCount(0);
  }

  async getStatusCounts(): Promise<{ open: number; inProgress: number; resolved: number }> {
    const values = await this.page
      .locator('.mt-7.grid.gap-3.sm\\:grid-cols-3 > div p.mt-1')
      .allInnerTexts();
    return {
      open: parseInt(values[0], 10),
      inProgress: parseInt(values[1], 10),
      resolved: parseInt(values[2], 10),
    };
  }

  async expectPhotoVisible(ticketDescription: string) {
    await expect(this.ticketCard(ticketDescription).locator('img')).toBeVisible();
  }

  async getTechnicianOptionLabels(ticketDescription: string): Promise<string[]> {
    const card = this.ticketCard(ticketDescription);
    const options = await card.getByRole('combobox').locator('option').allInnerTexts();
    return options.filter((label) => label !== 'Select technician');
  }

  async reassignTechnician(ticketDescription: string, technicianLabel: string) {
    const card = this.ticketCard(ticketDescription);
    await card.getByRole('combobox').selectOption({ label: technicianLabel });
    await card.getByRole('button', { name: 'Reassign' }).click();
  }

  async expectAssignedTo(ticketDescription: string, technicianLabel: string) {
    const card = this.ticketCard(ticketDescription);
    await expect(card.getByText('Assigned to')).toBeVisible();
    const dd = card.locator('dt', { hasText: 'Assigned to' }).locator('xpath=following-sibling::dd[1]');
    await expect(dd).toHaveText(technicianLabel, { timeout: 10000 });
  }

  async attemptResolveWithoutAssignee(ticketDescription: string) {
    const card = this.ticketCard(ticketDescription);
    await card.getByRole('button', { name: 'Mark as Resolved' }).click();
  }

  async expectActionError(ticketDescription: string, text: string) {
    await expect(this.ticketCard(ticketDescription).getByRole('alert').getByText(text)).toBeVisible();
  }
}
