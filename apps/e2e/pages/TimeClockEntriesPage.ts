import { Page, expect, Locator } from '@playwright/test';

export class TimeClockEntriesPage {
  constructor(private page: Page) {}

  async goto() {
    // Stranica NEMA limit (vidi napomenu ispod) i mnogi unosi imaju namerno nepostojeću
    // selfie putanju (WEB-TCENT-07/WEB-TCREV-05 fixture-i) — default 'load' čeka da SVAKA
    // slika na stranici završi (ili ne uspe), što raste sa brojem takvih unosa u deljenoj
    // bazi. Testu treba samo DOM, ne i da sve slike završe učitavanje.
    try {
      await this.page.goto('/dashboard/time-clock/entries', { waitUntil: 'domcontentloaded' });
    } catch (error) {
      // WEB-TCENT-04 zove goto() više puta brzo zaredom (DB upis pa odmah ponovo goto, bez UI
      // interakcije između) — povremeno pogodi poznat Playwright/Chromium kvirk (ERR_ABORTED)
      // kad nova navigacija na ISTI URL stigne dok prethodna još nije potpuno "slegla". Jedan
      // retry je dovoljan — ne znači da je stranica stvarno pokvarena.
      if (error instanceof Error && error.message.includes('ERR_ABORTED')) {
        await this.page.goto('/dashboard/time-clock/entries', { waitUntil: 'domcontentloaded' });
      } else {
        throw error;
      }
    }
  }

  // Stranica NEMA limit — prikazuje CELU istoriju unosa za sve vozače, sortiranu po
  // clock_in_at opadajuće. Vozač koga koristimo ima stotine starih unosa iz ove sesije, pa
  // ".first()" (najnoviji clock-in za tog vozača) pouzdano pogađa TEK kreiranu fikstur.
  cardForDriverEmail(email: string): Locator {
    return this.page.locator('article').filter({ hasText: email }).first();
  }

  private fieldValue(card: Locator, label: string): Locator {
    return card.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
  }

  async expectFieldsPopulated(card: Locator) {
    await expect(card.locator('h2')).not.toHaveText('');
    await expect(card.getByText('No email')).toHaveCount(0);
    await expect(card.locator('span.rounded-full.bg-latte-100')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Clock in')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Clock out')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Warehouse')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Review')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Auto closed')).not.toHaveText('');
    await expect(this.fieldValue(card, 'Reason')).not.toHaveText('');
  }

  async getClockOutValue(card: Locator): Promise<string> {
    return this.fieldValue(card, 'Clock out').innerText();
  }

  async getFieldText(card: Locator, label: string): Promise<string> {
    return this.fieldValue(card, label).innerText();
  }

  async getReasonValue(card: Locator): Promise<string> {
    return this.fieldValue(card, 'Reason').innerText();
  }

  async expectSelfieImageVisible(card: Locator) {
    await expect(card.getByText('Clock-in selfie', { exact: true })).toBeVisible();
    const image = card.locator('img');
    await expect(image).toBeVisible();
    // Isti razlog kao TimeClockReviewPage: toBeVisible() ne garantuje da je slika STVARNO
    // učitana (pokvaren signed URL je i dalje "visible" u DOM-u).
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }

  async expectNoSelfieMessage(card: Locator) {
    await expect(card.getByText('No clock-in selfie was submitted.')).toBeVisible();
  }

  async expectSelfieLoadError(card: Locator) {
    await expect(card.getByText('The selfie exists, but it could not be loaded.')).toBeVisible();
  }
}
