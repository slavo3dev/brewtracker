import { test, expect } from '../fixtures/test';
import { SurveyPage } from '../pages/SurveyPage';
import {
  attemptForgedSurveyInsert,
  createFreshSurveyToken,
  getGoogleReviewUrl,
  setGoogleReviewUrl,
} from '../helpers/surveySeed';

// Tests that ACTUALLY submit a rating (SURV-05/06/08) run with a fresh, one-time
// fixture token — the same summary must not be shared with WEB-SURV-01, because
// submitting would permanently "consume" that token (it becomes "already answered").
test.describe.configure({ mode: 'serial' });

test('WEB-SURV-01: Valid survey token shows the rating form', async ({ page }) => {
  // Doesn't submit a rating, so it's safe to use this token for just this test (no shared
  // fixture needed).
  const token = await createFreshSurveyToken();
  const survey = new SurveyPage(page);
  await survey.goto(token);
  await survey.expectRatingFormVisible();
});

test('WEB-SURV-02: Non-existent token is rejected on submit', async ({ page }) => {
  const survey = new SurveyPage(page);
  // A nonexistent token is rejected immediately on page load (not only on submit).
  await survey.goto('00000000-0000-4000-8000-000000000000');
  await survey.expectInvalidTokenError();
});

test('WEB-SURV-05: Submitting a rating of 1-4 shows a thank-you without the Google review prompt', async ({ page }) => {
  const token = await createFreshSurveyToken();

  const survey = new SurveyPage(page);
  await survey.goto(token);
  await survey.selectRating(3);
  await survey.submitRating();
  await survey.expectThankYouWithoutGoogleReview();
});

test('WEB-SURV-06: 5 stars with a configured Google review URL shows the call to action', async ({ page }) => {
  const originalUrl = await getGoogleReviewUrl();
  const testUrl = 'https://g.page/r/qa-test-review-link/review';

  try {
    await setGoogleReviewUrl(testUrl);

    const token = await createFreshSurveyToken();
    const survey = new SurveyPage(page);
    await survey.goto(token);
    await survey.selectRating(5);
    await survey.submitRating();
    await survey.expectGoogleReviewPrompt(testUrl);
  } finally {
    await setGoogleReviewUrl(originalUrl);
  }
});

test('WEB-SURV-08: Resubmitting an already-answered survey link shows the "already received" state', async ({ page }) => {
  const token = await createFreshSurveyToken();

  const survey = new SurveyPage(page);
  await survey.goto(token);
  await survey.selectRating(3);
  await survey.submitRating();
  await survey.expectThankYouWithoutGoogleReview();

  // Revisiting the same link and attempting to submit a DIFFERENT rating — must behave
  // identically regardless of the newly selected rating.
  await survey.revisit();
  await survey.selectRating(5);
  await survey.submitRating();
  await survey.expectAlreadyReceived();
});

test('WEB-SURV-04: Each star click correctly highlights the stars and updates aria-pressed', async ({ page }) => {
  const token = await createFreshSurveyToken();
  const survey = new SurveyPage(page);
  await survey.goto(token);

  for (let stars = 1; stars <= 5; stars++) {
    await survey.selectRating(stars);
    await survey.expectHighlightState(stars);
  }
});

test('WEB-SURV-10: Rating outside the 1-5 range is rejected at the database level (forged request)', async () => {
  // The regression table itself admits this was never directly exercised ("not exercised
  // separately") — the UI prevents any value other than 1-5 (see WEB-SURV-04), so instead of
  // trying to replicate a fragile Next.js server-action call, this directly tests the CHECK
  // constraint (rating between 1 and 5) on the service_visit_surveys table — the real last
  // line of defense, which holds regardless of where the request comes from.
  //
  // NOTE (a known limitation, not a test bug): this test does NOT cover whether the
  // submitSurvey() server action (apps/web/src/app/survey/[token]/actions.ts) still validates
  // the 1-5 range itself — only the last line of defense (the DB constraint). submitSurvey()
  // is a Next.js server action ("use server") called directly from a client component —
  // there's no available HTTP endpoint that could be targeted independently of the UI without
  // reverse-engineering Next's internal "Next-Action" wire format (unstable across Next.js
  // versions, poor engineering practice for a regression test). Until a testable hook is
  // added in the app code (outside the allowed scope of this change — only test code is
  // being changed), app-layer validation remains covered ONLY indirectly, through the UI's
  // inability to submit an out-of-range value at all.
  const token = await createFreshSurveyToken();

  for (const invalidRating of [0, 6, -1]) {
    const { error } = await attemptForgedSurveyInsert(token, invalidRating);
    expect(error).not.toBeNull();
  }
});

test('WEB-SURV-03: Submit is blocked with no rating selected', async ({ page }) => {
  // "Submit rating" has disabled={!selectedRating || pending} — the button is NATIVELY
  // disabled until a rating is selected (it can't even be clicked), instead of showing an
  // error only after clicking submit.
  const token = await createFreshSurveyToken();
  const survey = new SurveyPage(page);
  await survey.goto(token);
  await expect(page.getByRole('button', { name: 'Submit rating' })).toBeDisabled();
});

test('WEB-SURV-07: 5 stars with no configured Google review URL skips the call to action', async ({ page }) => {
  const originalUrl = await getGoogleReviewUrl();

  try {
    await setGoogleReviewUrl(null);

    const token = await createFreshSurveyToken();
    const survey = new SurveyPage(page);
    await survey.goto(token);
    await survey.selectRating(5);
    await survey.submitRating();
    await survey.expectThankYouWithoutGoogleReview();
  } finally {
    await setGoogleReviewUrl(originalUrl);
  }
});

test('WEB-SURV-09: Concurrent duplicate submission is handled without crashing', async ({ page, context }) => {
  const token = await createFreshSurveyToken();
  const page2 = await context.newPage();

  try {
    const survey1 = new SurveyPage(page);
    const survey2 = new SurveyPage(page2);

    await survey1.goto(token);
    await survey2.goto(token);
    await survey1.selectRating(4);
    await survey2.selectRating(5);

    // Near-simultaneous submission for the SAME token — the DB unique constraint is the
    // last line of defense; one request succeeds ("created"), the other is gracefully
    // treated as already_submitted (not a hard crash/generic error).
    await Promise.all([survey1.submitRating(), survey2.submitRating()]);

    // Wait for both sides to ACTUALLY finish (React state + re-render after the server
    // action) — reading innerText() right after the click can catch the page before the
    // response has arrived, before either of the two final states.
    const outcomeVisible = (p: typeof page) =>
      expect(
        p.getByText('Thank you.', { exact: true }).or(p.getByText('Feedback already received')),
      ).toBeVisible({ timeout: 10000 });
    await Promise.all([outcomeVisible(page), outcomeVisible(page2)]);

    const [text1, text2] = await Promise.all([
      page.locator('body').innerText(),
      page2.locator('body').innerText(),
    ]);
    const outcomes = [text1, text2];

    expect(outcomes.some((t) => t.includes('Thank you.'))).toBe(true);
    expect(
      outcomes.some(
        (t) => t.includes('Feedback already received') || t.includes('already been recorded'),
      ),
    ).toBe(true);
    expect(outcomes.some((t) => /unable to save|error|exception/i.test(t))).toBe(false);
  } finally {
    await page2.close();
  }
});
