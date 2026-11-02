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

  // Metrika kartice (Routes today, Scheduled, Completed, Stops today) su u fiksnom
  // redosledu u jednom grid kontejneru — adresiramo po indeksu da izbegnemo konflikt
  // sa istoimenim tekstom koji se pojavljuje i u listi ruta ispod (npr. status "Scheduled").
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
    await this.page.getByRole('button', { name: 'View / manage' }).first().click();
  }

  async getFirstRouteStatus(): Promise<string> {
    const text = await this.firstRouteCard()
      .locator('span.rounded-full.capitalize')
      .innerText();
    return text.trim();
  }

  // Lista se sortira (verovatno) i po statusu, ne samo po vremenu kreiranja — čim se status
  // promeni (npr. otkazivanjem), ta ruta se može pomeriti sa pozicije "prva". Zato pratimo
  // KONKRETNU otvorenu karticu preko dugmeta "Hide details" (koje ima samo ona), ne poziciju.
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
    // Dugme za otvaranje forme ("Add stop" toggle, type="button") posle prvog dodavanja stanice
    // ostaje otvoreno i menja oznaku na "Close form" — forma ima I SVOJ submit dugme sa tekstom
    // "Add stop" (type="submit"), pa oslanjanje na sam tekst nekad pogodi pogrešno dugme.
    // Ako je klijent-selekt već vidljiv, forma je već otvorena — ne diraj toggle (klik bi je zatvorio).
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
    // Čekanje da transientni tekst "Adding stop..." NESTANE je nepouzdano — assert može proći
    // PRE nego što se taj tekst uopšte pojavi (klik još nije stigao do React re-rendera), pa test
    // misli da je završeno dok zahtev tek kreće. Umesto toga čekamo da se BROJ stanica stvarno
    // poveća (Remove dugme postoji po jedno za svaku stanicu).
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

  async expectNoCancelButtonOnFirstRoute() {
    await this.expandFirstRoute();
    await expect(this.firstRouteCard().getByRole('button', { name: 'Cancel route' })).toHaveCount(0);
  }

  async attemptCreateRouteWithoutRequiredFields() {
    await this.page.getByRole('button', { name: 'Create one-off route' }).click();
    await this.page.getByRole('button', { name: 'Create route' }).click();
  }

  async expectRequiredFieldInvalid(fieldName: 'driverId' | 'warehouseId') {
    await expect(this.page.locator(`select[name="${fieldName}"]`)).toHaveJSProperty('validity.valid', false);
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
    // Kad se ukloni POSLEDNJA stanica, "Stop removed." poruka živi unutar StopRow
    // komponente koja se u istom trenutku uklanja iz DOM-a (sortedStops postaje praz),
    // pa taj tekst nije pouzdano uhvatljiv — provera krajnjeg stanja umesto tranzientne poruke.
    await expect(
      this.expandedRouteCard().getByText('No stops yet. Add the first stop to this route.'),
    ).toBeVisible();
  }

  async getStopCountInExpandedCard(): Promise<number> {
    return this.expandedRouteCard().getByRole('button', { name: /^Remove /, exact: false }).count();
  }

  async expectAddStopDisabled() {
    // Isto dugme za otvaranje/zatvaranje forme menja oznaku na osnovu lokalnog React stanja
    // ("Add stop" / "Close form") — ako je forma ranije bila otvorena u istoj sesiji stranice,
    // oznaka ostaje "Close form" i nakon što ruta pređe u stanje gde se stanicama ne može upravljati.
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
    // "Route map preview" naslov deli iste CSS klase (text-sm font-medium text-espresso-950) sa
    // imenom klijenta u StopRow-u, pa se locator mora suziti na kontejner liste stanica.
    return this.expandedRouteCard()
      .locator('div.mt-4.grid.gap-3 p.font-medium.text-espresso-950')
      .allInnerTexts();
  }
}
