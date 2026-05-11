import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

let tmp, vault;
const CLI_ENTRY = new URL('../src/cli.js', import.meta.url).pathname;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-self-review-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');

  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  mkdirSync(join(vault, 'Reports'), { recursive: true });
  mkdirSync(join(vault, 'Reviews'), { recursive: true });
  mkdirSync(join(vault, 'Tickets'), { recursive: true });
  mkdirSync(join(vault, 'Components'), { recursive: true });
  mkdirSync(join(vault, '.self-wiki'), { recursive: true });

  // user config -> points vaultPath at tmp vault. The CLI subprocess reads
  // this via applyUserConfig() before any command body runs.
  mkdirSync(join(tmp, 'cfg', 'self-wiki'), { recursive: true });
  writeFileSync(
    join(tmp, 'cfg', 'self-wiki', 'config.json'),
    JSON.stringify({ vaultPath: vault }, null, 2),
    'utf8',
  );

  // vault config — Liferay defaults.
  writeFileSync(
    join(vault, '.self-wiki', 'config.json'),
    JSON.stringify(
      {
        components: [],
        review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null },
      },
      null,
      2,
    ),
    'utf8',
  );

  // Seed a 2026-cycle1 monthly so dry-run has something to surface.
  writeFileSync(
    join(vault, 'Reports', '2026-02.md'),
    '# Monthly — Feb 2026\n\n## Theme(s) of the month\n- Wiki refinements.\n',
    'utf8',
  );

  // Seed a topic page touched in-cycle so loadInCycleTopicPages finds it.
  writeFileSync(
    join(vault, 'Tickets', 'LPD-12345.md'),
    '# LPD-12345\n\n## 2026-02-15 — Session 1\n- worked\n',
    'utf8',
  );
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runCli(args, opts = {}) {
  return spawnSync('node', [CLI_ENTRY, 'self-review', ...args], {
    env: {
      ...process.env,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    },
    encoding: 'utf8',
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Dry-run envelope smoke test (REVIEW-01 + REVIEW-08 + REVIEW-09)
// ---------------------------------------------------------------------------

test('--dry-run with --cycle prints the self-review prompt envelope', () => {
  const r = runCli(['--cycle', '2026-cycle1', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /CYCLE: 2026-cycle1/);
  assert.match(r.stdout, /MONTHLIES: \(primary — use as the spine\)/);
  assert.match(r.stdout, /WEEKLIES: \(secondary — for detail when monthly is thin\)/);
  assert.match(r.stdout, /TOPIC_PAGES: \(ticket\/component ground truth\)/);
  // Three review questions verbatim from self-review.md prompt header.
  assert.match(r.stdout, /## 1\. What have you accomplished/);
  assert.match(r.stdout, /## 2\. .* something you would have done differently/);
  assert.match(r.stdout, /## 3\. What is your current area of focus as you "Grow & Get Better"/);
  // 5 Liferay values inlined.
  assert.match(r.stdout, /Produce Excellence/);
  assert.match(r.stdout, /Lead by Serving/);
  assert.match(r.stdout, /Value People/);
  assert.match(r.stdout, /Grow & Get Better/);
  assert.match(r.stdout, /Stay Nerdy/);
  // Sources line surfaces the in-cycle monthly + topic page.
  assert.match(r.stdout, /Reports\/2026-02\.md/);
  assert.match(r.stdout, /Tickets\/LPD-12345\.md/);
  // Dry-run does NOT write a Reviews file.
  assert.equal(existsSync(join(vault, 'Reviews', '2026-cycle1.md')), false);
  // Dry-run does NOT print "wrote".
  assert.ok(!r.stdout.includes('wrote '));
});

// ---------------------------------------------------------------------------
// Mutex flag validation
// ---------------------------------------------------------------------------

test('--cycle and --since together is a usage error (exit 1)', () => {
  const r = runCli(['--cycle', '2026-cycle1', '--since', '2026-01-15', '--dry-run']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /mutually exclusive/);
});

test('--last-cycle and --cycle together is a usage error (exit 1)', () => {
  const r = runCli(['--last-cycle', '--cycle', '2026-cycle1', '--dry-run']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /mutually exclusive/);
});

test('--cycle with malformed value exits 1', () => {
  const r = runCli(['--cycle', 'not-a-cycle', '--dry-run']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid --cycle value/);
});

test('--since with malformed value exits 1', () => {
  const r = runCli(['--since', '2026/01/15', '--dry-run']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid --since value/);
});

// ---------------------------------------------------------------------------
// Refuse-without-force (D-03)
// ---------------------------------------------------------------------------

test('refuse-without-force on existing Reviews/<cycle>.md (D-03)', () => {
  // Seed an existing review file.
  writeFileSync(join(vault, 'Reviews', '2026-cycle1.md'), '# Old hand-edited review\n', 'utf8');
  // No --force; must refuse. Use PATH=/nonexistent so claude is missing —
  // the soft-fail path is taken AFTER the existence check, so the test
  // still asserts the existence-check fires first.
  const r = spawnSync(process.execPath, [CLI_ENTRY, 'self-review', '--cycle', '2026-cycle1'], {
    env: {
      ...process.env,
      PATH: '/nonexistent',
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    },
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
  assert.match(r.stderr, /Use --force/);
  // The file content must be untouched.
  const body = readFileSync(join(vault, 'Reviews', '2026-cycle1.md'), 'utf8');
  assert.match(body, /Old hand-edited review/);
});

// ---------------------------------------------------------------------------
// Dry-run does NOT trigger any write or backfill (D-07)
// ---------------------------------------------------------------------------

test('--dry-run on a cycle with missing monthlies surfaces them in the prompt but does NOT backfill', () => {
  // Cycle 2026-cycle1 = Jan 1 → Apr 30 (4 monthlies needed: 01, 02, 03, 04).
  // We have only 2026-02.md; 01, 03, 04 are missing.
  // (Slice 1 doesn't backfill at all; the missingMonthlyNote should appear.)
  const r = runCli(['--cycle', '2026-cycle1', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  // No Reports/<other-month>.md was created by the dry-run.
  assert.equal(existsSync(join(vault, 'Reports', '2026-01.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-03.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-04.md')), false);
  // The WINDOW_NOTE surfaces the missing monthlies as a hint to the user.
  assert.match(r.stdout, /WINDOW_NOTE:/);
  assert.match(r.stdout, /Missing monthlies/);
});

// ---------------------------------------------------------------------------
// Soft-fail-to-dry-run on missing claude (REVIEW-08 + ROADMAP criterion 5)
// DIVERGENT from report --month behavior (which exits 2).
// ---------------------------------------------------------------------------

test('Without --dry-run, missing `claude` soft-fails to dry-run with stderr notice', () => {
  // Remove the existing review file so refuse-without-force does NOT fire first.
  const reviewPath = join(vault, 'Reviews', '2026-cycle1.md');
  try { unlinkSync(reviewPath); } catch {}

  const r = spawnSync(process.execPath, [CLI_ENTRY, 'self-review', '--cycle', '2026-cycle1'], {
    env: {
      ...process.env,
      PATH: '/nonexistent',
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    },
    encoding: 'utf8',
  });
  // Soft-fail: exit 0 (NOT exit 2 — divergent from report --month).
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stderr, /claude.* CLI not found on PATH/);
  assert.match(r.stderr, /printing prompt to stdout instead/);
  // Prompt envelope present in stdout.
  assert.match(r.stdout, /CYCLE: 2026-cycle1/);
  // No Reviews/<cycle>.md file was written.
  assert.equal(existsSync(reviewPath), false);
  // No vault-config writeback either — that only happens after a successful claude invocation.
  const cfg = JSON.parse(readFileSync(join(vault, '.self-wiki', 'config.json'), 'utf8'));
  assert.equal(cfg.review.lastReviewedAt, null);
  assert.equal(cfg.review.lastReviewedCycle, null);
});

// ---------------------------------------------------------------------------
// --prior-review manual override
// ---------------------------------------------------------------------------

test('--prior-review reads the manual file and emits PRIOR_REVIEW block', () => {
  const manualPath = join(tmp, 'manual-prior.md');
  writeFileSync(manualPath, '# Old Manual Review\n\n## 3. Growth\n- focus on TDD\n', 'utf8');
  const r = runCli(['--cycle', '2026-cycle1', '--prior-review', manualPath, '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /PRIOR_REVIEW:/);
  assert.match(r.stdout, /focus on TDD/);
});

test('auto-detect prior cycle review surfaces as PRIOR_GROWTH_FOCUS when present', () => {
  // Seed Reviews/2025-cycle3.md with a Q3 section.
  writeFileSync(
    join(vault, 'Reviews', '2025-cycle3.md'),
    '# 2025-cycle3 review\n\n## 1. Stuff\n- x\n\n## 3. What is your current area of focus\n- pairing more\n\n## Sources\n- file.md\n',
    'utf8',
  );
  const r = runCli(['--cycle', '2026-cycle1', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /PRIOR_GROWTH_FOCUS \(2025-cycle3\):/);
  assert.match(r.stdout, /pairing more/);
});

// ---------------------------------------------------------------------------
// Structural-guard tests (no claude stub yet — see report-month.test.js rationale)
// ---------------------------------------------------------------------------

test('regenerated-marker code path exists in src/core/reviews.js (D-03 grep guardrail)', () => {
  const src = readFileSync(new URL('../src/core/reviews.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /<!-- regenerated /);
  assert.match(src, /already exists/);
  assert.match(src, /access\(outPath\)/);
});

test('vault-config writeback wires lastReviewedAt + lastReviewedCycle (REVIEW-07 grep guardrail)', () => {
  const src = readFileSync(new URL('../src/core/reviews.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /writeVaultConfig\(\{/);
  assert.match(src, /lastReviewedAt/);
  assert.match(src, /lastReviewedCycle/);
});

test('soft-fail-to-dry-run code path exists in src/core/reviews.js (REVIEW-08 grep guardrail)', () => {
  const src = readFileSync(new URL('../src/core/reviews.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /printing prompt to stdout instead/);
  assert.match(src, /hasClaudeCli/);
});
