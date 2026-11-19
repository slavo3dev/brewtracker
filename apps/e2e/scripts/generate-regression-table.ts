import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Converts a Playwright JSON reporter file into English regression status tables (Markdown +
// HTML) — grouped by test ID prefix (e.g. "WEB-CLI-09: ..." -> group "WEB-CLI"), sorted so
// numeric suffixes compare correctly (WEB-CLI-2 before WEB-CLI-10). Tests without an
// "ID: Title" prefix (e.g. smoke.spec.ts) are listed under "(Unclassified)".
//
// The Bug Note / Suggested Fix columns are NOT guessed — they're extracted from annotations
// already present in the test files:
//   - fixtures/test.ts auto-adds a "Test passed —..." / "Failed: <error summary>" note to
//     every test — used as the Bug Note for failing tests.
//   - Some tests additionally hand-write a note like "Known app defect: ... Fix: ..." right
//     next to the assertion — used as the Suggested Fix, when present, for failing tests.
// Both are only surfaced for tests that are CURRENTLY failing, so a stale "known defect" note
// left over from before a fix landed doesn't get shown for a test that now passes.

type PlaywrightStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

type JsonAnnotation = {
  type: string;
  description?: string;
};

type JsonResult = {
  status: PlaywrightStatus;
  duration: number;
};

type JsonTest = {
  annotations: JsonAnnotation[];
  results: JsonResult[];
};

type JsonSpec = {
  title: string;
  file: string;
  tests: JsonTest[];
};

type JsonSuite = {
  specs: JsonSpec[];
  suites?: JsonSuite[];
};

type JsonReport = {
  suites: JsonSuite[];
  stats: {
    expected: number;
    unexpected: number;
    skipped: number;
    flaky: number;
  };
};

type Row = {
  id: string;
  group: string;
  title: string;
  file: string;
  status: 'Pass' | 'Fail' | 'Skip' | 'Did not run';
  durationMs: number;
  bugNote: string | null;
  suggestedFix: string | null;
};

const ID_PATTERN = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d+)\s*:\s*(.+)$/;

function statusFor(test: JsonTest): Row['status'] {
  if (test.results.length === 0) {
    return 'Did not run';
  }

  const last = test.results[test.results.length - 1];

  switch (last.status) {
    case 'passed':
      return 'Pass';
    case 'failed':
    case 'timedOut':
      return 'Fail';
    case 'skipped':
      return 'Skip';
    case 'interrupted':
      return 'Did not run';
    default:
      return 'Did not run';
  }
}

function durationFor(test: JsonTest): number {
  return test.results.reduce((sum, r) => sum + r.duration, 0);
}

// fixtures/test.ts auto-annotates every test with one of these two prefixes.
function isAutoStatusNote(description: string): boolean {
  return description.startsWith('Test passed') || description.startsWith('Failed:');
}

function notesFor(test: JsonTest, status: Row['status']): { bugNote: string | null; suggestedFix: string | null } {
  if (status === 'Skip') {
    const skipNote = test.annotations.find((a) => a.type === 'skip' && a.description);
    return { bugNote: skipNote ? `Skipped: ${skipNote.description}` : null, suggestedFix: null };
  }

  if (status !== 'Fail') {
    return { bugNote: null, suggestedFix: null };
  }

  const autoNote = test.annotations.find((a) => a.type === 'note' && a.description && isAutoStatusNote(a.description));
  const manualNotes = test.annotations.filter(
    (a) => a.type === 'note' && a.description && !isAutoStatusNote(a.description),
  );

  return {
    bugNote: autoNote?.description ?? null,
    suggestedFix: manualNotes.length > 0 ? manualNotes.map((a) => a.description).join(' ') : null,
  };
}

function collectRows(suite: JsonSuite, rows: Row[]): void {
  for (const spec of suite.specs ?? []) {
    const match = spec.title.match(ID_PATTERN);
    const id = match ? match[1] : '(no ID)';
    const group = match ? id.replace(/-\d+$/, '') : '(Unclassified)';
    const title = match ? match[2] : spec.title;

    for (const test of spec.tests) {
      const status = statusFor(test);
      const { bugNote, suggestedFix } = notesFor(test, status);

      rows.push({
        id,
        group,
        title,
        file: spec.file,
        status,
        durationMs: durationFor(test),
        bugNote,
        suggestedFix,
      });
    }
  }

  for (const nested of suite.suites ?? []) {
    collectRows(nested, rows);
  }
}

function naturalIdCompare(a: string, b: string): number {
  const partsA = a.split('-');
  const partsB = b.split('-');
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const pa = partsA[i] ?? '';
    const pb = partsB[i] ?? '';
    const na = Number(pa);
    const nb = Number(pb);
    const bothNumeric = !Number.isNaN(na) && !Number.isNaN(nb);

    const cmp = bothNumeric ? na - nb : pa.localeCompare(pb);
    if (cmp !== 0) return cmp;
  }

  return 0;
}

function sortedGroups(rows: Row[]): string[] {
  return Array.from(new Set(rows.map((r) => r.group))).sort((a, b) => a.localeCompare(b));
}

function rowsInGroup(rows: Row[], group: string): Row[] {
  return rows.filter((r) => r.group === group).sort((a, b) => naturalIdCompare(a.id, b.id));
}

const STATUS_ICON: Record<Row['status'], string> = {
  Pass: '✅',
  Fail: '❌',
  Skip: '⏭️',
  'Did not run': '⏸️',
};

function renderMarkdown(rows: Row[], stats: JsonReport['stats']): string {
  const lines: string[] = [];

  lines.push('# Regression Test Results');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(
    `**Summary:** ${stats.expected} passed, ${stats.unexpected} failed, ${stats.skipped} skipped, ${stats.flaky} flaky`,
  );
  lines.push('');

  for (const group of sortedGroups(rows)) {
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| ID | Test Case | Status | Duration (s) | Bug Note | Suggested Fix |');
    lines.push('|---|---|---|---|---|---|');

    for (const row of rowsInGroup(rows, group)) {
      const seconds = (row.durationMs / 1000).toFixed(1);
      const cell = (text: string | null) => (text ? text.replace(/\|/g, '\\|').replace(/\n/g, ' ') : '');
      lines.push(
        `| ${row.id === '(no ID)' ? '' : row.id} | ${row.title} | ${STATUS_ICON[row.status]} ${row.status} | ${seconds} | ${cell(row.bugNote)} | ${cell(row.suggestedFix)} |`,
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_CLASS: Record<Row['status'], string> = {
  Pass: 'status-pass',
  Fail: 'status-fail',
  Skip: 'status-skip',
  'Did not run': 'status-didnotrun',
};

function renderHtml(rows: Row[], stats: JsonReport['stats']): string {
  const groups = sortedGroups(rows);

  const groupSections = groups
    .map((group) => {
      const groupRows = rowsInGroup(rows, group)
        .map((row) => {
          const seconds = (row.durationMs / 1000).toFixed(1);
          return `
        <tr class="${STATUS_CLASS[row.status]}">
          <td class="id-cell">${row.id === '(no ID)' ? '' : escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.title)}</td>
          <td class="status-cell">${STATUS_ICON[row.status]} ${row.status}</td>
          <td class="duration-cell">${seconds}s</td>
          <td class="note-cell">${row.bugNote ? escapeHtml(row.bugNote) : ''}</td>
          <td class="note-cell">${row.suggestedFix ? escapeHtml(row.suggestedFix) : ''}</td>
        </tr>`;
        })
        .join('');

      return `
    <section>
      <h2>${escapeHtml(group)}</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Test Case</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Bug Note</th>
            <th>Suggested Fix</th>
          </tr>
        </thead>
        <tbody>${groupRows}
        </tbody>
      </table>
    </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Regression Test Results</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 2rem; color: #1a1a1a; background: #fafafa; }
  h1 { margin-bottom: 0.25rem; }
  .meta { color: #666; margin-bottom: 1.5rem; }
  .summary { font-weight: 600; margin-bottom: 2rem; }
  section { margin-bottom: 2.5rem; }
  h2 { border-bottom: 2px solid #ddd; padding-bottom: 0.25rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #f0f0f0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .id-cell { font-family: ui-monospace, Menlo, monospace; white-space: nowrap; }
  .status-cell { white-space: nowrap; font-weight: 600; }
  .duration-cell { white-space: nowrap; color: #666; }
  .note-cell { max-width: 28rem; font-size: 0.9rem; }
  tr.status-pass { background: #f0faf0; }
  tr.status-fail { background: #fdf0f0; }
  tr.status-skip { background: #fafafa; color: #888; }
  tr.status-didnotrun { background: #fafafa; color: #888; }
</style>
</head>
<body>
  <h1>Regression Test Results</h1>
  <div class="meta">Generated: ${new Date().toISOString()}</div>
  <div class="summary">${stats.expected} passed, ${stats.unexpected} failed, ${stats.skipped} skipped, ${stats.flaky} flaky</div>
  ${groupSections}
</body>
</html>`;
}

function main() {
  const inputPath = process.argv[2] ?? process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'test-results/results.json';
  const outputBase = process.argv[3] ?? 'test-results/regression-table';

  const resolvedInput = resolve(process.cwd(), inputPath);
  const report: JsonReport = JSON.parse(readFileSync(resolvedInput, 'utf-8'));

  const rows: Row[] = [];
  for (const suite of report.suites) {
    collectRows(suite, rows);
  }

  const mdPath = resolve(process.cwd(), `${outputBase}.md`);
  const htmlPath = resolve(process.cwd(), `${outputBase}.html`);

  writeFileSync(mdPath, renderMarkdown(rows, report.stats), 'utf-8');
  writeFileSync(htmlPath, renderHtml(rows, report.stats), 'utf-8');

  console.log(`Regression table written to ${mdPath} and ${htmlPath}`);
  console.log(
    `${report.stats.expected} passed, ${report.stats.unexpected} failed, ${report.stats.skipped} skipped, ${report.stats.flaky} flaky`,
  );
}

main();
