import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { setVaultPath } from '../src/utils/paths.js';
import { buildProgressFeedbackBlock } from '../src/core/feedback-progress.js';

let tmp, vault;
const CLI_ENTRY = new URL('../src/cli.js', import.meta.url).pathname;

// Sentinel constants matching review-capture.js
const FEEDBACK_START = '<!-- feedback-items:start -->';
const FEEDBACK_END = '<!-- feedback-items:end -->';

function managerReviewBodyMonthly(cycleName, items) {
  const bullets = items.map(({ id, text }) => `- **${id}**: ${text}`).join('\n');
  return [
    `# Manager Review — ${cycleName}`,
    '',
    'Review prose here.',
    '',
    FEEDBACK_START,
    '## Feedback Items',
    '',
    bullets,
    '',
    FEEDBACK_END,
    '',
  ].join('\n');
}

const MONTHLY_CFG = { review: { cycleEndMonths: [5, 9, 12] } };

function todayUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function currentMonthUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-report-month-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');

  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  mkdirSync(join(vault, 'Reports'), { recursive: true });
  mkdirSync(join(vault, 'Tickets'), { recursive: true });
  mkdirSync(join(vault, 'Components'), { recursive: true });
  mkdirSync(join(vault, 'Reviews'), { recursive: true });
  mkdirSync(join(vault, '.self-wiki'), { recursive: true });

  mkdirSync(join(tmp, 'cfg', 'self-wiki'), { recursive: true });
  writeFileSync(
    join(tmp, 'cfg', 'self-wiki', 'config.json'),
    JSON.stringify({ vaultPath: vault }, null, 2),
    'utf8',
  );

  writeFileSync(
    join(vault, '.self-wiki', 'config.json'),
    JSON.stringify({
      components: [{ slug: 'wiki', keywords: ['wiki'] }],
      review: { cycleEndMonths: [5, 9, 12] },
    }, null, 2),
    'utf8',
  );

  setVaultPath(vault);

  writeFileSync(
    join(vault, 'Daily', '2026-04-01.md'),
    `# 2026-04-01

## Session 1 — Task: LPD-12345 — wiki tweaks
- Started: 09:00
- Note [09:15]: refined the wiki module
- Ended: 10:00
- Duration: 60 min
- Completed: ✅
`,
    'utf8',
  );
  writeFileSync(
    join(vault, 'Daily', '2026-04-15.md'),
    `# 2026-04-15

## Session 1 — Task: LPD-99913 — follow-up
- Started: 10:00
- Note [10:30]: more wiki work
- Ended: 11:00
- Duration: 60 min
- Completed: ✅
`,
    'utf8',
  );

  writeFileSync(
    join(vault, 'Reports', '2026-W14.md'),
    `# Weekly Report — Mar 30 to Apr 5\n\n## Theme of the week\nWiki refinements.\n`,
    'utf8',
  );
  writeFileSync(
    join(vault, 'Reports', '2026-W15.md'),
    `# Weekly Report — Apr 6 to Apr 12\n\n## Theme of the week\nMore polish.\n`,
    'utf8',
  );

  writeFileSync(
    join(vault, 'Reports', '2026-03.md'),
    `# Monthly Report — March 2026\n\n## Risks / carry-over\n- Tail-end review feedback on PR #1000.\n`,
    'utf8',
  );

  writeFileSync(
    join(vault, 'Tickets', 'LPD-12345.md'),
    `# LPD-12345\n\n## 2026-04-01 — Session 1\nSource: \`Daily/2026-04-01.md\`\n- [09:15] refined the wiki\n`,
    'utf8',
  );
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runCli(args, opts = {}) {
  return spawnSync('node', [CLI_ENTRY, 'report', ...args], {
    env: {
      ...process.env,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    },
    encoding: 'utf8',
    ...opts,
  });
}

test('--month --dry-run prints the monthly prompt envelope', () => {
  const r = runCli(['--month', '2026-04', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /MONTH: 2026-04/);
  assert.match(r.stdout, /## Theme\(s\) of the month/);
  assert.match(r.stdout, /Sources:/);
  assert.match(r.stdout, /WEEKLIES:/);
  assert.match(r.stdout, /TOPIC_PAGES:/);
  assert.match(r.stdout, /PRIOR_REPORT \(2026-03\):/);
  assert.match(r.stdout, /Reports\/2026-W14\.md/);
  assert.match(r.stdout, /Missing weeks: 2026-W16, 2026-W17, 2026-W18/);
  assert.match(r.stdout, /Tickets\/LPD-12345\.md/);
  assert.equal(existsSync(join(vault, 'Reports', '2026-04.md')), false);
  assert.ok(!r.stdout.includes('wrote '));
});

test('--month and --week together is a usage error (exit 1)', () => {
  const r = runCli(['--week', '2026-W18', '--month', '2026-04', '--dry-run']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /mutually exclusive/);
});

test('--month with malformed value exits 1', () => {
  const a = runCli(['--month', '2026/04', '--dry-run']);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /invalid --month value/);

  const b = runCli(['--month', '2026-13', '--dry-run']);
  assert.equal(b.status, 1);
  assert.match(b.stderr, /invalid --month value/);

  const c = runCli(['--month', 'not-a-month', '--dry-run']);
  assert.equal(c.status, 1);
  assert.match(c.stderr, /invalid --month value/);

  // Path-traversal guard: input that LOOKS plausible to a regex must still fail.
  const d = runCli(['--month', '../../etc/passwd', '--dry-run']);
  assert.equal(d.status, 1);
  assert.match(d.stderr, /invalid --month value/);
});

test('--month without a value defaults to current month (D-16)', () => {
  const r = runCli(['--month', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const cm = currentMonthUTC();
  assert.match(r.stdout, new RegExp(`MONTH: ${cm}`));
});

test('current-month dry-run includes a Partial month note (D-15)', () => {
  const r = runCli(['--month', '--dry-run']);
  assert.equal(r.status, 0);
  const today = todayUTC();
  assert.match(r.stdout, new RegExp(`Partial month — generated ${today}`));
});

test('past-month dry-run does NOT include a Partial month note', () => {
  const r = runCli(['--month', '2026-01', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(!r.stdout.includes('Partial month'));
});

test('regenerated-marker code path exists in source (grep guardrail)', () => {
  // Live write+rewrite cycle needs a real claude CLI; verify the source
  // shape instead.
  const src = readFileSync(new URL('../src/commands/report.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /<!-- regenerated /);
  assert.match(src, /access\(outPath\)/);
});

test('--dry-run does NOT backfill missing weeklies', () => {
  ['2026-W16', '2026-W17', '2026-W18'].forEach((w) => {
    const p = join(vault, 'Reports', `${w}.md`);
    if (existsSync(p)) unlinkSync(p);
  });

  const r = runCli(['--month', '2026-04', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);

  assert.equal(existsSync(join(vault, 'Reports', '2026-W18.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W17.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W16.md')), false);

  assert.match(r.stdout, /Missing weeks: .*2026-W18/);
});

test('Without --dry-run, missing `claude` exits 2 before any backfill (no partial state)', () => {
  ['2026-W16', '2026-W17', '2026-W18'].forEach((w) => {
    const p = join(vault, 'Reports', `${w}.md`);
    if (existsSync(p)) unlinkSync(p);
  });

  // Run with PATH stripped — `claude --version` will fail, so
  // hasClaudeCli() returns false and the orchestrator must exit 2
  // BEFORE entering the backfill loop. Use process.execPath (absolute
  // node binary) so the spawned-process step does not itself depend on
  // a PATH lookup; only the inner `claude` lookup is affected.
  const r = spawnSync(process.execPath, [CLI_ENTRY, 'report', '--month', '2026-04'], {
    env: {
      ...process.env,
      PATH: '/nonexistent',
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    },
    encoding: 'utf8',
  });
  assert.equal(r.status, 2, `stderr: ${r.stderr}`);
  assert.match(r.stderr, /claude.* CLI not found on PATH/);

  assert.equal(existsSync(join(vault, 'Reports', '2026-W18.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W17.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W16.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-04.md')), false);
});

test('Backfill source contains the empty-week graceful-skip guard (MONTH-04)', () => {
  const src = readFileSync(new URL('../src/commands/report.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /async function anyDailyExists/);
  assert.match(src, /hasAnyDaily/);
  assert.match(src, /if \(!hasAnyDaily\) continue/);
  assert.match(src, /hasClaudeCli/);
});

// ─── Progress vs. review feedback: monthly present/absent (RRPT-02, RRPT-04) ──

test('monthly block present when completed-cycle manager review with items exists (RRPT-02)', async () => {
  // 2026-06-30 is the last day of June, which is in 2026-cycle2 (May–Aug).
  // Previous completed cycle = 2026-cycle1 (end 2026-04-30 < 2026-06-30 ✓).
  writeFileSync(
    join(vault, 'Reviews', '2026-cycle1-manager.md'),
    managerReviewBodyMonthly('2026-cycle1', [
      { id: 'FB-1', text: 'Be more concise in PR descriptions' },
      { id: 'FB-2', text: 'Pair more on migrations' },
    ]),
    'utf8',
  );

  // Strip PATH so synthesize degrades gracefully — block still renders with fallback
  const savedPath = process.env.PATH;
  process.env.PATH = '/nonexistent';
  try {
    const r = await buildProgressFeedbackBlock(
      '2026-06-30',
      MONTHLY_CFG,
      { corpusLabel: 'month', corpusBlock: '## --- 2026-W25 ---\n\n(weekly)' },
    );
    assert.ok(r !== null, 'block should be present when a completed cycle has items');
    assert.equal(r.cycleName, '2026-cycle1');
    assert.ok(r.block.includes('## Progress vs. review feedback'), `block heading missing: ${r.block.slice(0, 80)}`);
    assert.ok(r.block.includes('- **FB-1**: Be more concise in PR descriptions'), 'verbatim FB-1 line missing');
    assert.ok(r.block.includes('- **FB-2**: Pair more on migrations'), 'verbatim FB-2 line missing');
    // Soft-degrade with no claude → all fallback assessments
    assert.ok(r.block.includes('No activity noted this period.'));
  } finally {
    process.env.PATH = savedPath;
  }
});

test('monthly block absent when no manager review exists (RRPT-04)', async () => {
  // 2021-09-30 is in 2021-cycle3. No manager files exist for any prior 2021 cycle in this vault.
  const r = await buildProgressFeedbackBlock(
    '2021-09-30',
    MONTHLY_CFG,
    { corpusLabel: 'month', corpusBlock: '## --- 2021-W39 ---\n\n(weekly)' },
  );
  assert.equal(r, null, 'block should be null when no completed cycle has a manager review');
});

// ─── Source-grep guardrail (RRPT-02 wiring proof) ────────────────────────────

test('report.js source contains corpusLabel: month (monthly orchestrator wiring guardrail)', () => {
  const src = readFileSync(new URL('../src/commands/report.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /corpusLabel: 'month'/, "report.js must pass corpusLabel: 'month' to buildProgressFeedbackBlock");
});

