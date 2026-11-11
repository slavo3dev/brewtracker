import { Page, expect, Locator } from '@playwright/test';

export class RoutesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/routes');
  }

  async getTotalRouteCount(): Promise<number> {
    const text = await this.page.getByText(/Showing \d+ of \d+ routes/).innerText();
    const match = text.match(/of (\d+) routes/);
    return match ? parseInt(match[1], 10) : -1;
  }

  async createOneOffRoute(driverId: string, dateIso: string, notes?: string) {
    await this.page.getByRole('button', { name: 'Create one-off route' }).click();
    await this.page.locator('select[name="driverId"]').selectOption(driverId);
    await this.page.locator('select[name="warehouseId"]').selectOption({ index: 1 });
    await this.page.locator('input[type="date"]').first().fill(dateIso);
    if (notes) {
      await this.page.locator('input[name="notes"]').fill(notes);
    }
    await this.page.getByRole('button', { name: 'Create route' }).click();
  }

  async expectRouteCountIncreasedBy(previousCount: number, increment: number) {
    await expect(this.page.getByText(`of ${previousCount + increment} routes`)).toBeVisible();
  }

  // The metric cards (Routes today, Scheduled, Completed, Stops today) are in a fixed
  // order inside a single grid container — we address them by index to avoid colliding
  // with identically-named text that also appears in the route list below (e.g. the
  // "Scheduled" status).
  private metricCard(index: number) {
    return this.page.locator('.grid.gap-3.sm\\:grid-cols-2.xl\\:grid-cols-4 > div').nth(index);
  }

  private async getMetricValue(index: number): Promise<number> {
    const text = await this.metricCard(index).locator('p').nth(1).innerText();
    return parseInt(text.trim(), 10);
  }

  async getRoutesTodayCount(): Promise<number> {
    return this.getMetricValue(0);
  }

  async getScheduledCount(): Promise<number> {
    return this.getMetricValue(1);
  }

  async getCompletedCount(): Promise<number> {
    return this.getMetricValue(2);
  }

  async getShowingCount(): Promise<number> {
    const text = await this.page.getByText(/Showing \d+ of \d+ routes/).innerText();
    const match = text.match(/Showing (\d+) of/);
    return match ? parseInt(match[1], 10) : -1;
  }

  firstRouteCard() {
    return this.page.locator('article').first();
  }

  async expandFirstRoute() {
    const buttons = this.page.getByRole('button', { name: 'View / manage' });
    // The list sorts ONLY by route_date (no tiebreaker on created_at), so the "first" card
    // isn't reliably the newly-created route when there are several for the same day — every
    // caller MUST first narrow the list down to EXACTLY its own route (e.g.
    // searchRoutes(noteTag)) before this call. This check enforces that: if the narrowing is
    // missing, the test fails loudly right here, instead of silently mutating the wrong
    // route.
    await expect(buttons).toHaveCount(1);
    await buttons.first().click();
  }

  async getFirstRouteStatus(): Promise<string> {
    const text = await this.firstRouteCard()
      .locator('span.rounded-full.capitalize')
      .innerText();
    return text.trim();
  }

  // The list is (likely) also sorted by status, not just by creation time — as soon as the
  // status changes (e.g. by cancelling), that route may move away from the "first" position.
  // So we track the SPECIFIC expanded card via its "Hide details" button (which only it has),
  // not its position.
  expandedRouteCard() {
    return this.page.locator('article').filter({ has: this.page.getByRole('button', { name: 'Hide details' }) });
  }

  async cancelExpandedRoute() {
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.expandedRouteCard().getByRole('button', { name: 'Cancel route' }).click();
  }

  async dismissCancelExpandedRoute() {
    this.page.once('dialog', (dialog) => dialog.dismiss());
    await this.expandedRouteCard().getByRole('button', { name: 'Cancel route' }).click();
  }

  createOneOffRouteToggle() {
    return this.page.getByRole('button', { name: /^(Create one-off route|Close)$/ });
  }

  async expectCreateFormOpen() {
    await expect(this.createOneOffRouteToggle()).toHaveText('Close');
  }

  async expectCreateFormClosed() {
    await expect(this.createOneOffRouteToggle()).toHaveText('Create one-off route');
  }

  statusFilterSelect() {
    return this.page.getByLabel('Filter by status');
  }

  async getStatusFilterOptions(): Promise<string[]> {
    return this.statusFilterSelect()
      .locator('option')
      .allInnerTexts()
      .then((opts) => opts.filter((o) => o !== 'All statuses'));
  }


  async openAddStopForm() {
    // The button that opens the form ("Add stop" toggle, type="button") stays open after the
    // first stop is added and changes its label to "Close form" — the form ALSO has its OWN
    // submit button with the text "Add stop" (type="submit"), so relying on the text alone
    // sometimes hits the wrong button. If the client select is already visible, the form is
    // already open — don't touch the toggle (clicking it would close it).
    if (await this.clientSelect().isVisible().catch(() => false)) {
      return;
    }
    await this.expandedRouteCard().locator('button[type="button"]', { hasText: 'Add stop' }).click();
  }

  private clientSelect() {
    return this.page.getByRole('combobox').filter({ has: this.page.locator('option', { hasText: 'Select client' }) });
  }

  private machineSelect() {
    return this.page
      .getByRole('combobox')
      .filter({ has: this.page.locator('option', { hasText: /Select a client first|No machine selected/ }) });
  }

  async expectMachineRequiresClientFirst() {
    await expect(this.machineSelect()).toHaveText('Select a client first');
  }

  async selectStopClient(label: string) {
    await this.clientSelect().selectOption({ label });
  }

  async selectStopMachine(label: string) {
    await this.machineSelect().selectOption({ label });
  }

  async submitAddStopForm() {
    await this.page.getByRole('button', { name: 'Add stop', exact: true }).click();
  }

  async addStopToExpandedRoute(clientLabel: string, machineLabel: string) {
    const stopsBefore = await this.getStopCountInExpandedCard();
    await this.openAddStopForm();
    await this.selectStopClient(clientLabel);
    await this.selectStopMachine(machineLabel);
    await this.submitAddStopForm();
    // Waiting for the transient "Adding stop..." text to DISAPPEAR is unreliable — the
    // assertion can pass BEFORE that text even appears (the click hasn't reached a React
    // re-render yet), making the test think it's done while the request has only just
    // started. Instead we wait for the stop COUNT to actually increase (there's one Remove
    // button per stop).
    await expect(
      this.expandedRouteCard().getByRole('button', { name: /^Remove /, exact: false }),
    ).toHaveCount(stopsBefore + 1);
  }

  async expectCancelRejected(expectedMessage: string) {
    await expect(this.expandedRouteCard().getByText(expectedMessage)).toBeVisible();
  }

  async getMachineOptionLabels(): Promise<string[]> {
    return this.machineSelect().locator('option').allInnerTexts();
  }

  async clearDateFilter() {
    await this.page.locator('input[type="date"]').fill('');
  }

  async filterByStatus(status: 'cancelled' | 'completed' | 'in_progress' | 'scheduled') {
    await this.page.getByRole('combobox', { name: /status/i }).selectOption(status);
  }

  // The Cancel route button exists in the DOM ONLY when the card is expanded (isExpanded)
  // AND the route is "scheduled" (canCancel) — checking ONLY the first card could miss a
  // regression that hit some (not all) routes of that status, if the "first" card happens
  // to be a correct one. This method expands EVERY visible card (one at a time, to avoid
  // ambiguity around the "View / manage" button) and checks that the Cancel button is
  // absent from each of them.
  async expectNoCancelButtonOnAnyVisibleRoute() {
    const cards = this.page.locator('article');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await card.getByRole('button', { name: 'View / manage' }).click();
      await expect(card.getByRole('button', { name: 'Cancel route' })).toHaveCount(0);
    }
  }

  async attemptCreateRouteWithoutRequiredFields() {
    await this.page.getByRole('button', { name: 'Create one-off route' }).click();
    await this.page.getByRole('button', { name: 'Create route' }).click();
  }

  async expectRequiredFieldInvalid(fieldName: 'driverId' | 'warehouseId') {
    const select = this.page.locator(`select[name="${fieldName}"]`);
    await expect.poll(() => select.evaluate((el: HTMLSelectElement) => el.validity.valid)).toBe(false);
  }

  async searchRoutes(text: string) {
    await this.page.getByPlaceholder('Search routes').fill(text);
  }

  async expectAllVisibleCardsContain(text: string) {
    const cards = this.page.locator('article');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).toContainText(text, { ignoreCase: true });
    }
  }

  async setDateFilter(dateIso: string) {
    await this.page.locator('input[type="date"]').fill(dateIso);
  }

  async expectResetToTodayVisible() {
    await expect(this.page.getByRole('button', { name: 'Reset to today' })).toBeVisible();
  }

  async clickResetToToday() {
    await this.page.getByRole('button', { name: 'Reset to today' }).click();
  }

  async expectEmptyState() {
    await expect(this.page.getByText('No routes found')).toBeVisible();
    await expect(this.page.getByText('No operational routes match the selected filters.')).toBeVisible();
  }

  paginationNav() {
    return this.page.getByRole('navigation', { name: 'Route pagination' });
  }

  async expectPaginationVisible() {
    await expect(this.paginationNav()).toBeVisible();
  }

  async expectPreviousDisabled() {
    await expect(this.paginationNav().getByRole('button', { name: 'Previous' })).toBeDisabled();
  }

  async clickNextPage() {
    await this.paginationNav().getByRole('button', { name: 'Next' }).click();
  }

  async getPaginationLabel(): Promise<string> {
    return this.paginationNav().locator('p').innerText();
  }

  async expectOneOffBadge(card: Locator) {
    await expect(card.getByText('One-off', { exact: true })).toBeVisible();
  }

  async expectRecurringBadge(card: Locator) {
    await expect(card.getByText('Recurring', { exact: true })).toBeVisible();
  }

  async expectMapPreviewMissingMessage() {
    await expect(
      this.expandedRouteCard().getByText(
        'Add at least two stops with client coordinates to preview directions.',
      ),
    ).toBeVisible();
  }

  async attemptRemoveFirstStopAndDismiss() {
    const card = this.expandedRouteCard();
    let dialogMessage = '';
    this.page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.dismiss();
    });
    await card.getByRole('button', { name: /^Remove /, exact: false }).first().click();
    return dialogMessage;
  }

  async removeFirstStopAndConfirm() {
    const card = this.expandedRouteCard();
    this.page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: /^Remove /, exact: false }).first().click();
  }

  async expectStopRemoved() {
    // When the LAST stop is removed, the "Stop removed." message lives inside the StopRow
    // component, which is removed from the DOM at that same moment (sortedStops becomes
    // empty), so that text can't be reliably caught — checking the final state instead of
    // the transient message.
    await expect(
      this.expandedRouteCard().getByText('No stops yet. Add the first stop to this route.'),
    ).toBeVisible();
  }

  async getStopCountInExpandedCard(): Promise<number> {
    return this.expandedRouteCard().getByRole('button', { name: /^Remove /, exact: false }).count();
  }

  async expectAddStopDisabled() {
    // The same open/close form button changes its label based on local React state ("Add
    // stop" / "Close form") — if the form was previously opened during the same page
    // session, the label stays "Close form" even after the route moves into a state where
    // stops can no longer be managed.
    await expect(
      this.expandedRouteCard().getByRole('button', { name: /^(Add stop|Close form)$/ }),
    ).toBeDisabled();
  }

  async expectStopControlsDisabledFor(clientName: string) {
    const form = this.page.locator('form').filter({ has: this.page.getByLabel(`Order for ${clientName}`) });
    await expect(form.getByLabel(`Order for ${clientName}`)).toBeDisabled();
    await expect(form.getByRole('button', { name: 'Update order' })).toBeDisabled();
    await expect(
      this.expandedRouteCard().getByRole('button', { name: `Remove ${clientName}` }),
    ).toBeDisabled();
  }

  async expectCancelledHistoricalMessage() {
    await expect(
      this.expandedRouteCard().getByText(
        'This route has been cancelled and remains available for historical reference.',
      ),
    ).toBeVisible();
  }

  async setStopOrder(clientName: string, value: string) {
    const form = this.page.locator('form').filter({ has: this.page.getByLabel(`Order for ${clientName}`) });
    await form.getByLabel(`Order for ${clientName}`).fill(value);
    await form.getByRole('button', { name: 'Update order' }).click();
  }

  async expectStopOrderUpdated() {
    await expect(this.expandedRouteCard().getByText('Stop order updated.')).toBeVisible();
  }

  async expectSequenceInvalid() {
    await expect(this.expandedRouteCard().getByText('Valid stop sequence is required.')).toBeVisible();
  }

  async getStopClientNamesInOrder(): Promise<string[]> {
    // The "Route map preview" heading shares the same CSS classes (text-sm font-medium
    // text-espresso-950) with the client name in StopRow, so the locator must be narrowed to
    // the stop-list container.
    return this.expandedRouteCard()
      .locator('div.mt-4.grid.gap-3 p.font-medium.text-espresso-950')
      .allInnerTexts();
  }
}
