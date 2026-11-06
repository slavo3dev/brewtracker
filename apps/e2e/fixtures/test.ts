import { test as base, expect } from '@playwright/test';

/**
 * Automatically adds a short note (Annotations in the HTML report) to every test, so no
 * individual test() has to write it by hand:
 *   - Passed: short confirmation that it works.
 *   - Failed (and NOT test.fail()): the actual Playwright error as the failure reason.
 * test.fail() tests (known, documented defects) write their own note right next to the
 * test.fail() call, so this auto-fixture skips them (expectedStatus === 'failed').
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
          description: 'Test passed — the functionality works correctly.',
        });
      } else if (testInfo.status === 'failed' || testInfo.status === 'timedOut' || testInfo.status === 'interrupted') {
        const rawMessage = testInfo.error?.message ?? 'Unknown error (see the Errors section below for details).';
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
          description: `Failed: ${summary}`,
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
