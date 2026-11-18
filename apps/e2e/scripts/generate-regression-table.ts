import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Converts a Playwright JSON reporter file into an English regression status table —
// grouped by test ID prefix (e.g. "WEB-CLI-09: ..." -> group "WEB-CLI"), sorted so numeric
// suffixes compare correctly (WEB-CLI-2 before WEB-CLI-10). Tests without an "ID: Title"
// prefix (e.g. smoke.spec.ts) are listed under "(Unclassified)".

type PlaywrightStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

type JsonResult = {
  status: PlaywrightStatus;
  duration: number;
};

type JsonTest = {
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

function collectRows(suite: JsonSuite, rows: Row[]): void {
  for (const spec of suite.specs ?? []) {
    const match = spec.title.match(ID_PATTERN);
    const id = match ? match[1] : '(no ID)';
    const group = match ? id.replace(/-\d+$/, '') : '(Unclassified)';
    const title = match ? match[2] : spec.title;

    for (const test of spec.tests) {
      rows.push({
        id,
        group,
        title,
        file: spec.file,
        status: statusFor(test),
        durationMs: durationFor(test),
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

  const groups = Array.from(new Set(rows.map((r) => r.group))).sort((a, b) => a.localeCompare(b));

  for (const group of groups) {
    const groupRows = rows
      .filter((r) => r.group === group)
      .sort((a, b) => naturalIdCompare(a.id, b.id));

    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| ID | Test Case | Status | Duration (s) |');
    lines.push('|---|---|---|---|');

    for (const row of groupRows) {
      const seconds = (row.durationMs / 1000).toFixed(1);
      lines.push(
        `| ${row.id === '(no ID)' ? '' : row.id} | ${row.title} | ${STATUS_ICON[row.status]} ${row.status} | ${seconds} |`,
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const inputPath = process.argv[2] ?? process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'test-results/results.json';
  const outputPath = process.argv[3] ?? 'test-results/regression-table.md';

  const resolvedInput = resolve(process.cwd(), inputPath);
  const report: JsonReport = JSON.parse(readFileSync(resolvedInput, 'utf-8'));

  const rows: Row[] = [];
  for (const suite of report.suites) {
    collectRows(suite, rows);
  }

  const markdown = renderMarkdown(rows, report.stats);

  const resolvedOutput = resolve(process.cwd(), outputPath);
  writeFileSync(resolvedOutput, markdown, 'utf-8');

  console.log(`Regression table written to ${resolvedOutput}`);
  console.log(
    `${report.stats.expected} passed, ${report.stats.unexpected} failed, ${report.stats.skipped} skipped, ${report.stats.flaky} flaky`,
  );
}

main();
