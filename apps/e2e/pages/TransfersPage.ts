import { Page, expect } from '@playwright/test';

export class TransfersPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/inventory/transfers');
  }

  async selectWarehouse(label: string) {
    await this.page.locator('select').nth(0).selectOption({ label });
  }

  async selectDriver(driverId: string) {
    await this.page.locator('select').nth(1).selectOption(driverId);
  }

  async selectProductForRow(rowIndex: number, optionIndex: number) {
    await this.page.locator('select').nth(2 + rowIndex).selectOption({ index: optionIndex });
  }

  async selectProductForRowByLabel(rowIndex: number, label: string) {
    await this.page.locator('select').nth(2 + rowIndex).selectOption({ label });
  }

  async selectMovementType(type: 'Issue to driver' | 'Return to warehouse') {
    await this.page.getByRole('button', { name: type, exact: true }).click();
  }

  async getCustodyValues(): Promise<{ from: string; to: string }> {
    const aside = this.page.locator('aside').filter({ hasText: 'Custody movement' });
    const boxes = aside.locator('.rounded-xl.bg-latte-100');
    return {
      from: await boxes.nth(0).locator('div').nth(1).innerText(),
      to: await boxes.nth(1).locator('div').nth(1).innerText(),
    };
  }

  async fillIssueQuantityForRow(rowIndex: number, value: string) {
    const card = this.page.locator('.rounded-2xl.border.border-latte-200.bg-latte-50').nth(rowIndex);
    await card.locator('input[type="number"]').first().fill(value);
  }

  async fillLooseQuantityForRow(rowIndex: number, value: string) {
    const card = this.page.locator('.rounded-2xl.border.border-latte-200.bg-latte-50').nth(rowIndex);
    await card.locator('input[type="number"]').nth(1).fill(value);
  }

  async expectLooseQuantityInputMissingForRow(rowIndex: number) {
    const card = this.page.locator('.rounded-2xl.border.border-latte-200.bg-latte-50').nth(rowIndex);
    await expect(card.locator('input[type="number"]')).toHaveCount(1);
  }

  async expectIssueQuantityInvalidForRow(rowIndex: number) {
    const card = this.page.locator('.rounded-2xl.border.border-latte-200.bg-latte-50').nth(rowIndex);
    const input = card.locator('input[type="number"]').first();
    await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  }

  async expectLooseQuantityInvalidForRow(rowIndex: number) {
    const card = this.page.locator('.rounded-2xl.border.border-latte-200.bg-latte-50').nth(rowIndex);
    const input = card.locator('input[type="number"]').nth(1);
    await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  }

  async getTotalTransferReadoutForRow(rowIndex: number): Promise<string> {
    const card = this.page.locator('.rounded-2xl.border.border-latte-200.bg-latte-50').nth(rowIndex);
    return card.locator('.rounded-xl.bg-copper-50 div').nth(1).innerText();
  }

  async addProductRow() {
    await this.page.getByRole('button', { name: '+ Add Product' }).click();
  }

  async fillQuantityInput(inputIndex: number, value: string) {
    await this.page.locator('input[type="number"]').nth(inputIndex).fill(value);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Issue inventory to driver' }).click();
  }

  async expectProductsIssuedSuccessfully(count: number) {
    const label = count === 1 ? '1 product issued to driver successfully.' : `${count} products issued to driver successfully.`;
    await expect(this.page.getByText(label)).toBeVisible();
  }

  async expectError(expectedText: string | RegExp) {
    await expect(this.page.getByText(expectedText)).toBeVisible();
  }

  async getProductNameForRow(rowIndex: number): Promise<string> {
    const select = this.page.locator('select').nth(2 + rowIndex);
    const value = await select.inputValue();
    const optionText = await select.locator(`option[value="${value}"]`).innerText();
    return optionText;
  }
}
