import { test as base, expect } from '@playwright/test';

/**
 * Builds a "How to fix: ..." note for a failing test. Always runs, even when the test
 * already has a hand-written note — that note usually explains WHAT is wrong, not HOW to
 * act on it, so the two are complementary rather than redundant:
 *   1. If the manual note already contains its own "Fix: ..." sentence (a human who
 *      investigated the root cause), that text is reused verbatim — it's more trustworthy
 *      than any pattern match.
 *   2. If the manual note flags this as a shared Supabase email-quota issue (the recurring
 *      "not an app defect" case in this suite), give the quota-specific action.
 *   3. Otherwise, pattern-match the failure message itself against the shapes this suite
 *      hits most often. This is a heuristic, not a verified root cause — it exists so a
 *      developer has a starting point instead of a bare stack trace.
 */
function suggestFixFor(message: string, manualNote: string | null): string {
  if (manualNote) {
    const fixMatch = manualNote.match(/fix:\s*(.+)$/is);
    if (fixMatch) {
      return `How to fix: ${fixMatch[1].trim()}`;
    }

    if (/rate limit|quota/i.test(manualNote)) {
      return (
        'How to fix: this is a shared Supabase email-quota issue, not an application bug — ' +
        'wait for the quota to reset (Supabase resets it roughly hourly) and re-run, or raise ' +
        'the limit for this project under Supabase Dashboard → Authentication → Rate Limits. ' +
        'No code change is needed for this specific failure.'
      );
    }
  }

  if (/toBeVisible\(\)/.test(message) && /element\(s\) not found/.test(message)) {
    return (
      'How to fix: the expected text/element never appeared. If this is a success-message ' +
      'assertion, verify the underlying action actually succeeded server-side (check the DB ' +
      'row or API response) before assuming the UI copy changed — a shared-fixture rate limit ' +
      'or data-state mismatch is a common cause in this suite. Otherwise, confirm the exact ' +
      'text/selector still matches what the UI renders now.'
    );
  }

  if (/toBeCloseTo/.test(message)) {
    return (
      'How to fix: a stored/computed numeric value diverged from what was expected. Check for ' +
      'a unit-conversion mismatch, a database column precision/type issue, or whether the ' +
      'update actually persisted (reload and re-read the value to confirm).'
    );
  }

  if (/did not find some options/.test(message) || /selectOption/.test(message)) {
    return (
      'How to fix: the dropdown is missing the expected option. Check whether the ' +
      'fixture/record it depends on still exists in the database — deleted, renamed, or ' +
      'filtered out by a region/role/active-status check.'
    );
  }

  if (/waiting for locator/.test(message) && (/\.click/.test(message) || /getByRole\('button'/.test(message))) {
    return (
      'How to fix: the target button/element never became clickable. Check whether a ' +
      'precondition earlier in the test failed silently (e.g. required fixture data missing, ' +
      'so the control never rendered), or whether it is disabled/hidden under the current app ' +
      'state.'
    );
  }

  if (/^Test timeout of \d+ms exceeded\.?$/m.test(message.trim())) {
    return (
      'How to fix: the overall test time budget ran out with no specific failing assertion ' +
      'reported — likely a slow step earlier in the test (server round-trip, page load) ' +
      'rather than a logic bug. Re-run in isolation; if it fails consistently, add ' +
      'timing/network logging to find which step is actually stalling.'
    );
  }

  if (/\b404\b/.test(message) || /toHaveURL/.test(message)) {
    return (
      'How to fix: check whether the route or permission check still matches what the test ' +
      'expects, and that the record referenced in the URL actually exists.'
    );
  }

  return (
    'How to fix: no known failure pattern matched automatically — review the full error and ' +
    'stack trace above, starting from the assertion and locator it names.'
  );
}

/**
 * Automatically adds a short note (Annotations in the HTML report) to every test, so no
 * individual test() has to write it by hand:
 *   - Passed: short confirmation that it works.
 *   - Failed (and NOT test.fail()): the actual Playwright error as the failure reason,
 *     ALWAYS followed by a "How to fix: ..." note (see suggestFixFor above for how it's
 *     built from any existing manual note plus the failure message).
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
        // Captured BEFORE pushing the "Failed: ..." note below — any 'note' annotation
        // already present at this point can only have come from a test author's own
        // test.info().annotations.push() call at the top of the test body.
        const manualNote =
          testInfo.annotations.find((a) => a.type === 'note' && a.description)?.description ?? null;

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

        testInfo.annotations.push({
          type: 'note',
          description: suggestFixFor(stripped, manualNote),
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
