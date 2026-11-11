import { test, expect } from '../fixtures/test';
import { SurveyPage } from '../pages/SurveyPage';
import {
  attemptForgedSurveyInsert,
  createFreshSurveyToken,
  getGoogleReviewUrl,
  setGoogleReviewUrl,
} from '../helpers/surveySeed';

// Testovi koji STVARNO šalju ocenu (SURV-05/06/08) rade sa svežim, jednokratnim
// fixture tokenom — isti summary ne sme da se deli sa WEB-SURV-01 jer bi submit
// trajno "potrošio" taj token (postaje "already answered").
test.describe.configure({ mode: 'serial' });

test('WEB-SURV-01: Valid survey token shows the rating form', async ({ page }) => {
  // Ne šalje ocenu, pa je token bezbedno koristiti samo za ovaj test (ne mora deljeni fixture).
  const token = await createFreshSurveyToken();
  const survey = new SurveyPage(page);
  await survey.goto(token);
  await survey.expectRatingFormVisible();
});

test('WEB-SURV-02: Non-existent token is rejected on submit', async ({ page }) => {
  const survey = new SurveyPage(page);
  // Nepostojeći token se odbija odmah na učitavanju stranice (ne tek na submit-u).
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

  // Ponovna poseta istom linku i pokušaj slanja DRUGE ocene — mora da se ponaša
  // identično bez obzira na novoizabranu ocenu.
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
  // Regresiona tabela sama priznaje da ovo nikad nije direktno probano ("not exercised
  // separately") — UI onemogućava bilo koju vrednost osim 1-5 (vidi WEB-SURV-04), pa
  // umesto pokušaja da se replicira fragilan Next.js server-action poziv, ovo direktno
  // testira CHECK constraint (rating between 1 and 5) na service_visit_surveys tabeli —
  // stvarna krajnja linija odbrane, koja važi bez obzira na to odakle zahtev stiže.
  //
  // NAPOMENA (poznato ograničenje, ne test bug): ovaj test NE pokriva da li submitSurvey()
  // server akcija (apps/web/src/app/survey/[token]/actions.ts) i dalje sama validira
  // 1-5 opseg — samo poslednju liniju odbrane (DB constraint). submitSurvey() je Next.js
  // server akcija ("use server") pozvana direktno iz klijentske komponente — ne postoji
  // dostupan HTTP endpoint koji bi se mogao gađati nezavisno od UI-ja bez reverse-engineering-a
  // Next-ovog internog "Next-Action" wire formata (nestabilno između verzija Next.js-a, loša
  // inženjerska praksa za regresioni test). Dok god se ne doda testabilan hook u app kodu (van
  // dozvoljenog opsega ove izmene — menja se samo test kod), app-layer validacija ostaje
  // pokrivena SAMO indirektno, kroz UI nemogućnost da se uopšte pošalje van-opsega vrednost.
  const token = await createFreshSurveyToken();

  for (const invalidRating of [0, 6, -1]) {
    const { error } = await attemptForgedSurveyInsert(token, invalidRating);
    expect(error).not.toBeNull();
  }
});

test('WEB-SURV-03: Submit is blocked with no rating selected', async ({ page }) => {
  // "Submit rating" ima disabled={!selectedRating || pending} — dugme je NATIVNO
  // onemogućeno dok ocena nije izabrana (ne može se ni kliknuti), umesto da se klikom
  // tek na submit-u pokaže greška.
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

    // Skoro istovremeno slanje za ISTI token — DB unique constraint je poslednja
    // odbrana; jedan zahtev uspeva ("created"), drugi se gracefully tretira kao
    // already_submitted (ne tvrd pad/generic error).
    await Promise.all([survey1.submitRating(), survey2.submitRating()]);

    // Sačekaj da obe strane STVARNO završe (React state + re-render posle server akcije) —
    // čitanje innerText() odmah posle klika može uhvatiti stranicu pre nego što je odgovor
    // stigao, pre bilo kog od dva krajnja stanja.
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
