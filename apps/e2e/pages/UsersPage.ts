import { Page, expect } from '@playwright/test';

export class UsersPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/users');
  }

  async openAddUserForm() {
    await this.page.getByRole('button', { name: 'Add user' }).click();
  }

  async fillAndSubmit(user: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    region: string;
    role: 'driver' | 'tech' | 'manager' | 'ceo';
  }) {
    await this.page.locator('input[name="fullName"]').fill(user.fullName);
    await this.page.locator('input[name="email"]').fill(user.email);
    await this.page.locator('input[name="phone"]').fill(user.phone);
    await this.page.locator('input[name="address"]').fill(user.address);
    await this.page.locator('input[name="region"]').fill(user.region);
    await this.page.locator('select[name="role"]').selectOption(user.role);
    await this.page.getByRole('button', { name: 'Create user and send setup email' }).click();
  }

  async expectUserCreatedAndEmailSent() {
    await expect(this.page.getByText('User created and password setup email sent.')).toBeVisible();
  }

  async attemptSubmitWithoutFullName(email: string) {
    await this.page.locator('input[name="email"]').fill(email);
    await this.page.getByRole('button', { name: 'Create user and send setup email' }).click();
  }

  fullNameField() {
    return this.page.locator('input[name="fullName"]');
  }

  userCard(identifier: string) {
    return this.page.locator('article').filter({ hasText: identifier });
  }

  async expandUser(identifier: string) {
    const card = this.userCard(identifier);
    await card.getByRole('button', { name: 'View / manage' }).click();
  }

  async toggleActiveStatus(identifier: string, fullName: string, expectedAction: 'Activate' | 'Deactivate') {
    const card = this.userCard(identifier);
    let dialogMessage = '';
    this.page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.accept();
    });
    await card.getByRole('button', { name: `${expectedAction} user` }).click();
    expect(dialogMessage).toBe(`${expectedAction} ${fullName}?`);
  }

  async expectActiveStatus(identifier: string, expected: 'Active' | 'Inactive') {
    await expect(this.userCard(identifier).getByText(expected, { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
  }

  async editUserDetails(
    identifier: string,
    values: { fullName?: string; phone?: string; address?: string; region?: string; role?: string },
  ) {
    const card = this.userCard(identifier);
    if (values.fullName !== undefined) {
      await card.locator('input[name="fullName"]').fill(values.fullName);
    }
    if (values.phone !== undefined) {
      await card.locator('input[name="phone"]').fill(values.phone);
    }
    if (values.address !== undefined) {
      await card.locator('input[name="address"]').fill(values.address);
    }
    if (values.region !== undefined) {
      await card.locator('input[name="region"]').fill(values.region);
    }
    if (values.role !== undefined) {
      await card.locator('select[name="role"]').selectOption(values.role);
    }
    await card.getByRole('button', { name: 'Save changes' }).click();
    await expect(card.getByText('User updated.')).toBeVisible({ timeout: 10000 });
  }

  async search(query: string) {
    await this.page.getByPlaceholder('Search users').fill(query);
  }

  async filterByRole(role: 'driver' | 'tech' | 'manager' | 'ceo' | '') {
    await this.page.getByLabel('Filter by role').selectOption(role);
  }

  async filterByStatus(status: 'true' | 'false' | '') {
    await this.page.getByLabel('Filter by account status').selectOption(status);
  }

  async filterByRegion(region: string) {
    await this.page.getByLabel('Filter by region').selectOption(region);
  }

  async getVisibleUserCount(): Promise<number> {
    return this.page.locator('article').count();
  }

  async getShowingCountText(): Promise<string> {
    return this.page.getByText(/Showing \d+ of \d+ users/).innerText();
  }

  async attemptClearFullNameAndSave(identifier: string) {
    const card = this.userCard(identifier);
    await card.locator('input[name="fullName"]').fill('');
    await card.getByRole('button', { name: 'Save changes' }).click();
  }

  async sendPasswordReset(identifier: string, email: string): Promise<string> {
    const card = this.userCard(identifier);
    let dialogMessage = '';
    this.page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.accept();
    });
    await card.getByRole('button', { name: 'Send password reset' }).click();
    return dialogMessage;
  }

  async expectPasswordResetSent(identifier: string) {
    await expect(this.userCard(identifier).getByText('Password reset email sent.')).toBeVisible({ timeout: 10000 });
  }

  async getAddFormRoleDefault(): Promise<string> {
    return this.page.locator('select[name="role"]').inputValue();
  }

  async expectNoUsersMessage() {
    await expect(this.page.getByText('No users match the selected filters.')).toBeVisible();
  }

  pagination() {
    return this.page.getByRole('navigation', { name: 'User pagination' });
  }

  async getPageIndicatorText(): Promise<string> {
    return this.pagination().getByText(/Page \d+ of \d+/).innerText();
  }

  async clickNextPage() {
    await this.pagination().getByRole('button', { name: 'Next' }).click();
  }

  async clickPreviousPage() {
    await this.pagination().getByRole('button', { name: 'Previous' }).click();
  }

  async expectSendPasswordResetDisabled(identifier: string) {
    await expect(this.userCard(identifier).getByRole('button', { name: 'Send password reset' })).toBeDisabled();
  }

  async getUserDetails(identifier: string): Promise<{
    fullName: string;
    phone: string;
    address: string;
    region: string;
    role: string;
  }> {
    const card = this.userCard(identifier);
    return {
      fullName: await card.locator('input[name="fullName"]').inputValue(),
      phone: await card.locator('input[name="phone"]').inputValue(),
      address: await card.locator('input[name="address"]').inputValue(),
      region: await card.locator('input[name="region"]').inputValue(),
      role: await card.locator('select[name="role"]').inputValue(),
    };
  }
}
