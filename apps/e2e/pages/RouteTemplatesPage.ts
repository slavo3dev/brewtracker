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
    // The checkbox is visually hidden (sr-only); clicking the parent <label> is a more
    // natural and reliable interaction than a force-click on the input itself (shown to be
    // flaky in --headed mode). The "has" filter MUST be built from page.locator (not
    // card.locator) — card.locator already carries the full "article >> ..." prefix, so a
    // nested has-selector would look for an <article> INSIDE the <label>, which never exists
    // and causes an endless wait until the test times out.
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
    await expect(this.card(templateName).getByText('Active', { exact: true })).toBeVisible({ timeout: 20000 });
  }

  async expectInactive(templateName: string) {
    await expect(this.card(templateName).getByText('Inactive', { exact: true })).toBeVisible({ timeout: 20000 });
  }

  async expectActivationError(templateName: string, expectedText: string) {
    await expect(this.card(templateName).getByRole('alert').getByText(expectedText)).toBeVisible({ timeout: 20000 });
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
    // Slightly longer timeout than the default 5s — this is a real server round-trip (server
    // action + revalidate) that occasionally takes longer under load on the staging server.
    // The file is large enough (30+ tests, many creating their own template) that 10s is
    // occasionally not enough.
    await expect(
      this.page.getByRole('status').getByText('Route template created. Add at least one stop before activating it.'),
    ).toBeVisible({ timeout: 25000 });
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
    // Same pattern as addStop(): the file is large enough (29 tests) that under load
    // (the shared database having grown over time) the default 5s timeout on the success
    // message occasionally runs out.
    await expect(card.getByText('One-off stop added.')).toBeVisible({ timeout: 15000 });
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
    await expect(card.getByText('Stop added to route template.')).toBeVisible({ timeout: 15000 });
  }

  async attemptAddStop(templateName: string, clientLabel: string, machineLabel?: string) {
    const card = this.card(templateName);
    // The form stays open after a previous successful addStop() call on the same card
    // (the button is then called "Cancel", not "+ Add Stop") — only open it if it isn't
    // already open, otherwise clicking the nonexistent "+ Add Stop" button hangs until the
    // test times out.
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
    // FIX: the button's text changes to "Removing..." THE INSTANT it's clicked (deletePending
    // becomes true synchronously, before any server round-trip — see route-template-card.tsx)
    // — that means the count of buttons with the EXACT name "Remove" drops to before-1
    // IMMEDIATELY, regardless of whether the server action has even finished (let alone
    // succeeded). The old check below would have passed even if the server action silently
    // failed. We first wait for the pending state to ACTUALLY clear (the action has
    // finished), and only then check the final count — the same pattern as the broken-image
    // fix elsewhere in the suite (don't trust a transient/optimistic UI state).
    await expect(card.getByRole('button', { name: 'Removing...' })).toHaveCount(0, { timeout: 15000 });
    await expect(removeButtons).toHaveCount(before - 1, { timeout: 20000 });
  }

  async expectNoStopsConfigured(templateName: string) {
    await expect(this.card(templateName).getByText('No stops configured')).toBeVisible({ timeout: 20000 });
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
    await expect(this.card(templateName).getByRole('alert').getByText(text)).toBeVisible({ timeout: 20000 });
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
        // Clicking the <label> here (in the Edit form, deep inside the long template list)
        // proved unreliable, hanging on the actionability check — a direct
        // .uncheck({force:true}) on the sr-only input itself bypasses that check and reliably
        // changes the state.
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
    await expect(this.card(templateName).getByRole('alert').getByText(text)).toBeVisible({ timeout: 20000 });
  }

  async deleteTemplate(templateName: string) {
    const card = this.card(templateName);
    this.page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Delete', exact: true }).click();
  }

  // Deletion doesn't redirect (only revalidatePath), so targeting a transient message on the
  // same page is unreliable — instead we reload the page repeatedly until the card is
  // actually gone from the list (the server action may not have finished yet the first time
  // we check).
  async expectTemplateNotListed(templateName: string) {
    // The number of templates on this page has grown to 150+ over the course of the session
    // (each one renders a full card with Stops/Exceptions sections) — goto() + render
    // occasionally takes longer than the earlier 10s budget for the retry loop.
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
    // "Skip route" is the mode's default value, it doesn't need to be explicitly selected.
    await card.getByRole('button', { name: 'Add exception' }).click();
    await expect(card.getByText('Route exception saved.')).toBeVisible({ timeout: 20000 });
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
    // Same pattern as addStop()/addOneOffStopException(): under load on the shared staging
    // server, 10s is occasionally not enough for this server round-trip (confirmed by
    // isolated retries — not a logic error).
    await expect(card.getByText('Route exception saved.')).toBeVisible({ timeout: 15000 });
  }

  exceptionRow(templateName: string, dateLabel: string, badgeText: string): Locator {
    // The Stops list, the Schedule Exceptions list, AND the Stop exceptions list all use
    // IDENTICAL container CSS classes (divide-y/rounded-xl/border...) — they can't be told
    // apart by container class. Instead we target the LEAF row directly (".p-4", the same on
    // all three lists) and rely on badgeText ("Route skipped"/"Driver override") being
    // vocabulary unique to schedule exceptions, so the filter by itself excludes rows from
    // the other two lists without needing to precisely scope the container.
    return this.card(templateName)
      .locator('div.p-4')
      .filter({ hasText: dateLabel })
      .filter({ hasText: badgeText });
  }

  async expectExceptionRowVisible(templateName: string, dateLabel: string, badgeText: string) {
    // "QA Conflict E" is a shared fixture that has accumulated dozens of stop-exception
    // rows over the course of the session — the larger DOM occasionally takes longer than
    // the default 5s to settle/render.
    await expect(this.exceptionRow(templateName, dateLabel, badgeText).first()).toBeVisible({ timeout: 20000 });
  }

  async removeException(templateName: string, dateLabel: string, badgeText: string) {
    const row = this.exceptionRow(templateName, dateLabel, badgeText).first();
    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(this.exceptionRow(templateName, dateLabel, badgeText)).toHaveCount(0, { timeout: 20000 });
  }

  async expectExceptionRowNotVisible(templateName: string, dateLabel: string, badgeText: string) {
    await expect(this.exceptionRow(templateName, dateLabel, badgeText)).toHaveCount(0);
  }
}
