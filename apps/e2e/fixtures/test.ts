import { test as base, expect } from '@playwright/test';

/**
 * Automatski dodaje kratku napomenu (Annotations u HTML report-u) uz svaki test, bez da
 * svaki test() mora ručno da je piše:
 *   - Prošao: kratka potvrda da radi.
 *   - Pao (a NIJE test.fail()): stvarna Playwright greška kao razlog pada.
 * test.fail() testovi (poznati, dokumentovani defekti) sami pišu svoju napomenu odmah uz
 * test.fail() poziv, pa ih ovaj auto-fixture preskače (expectedStatus === 'failed').
 */
export const test = base.extend({
  autoAnnotateResult: [
    async ({}, use, testInfo) => {
      await use();

      if (testInfo.expectedStatus === 'failed') {
        return;
      }

      if (testInfo.status === 'passed') {
        testInfo.annotations.push({
          type: 'note',
          description: 'Test je prošao — funkcionalnost radi ispravno.',
        });
      } else if (testInfo.status === 'failed' || testInfo.status === 'timedOut' || testInfo.status === 'interrupted') {
        const rawMessage = testInfo.error?.message ?? 'Nepoznata greška (detalji u Errors sekciji ispod).';
        // eslint-disable-next-line no-control-regex
        const stripped = rawMessage.replace(/\x1b\[[0-9;]*m/g, '');
        const summary = stripped
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 4)
          .join(' | ')
          .slice(0, 500);
        testInfo.annotations.push({
          type: 'note',
          description: `Pao: ${summary}`,
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
