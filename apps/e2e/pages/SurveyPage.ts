import { Page, expect } from '@playwright/test';

export class SurveyPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/survey/${token}`);
  }

  async revisit() {
    await this.page.reload();
  }

  async expectRatingFormVisible() {
    await expect(this.page.getByText('How was your service?')).toBeVisible();
    for (let star = 1; star <= 5; star++) {
      await expect(this.page.getByRole('button', { name: `${star} star rating` })).toBeVisible();
    }
    await expect(this.page.getByRole('button', { name: 'Submit rating' })).toBeVisible();
  }

  async selectRating(stars: number) {
    await this.page.getByRole('button', { name: `${stars} star rating` }).click();
  }

  starButton(stars: number) {
    return this.page.getByRole('button', { name: `${stars} star rating` });
  }

  async expectHighlightState(selectedRating: number) {
    for (let star = 1; star <= 5; star++) {
      const button = this.starButton(star);
      if (star <= selectedRating) {
        await expect(button).toHaveClass(/border-copper-500/);
      } else {
        await expect(button).not.toHaveClass(/border-copper-500/);
      }
      await expect(button).toHaveAttribute('aria-pressed', String(star === selectedRating));
    }
  }

  async submitRating() {
    await this.page.getByRole('button', { name: 'Submit rating' }).click();
  }

  async expectInvalidTokenError() {
    await expect(this.page.getByText('Survey unavailable')).toBeVisible();
    await expect(this.page.getByText('This survey link is invalid.')).toBeVisible();
  }

  async expectThankYouWithoutGoogleReview() {
    await expect(this.page.getByText('Thank you.', { exact: true })).toBeVisible();
    await expect(this.page.getByRole('link', { name: 'Leave a Google Review' })).toHaveCount(0);
  }

  async expectGoogleReviewPrompt(expectedUrl: string) {
    const link = this.page.getByRole('link', { name: 'Leave a Google Review' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', expectedUrl);
  }

  async expectAlreadyReceived() {
    await expect(this.page.getByText('Feedback already received')).toBeVisible();
  }
}
