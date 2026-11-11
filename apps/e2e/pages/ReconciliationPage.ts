import { Page, expect } from '@playwright/test';

export class ReconciliationPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/inventory/reconciliation');
  }

  async selectDriverByLabel(label: string) {
    await this.page.getByRole('combobox').selectOption({ label });
    // "Calculating expected inventory…" computes balances for ALL products (a heavy
    // aggregation over inventory_movements) — occasionally takes longer than the default 5s.
    await expect(this.page.getByText('Calculating expected inventory…')).toHaveCount(0, { timeout: 15000 });
  }

  async expectDriverSelectorVisible() {
    const driverSelect = this.page.getByRole('combobox').first();
    await expect(driverSelect).toBeVisible();
    await expect(driverSelect).toContainText('Select driver');
  }

  async expectPhysicalCountLoaded() {
    await expect(this.page.getByRole('heading', { name: 'Physical count' })).toBeVisible();
    await expect(this.page.getByText('EXPECTED').first()).toBeVisible();
  }

  async enterFirstPhysicalCount(value: string) {
    await this.page.getByPlaceholder('Count').first().fill(value);
  }

  async clickReview() {
    await this.page.getByRole('button', { name: 'Review reconciliation' }).click();
  }

  async clickConfirm() {
    await this.page.getByRole('button', { name: 'Confirm reconciliation' }).click();
  }

  async expectConfirmed() {
    await expect(this.page.getByText('Reconciliation confirmed')).toBeVisible();
    await expect(
      this.page.getByText('This physical count is now the trusted inventory baseline.'),
    ).toBeVisible();
  }

  async expectExpectedValueForFirstProduct(value: string | RegExp) {
    await expect(this.page.getByText(value).first()).toBeVisible();
  }

  private firstProductRow() {
    return this.page.locator('.divide-y.divide-latte-200 > div').first();
  }

  async getFirstProductExpectedQuantity(): Promise<number> {
    const text = await this.firstProductRow()
      .locator('.mt-2.text-sm.font-semibold')
      .nth(0)
      .innerText();
    // formatQuantity() in the UI uses toLocaleString() (e.g. "3,605 sleeve") — the comma
    // must be included in the match, otherwise the regex stops at the first digit group and
    // "3,605" becomes 3.
    const match = text.match(/-?[\d,]+/);
    if (!match) {
      throw new Error(`No baseline for the first product ("${text}") — a previously confirmed reconciliation is required.`);
    }
    return parseInt(match[0].replace(/,/g, ''), 10);
  }

  async expectVarianceForFirstProduct(expectedVarianceText: string | RegExp) {
    const varianceLocator = this.firstProductRow().locator('.mt-2.text-sm.font-semibold').nth(1);
    await expect(varianceLocator).toHaveText(expectedVarianceText);
  }

  async expectReviewBlockedWithNoCounts() {
    await this.clickReview();
    await expect(this.page.getByText('Enter at least one physical inventory count.')).toBeVisible();
    // We're still on the entry form, we haven't moved on to the review step.
    await expect(this.page.getByRole('button', { name: 'Review reconciliation' })).toBeVisible();
  }

  async expectNoBaselineForFirstProduct() {
    await expect(this.page.getByText('No baseline').first()).toBeVisible();
  }

  async expectNoBaselineNoteVisible() {
    await expect(
      this.page.getByText('No trusted baseline exists for this product.', { exact: false }).first(),
    ).toBeVisible();
  }

  async enterPhysicalCountForRow(rowIndex: number, value: string) {
    await this.page.getByPlaceholder('Count').nth(rowIndex).fill(value);
  }

  async enterReasonForRow(rowIndex: number, value: string) {
    await this.page.getByPlaceholder('Optional note').nth(rowIndex).fill(value);
  }

  async fillNotes(value: string) {
    await this.page.getByPlaceholder('Optional notes about this physical count').fill(value);
  }

  reviewItems() {
    return this.page.locator('.divide-y.divide-latte-200 > div');
  }

  async expectReviewItemCount(count: number) {
    // "Back to edit" exists ONLY on the review screen (the form's submit button has the same
    // text "Review reconciliation" as the review screen's heading, so that text alone isn't
    // a reliable indicator of having moved to the review step).
    await expect(this.page.getByRole('button', { name: 'Back to edit' })).toBeVisible();
    await expect(this.reviewItems()).toHaveCount(count);
  }

  async expectReviewContainsReason(reasonText: string) {
    await expect(this.page.getByText(reasonText, { exact: false })).toBeVisible();
  }

  async clickBackToEdit() {
    await this.page.getByRole('button', { name: 'Back to edit' }).click();
  }

  async getFirstPhysicalCountValue(): Promise<string> {
    return this.page.getByPlaceholder('Count').first().inputValue();
  }

  async getFirstReasonValue(): Promise<string> {
    return this.page.getByPlaceholder('Optional note').first().inputValue();
  }

  async getNotesValue(): Promise<string> {
    return this.page.getByPlaceholder('Optional notes about this physical count').inputValue();
  }

  async attemptNegativePhysicalCount(value: string): Promise<{ blockedNatively: boolean }> {
    const input = this.page.getByPlaceholder('Count').first();
    await input.fill(value);
    await this.clickReview();
    const isValid = await input.evaluate((el: HTMLInputElement) => el.validity.valid);
    return { blockedNatively: !isValid };
  }
}
