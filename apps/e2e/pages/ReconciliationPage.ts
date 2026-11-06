import { Page, expect } from '@playwright/test';

export class ReconciliationPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/inventory/reconciliation');
  }

  async selectDriverByLabel(label: string) {
    await this.page.getByRole('combobox').selectOption({ label });
    // "Calculating expected inventory…" računa balanse za SVE proizvode (teška agregacija
    // preko inventory_movements) — povremeno traje duže od podrazumevanog 5s.
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
    // formatQuantity() u UI koristi toLocaleString() (npr. "3,605 sleeve") — zarez mora
    // biti uključen u match, inače regex staje na prvoj grupi cifara i "3,605" postaje 3.
    const match = text.match(/-?[\d,]+/);
    if (!match) {
      throw new Error(`Nema baseline za prvi proizvod ("${text}") — potrebna je prethodno potvrđena rekonsilijacija.`);
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
    // I dalje smo na formi za unos, nismo prešli na review korak.
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
    // "Back to edit" postoji SAMO na review ekranu (submit dugme na formi ima isti tekst
    // "Review reconciliation" kao i naslov review ekrana, pa taj tekst sam po sebi nije
    // pouzdan indikator prelaska na review korak).
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
