import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

let tmp, vault;
const CLI_ENTRY = new URL('../src/cli.js', import.meta.url).pathname;

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
  mkdirSync(join(vault, '.self-wiki'), { recursive: true });

  // user config -> points vaultPath at tmp vault. The CLI subprocess reads
  // this via applyUserConfig() and calls setVaultPath() before any command
  // body runs, so the orchestrator finds the vault.
  mkdirSync(join(tmp, 'cfg', 'self-wiki'), { recursive: true });
  writeFileSync(
    join(tmp, 'cfg', 'self-wiki', 'config.json'),
    JSON.stringify({ vaultPath: vault }, null, 2),
    'utf8',
  );

  // vault config with one component for matching.
  writeFileSync(
    join(vault, '.self-wiki', 'config.json'),
    JSON.stringify({ components: [{ slug: 'wiki', keywords: ['wiki'] }] }, null, 2),
    'utf8',
  );

  // Daily logs for April 2026 (a few sessions, mentioning 'wiki' so the
  // component-keyword match has something to find — though metrics counts
  // are not asserted, only the prompt envelope shape is).
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

  // Pre-existing weekly reports (W14, W15). W16/W17/W18 deliberately absent
  // so the test exercises the "Missing weeks: ..." sources-line branch.
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

  // Prior monthly report (used by the carry-over test).
  writeFileSync(
    join(vault, 'Reports', '2026-03.md'),
    `# Monthly Report — March 2026\n\n## Risks / carry-over\n- Tail-end review feedback on PR #1000.\n`,
    'utf8',
  );

  // Topic page touched in-month (April). The marker shape `## YYYY-MM-DD —`
  // is what src/core/topics.js#appendDatedSection writes; the orchestrator's
  // loadInMonthTopicPages greps for `## ${date} ` (date + trailing space).
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
  // Spawn the actual CLI entry — exercises argv parsing AND the
  // process.exit(...) paths used by the validators.
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
  // Pre-existing prior-month report should be loaded.
  assert.match(r.stdout, /PRIOR_REPORT \(2026-03\):/);
  // W14/W15 are present, W16-W18 are missing.
  assert.match(r.stdout, /Reports\/2026-W14\.md/);
  assert.match(r.stdout, /Missing weeks: 2026-W16, 2026-W17, 2026-W18/);
  // Topic page surfaces.
  assert.match(r.stdout, /Tickets\/LPD-12345\.md/);
  // Dry-run does NOT write.
  assert.equal(existsSync(join(vault, 'Reports', '2026-04.md')), false);
  // Dry-run does NOT print "wrote".
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
  // 2026-01 will be in the past whenever this test runs in 2026 or later.
  const r = runCli(['--month', '2026-01', '--dry-run']);
  // 2026-01 has no daily logs in the fixture; that's still a valid prompt.
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(!r.stdout.includes('Partial month'));
});

test('prior-month soft-fails when no prior monthly file exists (D-14)', () => {
  // Remove the prior monthly file we wrote in `before`.
  const priorPath = join(vault, 'Reports', '2026-03.md');
  if (existsSync(priorPath)) unlinkSync(priorPath);

  const r = runCli(['--month', '2026-04', '--dry-run']);
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('PRIOR_REPORT ('));

  // Restore for any subsequent test that depends on it.
  writeFileSync(
    priorPath,
    `# Monthly Report — March 2026\n\n## Risks / carry-over\n- Tail-end review feedback on PR #1000.\n`,
    'utf8',
  );
});

test('regenerated-marker code path exists in source (D-13 grep guardrail)', () => {
  // The live write+rewrite cycle requires the real `claude` CLI which is
  // out of scope for unit tests — verify the source contains the marker
  // logic and the runtime branch that prepends it.
  const src = readFileSync(new URL('../src/commands/report.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /<!-- regenerated /);
  assert.match(src, /access\(outPath\)/);
});

test('--dry-run does NOT backfill missing weeklies', () => {
  // Pre-condition: W18 (and W16/W17) weekly reports do not exist.
  // The fixture from `before` only writes W14 and W15.
  ['2026-W16', '2026-W17', '2026-W18'].forEach((w) => {
    const p = join(vault, 'Reports', `${w}.md`);
    if (existsSync(p)) unlinkSync(p);
  });

  const r = runCli(['--month', '2026-04', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);

  // Dry-run must NOT have created any new weekly file (D-15: dry-run
  // never silently invokes weekly synthesis).
  assert.equal(existsSync(join(vault, 'Reports', '2026-W18.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W17.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W16.md')), false);

  // Sources line still flags them as missing.
  assert.match(r.stdout, /Missing weeks: .*2026-W18/);
});

test('Without --dry-run, missing `claude` exits 2 before any backfill (no partial state)', () => {
  // Sanity: ensure no spurious weekly files exist from prior tests.
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

  // No partial state — no weekly was synthesized despite W18 having dailies on 2026-04-15.
  assert.equal(existsSync(join(vault, 'Reports', '2026-W18.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W17.md')), false);
  assert.equal(existsSync(join(vault, 'Reports', '2026-W16.md')), false);
  // The monthly file was also not produced.
  assert.equal(existsSync(join(vault, 'Reports', '2026-04.md')), false);
});

test('Backfill source contains the empty-week graceful-skip guard (MONTH-04)', () => {
  const src = readFileSync(new URL('../src/commands/report.js', import.meta.url).pathname, 'utf8');
  // The short-circuit helper must exist.
  assert.match(src, /async function anyDailyExists/);
  // The backfill loop must consult it.
  assert.match(src, /hasAnyDaily/);
  // The continue branch must exist (graceful skip rather than error).
  assert.match(src, /if \(!hasAnyDaily\) continue/);
  // The hasClaudeCli pre-check must precede the loop.
  assert.match(src, /hasClaudeCli/);
});

test('Dry-run on a month with zero dailies completes cleanly without writes', () => {
  // 2025-07 — no fixture writes for it. All overlapping weeks are missing.
  ['2025-W27', '2025-W28', '2025-W29', '2025-W30', '2025-W31'].forEach((w) => {
    const p = join(vault, 'Reports', `${w}.md`);
    if (existsSync(p)) unlinkSync(p);
  });

  const r = runCli(['--month', '2025-07', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /MONTH: 2025-07/);
  // Every overlapping week should be flagged missing.
  assert.match(r.stdout, /Missing weeks:/);
  // No monthly file was written by the dry-run.
  assert.equal(existsSync(join(vault, 'Reports', '2025-07.md')), false);
});

