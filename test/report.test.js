import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
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

function managerReviewBody(cycleName, items) {
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

const DEFAULT_CFG = { review: { cycleEndMonths: [5, 9, 12] } };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-report-weekly-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');

  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  mkdirSync(join(vault, 'Reports'), { recursive: true });
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
      components: [],
      review: { cycleEndMonths: [5, 9, 12] },
    }, null, 2),
    'utf8',
  );

  // Add a daily for 2026-06-19 (a Friday in 2026-W25, inside 2026-cycle2)
  writeFileSync(
    join(vault, 'Daily', '2026-06-19.md'),
    `# 2026-06-19\n\n## Session 1 — Task: LPD-12345 — auth work\n- Started: 09:00\n- Note [09:15]: landed the auth fix\n- Ended: 10:00\n- Duration: 60 min\n- Completed: ✅\n`,
    'utf8',
  );

  setVaultPath(vault);
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

// ─── buildProgressFeedbackBlock: weekly present/absent (RRPT-01, RRPT-04) ────

test('weekly block present when completed-cycle manager review with items exists (RRPT-01)', async () => {
  // 2026-06-19 is in 2026-cycle2 (May–Aug). Previous completed cycle = 2026-cycle1 (end 2026-04-30).
  writeFileSync(
    join(vault, 'Reviews', '2026-cycle1-manager.md'),
    managerReviewBody('2026-cycle1', [
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
      '2026-06-19',
      DEFAULT_CFG,
      { corpusLabel: 'week', corpusBlock: '## --- 2026-06-19 ---\n\n(notes)' },
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

test('weekly block absent when no manager review exists (RRPT-04)', async () => {
  // 2022-06-15 is in 2022-cycle2. No manager files exist for any prior cycle in 2022 in this vault.
  const r = await buildProgressFeedbackBlock(
    '2022-06-15',
    DEFAULT_CFG,
    { corpusLabel: 'week', corpusBlock: '## --- 2022-06-15 ---\n\n(notes)' },
  );
  assert.equal(r, null, 'block should be null when no completed cycle has a manager review');
});

// ─── Source-grep guardrail (RRPT-01 wiring proof) ────────────────────────────

test('report.js source contains buildProgressFeedbackBlock and insertProgressBlock (wiring guardrail)', () => {
  const src = readFileSync(new URL('../src/commands/report.js', import.meta.url).pathname, 'utf8');
  assert.match(src, /buildProgressFeedbackBlock/, 'buildProgressFeedbackBlock must be imported and used');
  assert.match(src, /insertProgressBlock/, 'insertProgressBlock must be defined and used');
});

// ─── CLI dry-run: block is ABSENT (dry-run skips the block per Plan 02 gating) ─

test('--week --dry-run exits 0 and does NOT insert the Progress block items', () => {
  // dry-run prints the synthesis prompt only. The code-rendered progress block
  // (with verbatim FB-N item lines) is NOT inserted because opts.dryRun gates
  // buildProgressFeedbackBlock to null (see report.js: progress = opts.dryRun ? null : ...).
  // The prompt template text may mention the heading name in backticks as an instruction,
  // but the actual rendered `- **FB-1**:` bullet lines are absent.
  const r = runCli(['--week', '2026-W25', '--dry-run']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  // The verbatim item lines are the proof that the block was rendered — they must NOT appear
  assert.ok(
    !r.stdout.includes('- **FB-1**: Be more concise in PR descriptions'),
    'dry-run output must NOT include the rendered FB-1 item line (block was not inserted)',
  );
  // The prompt must be present (sanity check)
  assert.match(r.stdout, /WEEK: 2026-W25/, 'dry-run must still print the synthesis prompt');
});
