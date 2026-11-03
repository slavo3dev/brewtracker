import { Page, expect, Locator } from '@playwright/test';

export class RouteTemplatesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/routes/templates');
  }

  private card(templateName: string): Locator {
    return this.page
      .locator('article')
      .filter({ has: this.page.getByRole('heading', { name: templateName, exact: true }) });
  }

  async ensureInactive(templateName: string) {
    const card = this.card(templateName);
    const deactivateButton = card.getByRole('button', { name: 'Deactivate' });
    if (await deactivateButton.isVisible().catch(() => false)) {
      await deactivateButton.click();
      await expect(card.getByText('Inactive', { exact: true })).toBeVisible();
    }
  }

  async ensureHasServiceDay(templateName: string, day: string) {
    const card = this.card(templateName);
    const noDaysNotice = card.getByText('No service days selected');
    if (!(await noDaysNotice.isVisible().catch(() => false))) return;

    await card.getByRole('button', { name: 'Edit' }).click();
    // Checkbox je vizuelno sakriven (sr-only); klik na roditeljski <label> je prirodnija
    // i pouzdanija interakcija od force-click-a na sam input (pokazalo se krhko u --headed modu).
    // "has" filter MORA biti izgrađen iz page.locator (ne card.locator) — card.locator već nosi
    // pun "article >> ..." prefiks, pa bi ugnježdeni has-selektor tražio <article> UNUTAR <label>,
    // što nikad ne postoji i izaziva beskonačno čekanje do test timeout-a.
    await card.locator('label').filter({ has: this.page.locator(`input[name="${day}"]`) }).click();
    await card.getByRole('button', { name: 'Save Changes' }).click();
    await expect(noDaysNotice).not.toBeVisible();
  }

  async activate(templateName: string) {
    await this.card(templateName).getByRole('button', { name: 'Activate' }).click();
  }

  async deactivate(templateName: string) {
    await this.card(templateName).getByRole('button', { name: 'Deactivate' }).click();
  }

  async toggleServiceDay(templateName: string, day: string) {
    const card = this.card(templateName);
    await card.locator('label').filter({ has: card.locator(`input[name="${day}"]`) }).click();
  }

  async getMetrics(): Promise<{ total: number; active: number; inactive: number }> {
    const values = await this.page
      .locator('.mt-6.grid.gap-3.sm\\:grid-cols-3 > div p.mt-2')
      .allInnerTexts();
    return {
      total: parseInt(values[0], 10),
      active: parseInt(values[1], 10),
      inactive: parseInt(values[2], 10),
    };
  }

  async expectActive(templateName: string) {
    await expect(this.card(templateName).getByText('Active', { exact: true })).toBeVisible({ timeout: 10000 });
  }

  async expectInactive(templateName: string) {
    await expect(this.card(templateName).getByText('Inactive', { exact: true })).toBeVisible({ timeout: 10000 });
  }

  async expectActivationError(templateName: string, expectedText: string) {
    await expect(this.card(templateName).getByRole('alert').getByText(expectedText)).toBeVisible({ timeout: 10000 });
  }

  async createTemplate(options: { name: string; weekday?: string; driverId?: string }) {
    await this.page.locator('input[name="name"]').fill(options.name);
    if (options.driverId) {
      await this.page.locator('select[name="driverId"]').selectOption(options.driverId);
    } else {
      await this.page.locator('select[name="driverId"]').selectOption({ index: 1 });
    }
    await this.page.locator('select[name="warehouseId"]').selectOption({ index: 1 });
    if (options.weekday) {
      await this.page
        .locator('label')
        .filter({ has: this.page.locator(`input[name="${options.weekday}"]`) })
        .click();
    }
    await this.page.getByRole('button', { name: 'Create Template' }).click();
    // Malo duži timeout od podrazumevanog 5s — ovo je realan server round-trip (server
    // action + revalidate) koji povremeno traje duže pod opterećenjem staging servera.
    await expect(
      this.page.getByRole('status').getByText('Route template created. Add at least one stop before activating it.'),
    ).toBeVisible({ timeout: 10000 });
  }

  async addOneOffStopException(
    templateName: string,
    options: { dateIso: string; clientLabel: string },
  ) {
    const card = this.card(templateName);
    await card.getByRole('button', { name: 'Stop Exception', exact: false }).click();
    await card.locator('input[name="exceptionDate"]').fill(options.dateIso);
    await card.locator('select[name="clientId"]').selectOption({ label: options.clientLabel });
    await card.getByRole('button', { name: 'Add one-off stop' }).click();
    await expect(card.getByText('One-off stop added.')).toBeVisible();
  }

  async expectStopExceptionListed(templateName: string, dateLabel: string) {
    const card = this.card(templateName);
    const row = card.locator('div', { hasText: dateLabel }).filter({ hasText: 'One-off stop' });
    await expect(row.first()).toBeVisible();
  }

  async switchToRemoveRecurringStopMode(templateName: string) {
    const card = this.card(templateName);
    await card.getByRole('button', { name: 'Stop Exception', exact: false }).click();
    await card.getByLabel('Stop exception').selectOption({ label: 'Remove recurring stop' });
  }

  async expectRemoveRecurringStopDisabledEmpty(templateName: string) {
    const card = this.card(templateName);
    await expect(card.getByText('This template has no recurring stops to remove.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Remove stop for date' })).toBeDisabled();
  }

  async removeRecurringStopException(
    templateName: string,
    options: { dateIso: string; stopLabel: string },
  ) {
    const card = this.card(templateName);
    await card.getByRole('button', { name: 'Stop Exception', exact: false }).click();
    await card.getByLabel('Stop exception').selectOption({ label: 'Remove recurring stop' });

    await card.locator('input[name="exceptionDate"]').fill(options.dateIso);
    await card
      .locator('select[name="routeTemplateStopId"]')
      .selectOption({ label: options.stopLabel });
    await card.getByRole('button', { name: 'Remove stop for date' }).click();
    await expect(card.getByText('Recurring stop removed for this date.')).toBeVisible();
  }

  async expectRecurringStopRemovedListed(templateName: string, dateLabel: string) {
    const card = this.card(templateName);
    const row = card.locator('div', { hasText: dateLabel }).filter({ hasText: 'Recurring stop removed' });
    await expect(row.first()).toBeVisible();
  }

  async addStop(templateName: string, clientLabel: string, machineLabel?: string) {
    const card = this.card(templateName);
    await card.getByRole('button', { name: '+ Add Stop' }).click();
    await card.locator('select[name="clientId"]').selectOption({ label: clientLabel });
    if (machineLabel) {
      await card.locator('select[name="machineId"]').selectOption({ label: machineLabel });
    }
    await card.getByRole('button', { name: 'Add Stop', exact: true }).click();
    await expect(card.getByText('Stop added to route template.')).toBeVisible({ timeout: 10000 });
  }

  async attemptAddStop(templateName: string, clientLabel: string, machineLabel?: string) {
    const card = this.card(templateName);
    // Forma ostaje otvorena nakon prethodnog uspešnog addStop() poziva na istoj kartici
    // (dugme se tada zove "Cancel", ne "+ Add Stop") — otvori je samo ako već nije otvorena,
    // inače klik na nepostojeće "+ Add Stop" dugme visi do test timeout-a.
    const openToggle = card.getByRole('button', { name: '+ Add Stop' });
    if (await openToggle.isVisible().catch(() => false)) {
      await openToggle.click();
    }
    await card.locator('select[name="clientId"]').selectOption({ label: clientLabel });
    if (machineLabel) {
      await card.locator('select[name="machineId"]').selectOption({ label: machineLabel });
    }
    await card.getByRole('button', { name: 'Add Stop', exact: true }).click();
  }

  async expectRemoveStopDisabled(templateName: string, tooltipText: string) {
    const card = this.card(templateName);
    const removeButton = card.getByRole('button', { name: 'Remove', exact: true });
    await expect(removeButton).toBeDisabled();
    await expect(removeButton).toHaveAttribute('title', tooltipText);
  }

  async removeStop(templateName: string) {
    const card = this.card(templateName);
    const removeButtons = card.getByRole('button', { name: 'Remove', exact: true });
    const before = await removeButtons.count();
    await removeButtons.first().click();
    // Kad se ukloni POSLEDNJA stanica, "Stop removed..." poruka živi unutar TemplateStopRow
    // komponente koja se u istom trenutku uklanja iz DOM-a (lista postaje prazna) — ista
    // zamka kao kod uklanjanja stanica na rutama (web-routes.spec.ts WEB-RT-14). Umesto te
    // tranzijentne poruke, čekamo da se broj Remove dugmadi stvarno smanji.
    await expect(removeButtons).toHaveCount(before - 1, { timeout: 10000 });
  }

  async expectNoStopsConfigured(templateName: string) {
    await expect(this.card(templateName).getByText('No stops configured')).toBeVisible();
  }

  async expectDeleteButtonVisible(templateName: string) {
    await expect(this.card(templateName).getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  }

  async attemptAddStopWithTimes(
    templateName: string,
    clientLabel: string,
    machineLabel: string | undefined,
    startTime: string,
    endTime: string,
  ) {
    const card = this.card(templateName);
    const openToggle = card.getByRole('button', { name: '+ Add Stop' });
    if (await openToggle.isVisible().catch(() => false)) {
      await openToggle.click();
    }
    await card.locator('select[name="clientId"]').selectOption({ label: clientLabel });
    if (machineLabel) {
      await card.locator('select[name="machineId"]').selectOption({ label: machineLabel });
    }
    await card.locator('input[name="scheduledStartTime"]').fill(startTime);
    await card.locator('input[name="scheduledEndTime"]').fill(endTime);
    await card.getByRole('button', { name: 'Add Stop', exact: true }).click();
  }

  async expectAddStopError(templateName: string, text: string) {
    await expect(this.card(templateName).getByRole('alert').getByText(text)).toBeVisible({ timeout: 10000 });
  }

  async getStopFormMachineOptionsForClient(templateName: string, clientLabel: string): Promise<string[]> {
    const card = this.card(templateName);
    const openToggle = card.getByRole('button', { name: '+ Add Stop' });
    if (await openToggle.isVisible().catch(() => false)) {
      await openToggle.click();
    }
    await card.locator('select[name="clientId"]').selectOption({ label: clientLabel });
    return card.locator('select[name="machineId"] option').allInnerTexts();
  }

  async openEdit(templateName: string) {
    const card = this.card(templateName);
    const toggle = card.getByRole('button', { name: /^(Edit|Close Edit)$/ });
    if ((await toggle.innerText()) === 'Edit') {
      await toggle.click();
    }
    return card;
  }

  async uncheckAllServiceDays(templateName: string) {
    const card = await this.openEdit(templateName);
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      const checkbox = card.locator(`input[name="${day}"]`);
      if (await checkbox.isChecked()) {
        // Klik na <label> je ovde (u Edit formi, duboko u dugoj listi template-a) pokazao
        // nepouzdano visio na actionability proveri — direktan .uncheck({force:true}) na sam
        // sr-only input zaobilazi tu proveru i pouzdano menja stanje.
        await checkbox.uncheck({ force: true });
      }
    }
  }

  async toggleEditServiceDay(templateName: string, day: string) {
    const card = await this.openEdit(templateName);
    const checkbox = card.locator(`input[name="${day}"]`);
    if (await checkbox.isChecked()) {
      await checkbox.uncheck({ force: true });
    } else {
      await checkbox.check({ force: true });
    }
  }

  async saveEdit(templateName: string) {
    await this.card(templateName).getByRole('button', { name: 'Save Changes' }).click();
  }

  async expectEditError(templateName: string, text: string) {
    await expect(this.card(templateName).getByRole('alert').getByText(text)).toBeVisible({ timeout: 10000 });
  }

  async deleteTemplate(templateName: string) {
    const card = this.card(templateName);
    this.page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Delete', exact: true }).click();
  }

  // Brisanje ne radi redirect (samo revalidatePath), pa je nepouzdano gađati tranzijentnu
  // poruku na istoj stranici — umesto toga ponovo učitavamo stranicu dok se kartica stvarno
  // ne skloni sa liste (server akcija možda još nije završila kad ovo prvi put proverimo).
  async expectTemplateNotListed(templateName: string) {
    // Broj template-a na ovoj stranici je kroz sesiju narastao na 150+ (svaki renderuje pun
    // card sa Stops/Exceptions sekcijama) — goto() + render povremeno traje duže od ranijeg
    // 10s budžeta za CEO retry petlju.
    await expect(async () => {
      await this.goto();
      await expect(this.card(templateName)).toHaveCount(0);
    }).toPass({ timeout: 20000 });
  }

  async expectNoDeleteButton(templateName: string) {
    await expect(this.card(templateName).getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  }

  private async openAddException(templateName: string) {
    const card = this.card(templateName);
    const openToggle = card.getByRole('button', { name: '+ Add Exception' });
    if (await openToggle.isVisible().catch(() => false)) {
      await openToggle.click();
    }
    return card;
  }

  async addSkipException(templateName: string, dateIso: string) {
    const card = await this.openAddException(templateName);
    await card.locator('input[name="exceptionDate"]').fill(dateIso);
    // "Skip route" je podrazumevana vrednost moda, ne mora eksplicitno da se bira.
    await card.getByRole('button', { name: 'Add exception' }).click();
    await expect(card.getByText('Route exception saved.')).toBeVisible({ timeout: 10000 });
  }

  async attemptDriverExceptionWithoutDriver(templateName: string, dateIso: string) {
    const card = await this.openAddException(templateName);
    await card.locator('input[name="exceptionDate"]').fill(dateIso);
    await card.locator('select[name="mode"]').selectOption({ label: 'Replace driver' });
    const driverSelect = card.locator('select[name="overrideDriverId"]');
    await card.getByRole('button', { name: 'Add exception' }).click();
    return driverSelect;
  }

  async addDriverException(templateName: string, dateIso: string) {
    const card = await this.openAddException(templateName);
    await card.locator('input[name="exceptionDate"]').fill(dateIso);
    await card.locator('select[name="mode"]').selectOption({ label: 'Replace driver' });
    await card.locator('select[name="overrideDriverId"]').selectOption({ index: 1 });
    await card.getByRole('button', { name: 'Add exception' }).click();
    await expect(card.getByText('Route exception saved.')).toBeVisible({ timeout: 10000 });
  }

  exceptionRow(templateName: string, dateLabel: string, badgeText: string): Locator {
    // Stops lista, Schedule Exceptions lista I Stop exceptions lista sve koriste IDENTIČNE
    // kontejnerske CSS klase (divide-y/rounded-xl/border...) — ne mogu se razlikovati po klasi
    // kontejnera. Umesto toga ciljamo direktno LEAF red (".p-4", isti na sve tri liste) i
    // oslanjamo se na to da je badgeText ("Route skipped"/"Driver override") jedinstven
    // rečnik samo za schedule exceptions, pa filter sam po sebi isključuje redove iz druge
    // dve liste bez potrebe za preciznim skopovanjem kontejnera.
    return this.card(templateName)
      .locator('div.p-4')
      .filter({ hasText: dateLabel })
      .filter({ hasText: badgeText });
  }

  async expectExceptionRowVisible(templateName: string, dateLabel: string, badgeText: string) {
    // "QA Conflict E" je deljeni fixture koji je kroz sesiju nagomilao desetine stop-exception
    // redova — veći DOM povremeno traje duže od podrazumevanog 5s da se stabilizuje/renderuje.
    await expect(this.exceptionRow(templateName, dateLabel, badgeText).first()).toBeVisible({ timeout: 10000 });
  }

  async removeException(templateName: string, dateLabel: string, badgeText: string) {
    const row = this.exceptionRow(templateName, dateLabel, badgeText).first();
    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(this.exceptionRow(templateName, dateLabel, badgeText)).toHaveCount(0, { timeout: 10000 });
  }

  async expectExceptionRowNotVisible(templateName: string, dateLabel: string, badgeText: string) {
    await expect(this.exceptionRow(templateName, dateLabel, badgeText)).toHaveCount(0);
  }
}
