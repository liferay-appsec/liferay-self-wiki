import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ensureReviewsDir,
  resolveReviewWindow,
  loadPriorCycleReview,
} from '../src/core/reviews.js';

let tmp;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-reviews-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  const paths = await import('../src/utils/paths.js');
  const reviewVault = join(tmp, 'reviewVault');
  mkdirSync(join(reviewVault, 'Reviews'), { recursive: true });
  paths.setVaultPath(reviewVault);
  global.__reviewVault = reviewVault;
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('ensureReviewsDir creates Reviews/ in a fresh vault', async () => {
  const vault = join(tmp, 'fresh');
  mkdirSync(vault, { recursive: true });
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});

test('ensureReviewsDir succeeds when Reviews/ already exists (idempotent)', async () => {
  const vault = join(tmp, 'pre-existing');
  mkdirSync(join(vault, 'Reviews'), { recursive: true });
  // Should not throw.
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});

test('ensureReviewsDir is safe on repeated calls (double invocation)', async () => {
  const vault = join(tmp, 'double-call');
  mkdirSync(vault, { recursive: true });
  await ensureReviewsDir(vault);
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});

test('ensureReviewsDir creates intermediate parents (recursive mkdir)', async () => {
  const vault = join(tmp, 'deep', 'nested', 'vault');
  // Deliberately do NOT pre-create the parent — recursive: true should handle it.
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});

// ---------------------------------------------------------------------------
// resolveReviewWindow — REVIEW-02 precedence + D-01 + D-04
// ---------------------------------------------------------------------------

const defaultVaultCfg = {
  review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null },
};

test('resolveReviewWindow: --cycle wins; returns the named cycle window', () => {
  const r = resolveReviewWindow({
    cycle: '2026-cycle1',
    today: '2026-06-15',
    vaultConfig: defaultVaultCfg,
  });
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.start, '2026-01-01');
  assert.equal(r.end, '2026-04-30');
  assert.equal(r.partialNote, null);
});

test('resolveReviewWindow: invalid --cycle value throws', () => {
  assert.throws(
    () => resolveReviewWindow({ cycle: 'not-a-cycle', today: '2026-06-15', vaultConfig: defaultVaultCfg }),
    /invalid --cycle value/,
  );
  assert.throws(
    () => resolveReviewWindow({ cycle: '2026-cycle9', today: '2026-06-15', vaultConfig: defaultVaultCfg }),
    /invalid --cycle value/,
  );
});

test('resolveReviewWindow: --last-cycle resolves to resolveCycle(today).previous', () => {
  const r = resolveReviewWindow({
    lastCycle: true,
    today: '2026-07-15',
    vaultConfig: defaultVaultCfg,
  });
  // Today (Jul 15) is in 2026-cycle2 (May 1 → Aug 31) under Option B; previous = 2026-cycle1 (Jan 1 → Apr 30).
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.start, '2026-01-01');
  assert.equal(r.end, '2026-04-30');
});

test('resolveReviewWindow: --since on cycle-start emits no partialNote', () => {
  const r = resolveReviewWindow({
    since: '2026-01-01',
    today: '2026-06-15',
    vaultConfig: defaultVaultCfg,
  });
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.start, '2026-01-01');
  assert.equal(r.end, '2026-04-30');
  assert.equal(r.partialNote, null);
});

test('resolveReviewWindow: --since off-boundary snaps to enclosing cycle and emits partialNote (D-04)', () => {
  const r = resolveReviewWindow({
    since: '2026-02-15',
    today: '2026-06-15',
    vaultConfig: defaultVaultCfg,
  });
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.start, '2026-02-15');
  assert.equal(r.end, '2026-04-30');
  assert.match(r.partialNote, /Custom window 2026-02-15 → 2026-04-30/);
  assert.match(r.partialNote, /partial slice of 2026-cycle1/);
});

test('resolveReviewWindow: vault lastReviewedAt acts as implicit --since', () => {
  const cfg = {
    review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: '2026-03-15', lastReviewedCycle: '2026-cycle1' },
  };
  const r = resolveReviewWindow({ today: '2026-06-15', vaultConfig: cfg });
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.start, '2026-03-15');
  assert.equal(r.end, '2026-04-30');
  assert.match(r.partialNote, /Custom window 2026-03-15.*since last review/);
});

test('resolveReviewWindow: explicit --since overrides vault lastReviewedAt', () => {
  const cfg = {
    review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: '2025-11-15', lastReviewedCycle: '2025-cycle3' },
  };
  const r = resolveReviewWindow({ since: '2026-02-01', today: '2026-06-15', vaultConfig: cfg });
  assert.equal(r.start, '2026-02-01');
  assert.equal(r.cycleName, '2026-cycle1');
});

test('resolveReviewWindow: D-01 default — bare invocation picks most recently ended cycle', () => {
  // 2026-06-15 → resolveCycle.current = 2026-cycle2 (May 1 → Aug 31, NOT yet ended);
  // .previous = 2026-cycle1 (Jan 1 → Apr 30, ended). So default = previous.
  const r = resolveReviewWindow({ today: '2026-06-15', vaultConfig: defaultVaultCfg });
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.end, '2026-04-30');
  assert.equal(r.partialNote, null);
});

test('resolveReviewWindow: D-01 default — at start of new cycle, prior cycle just ended', () => {
  // 2026-05-01 → current = 2026-cycle2 (May 1 → Aug 31, NOT yet ended);
  // previous = 2026-cycle1 (Jan 1 → Apr 30 — ended yesterday). Default = previous.
  const r = resolveReviewWindow({ today: '2026-05-01', vaultConfig: defaultVaultCfg });
  assert.equal(r.cycleName, '2026-cycle1');
});

test('resolveReviewWindow: throws when vault config lacks review.cycleEndMonths', () => {
  assert.throws(
    () => resolveReviewWindow({ today: '2026-06-15', vaultConfig: { review: {} } }),
    /missing review\.cycleEndMonths/,
  );
});

// ---------------------------------------------------------------------------
// loadPriorCycleReview — D-12 (manual override wins; auto-detects Q3)
// ---------------------------------------------------------------------------

test('loadPriorCycleReview: manual path wins over auto-detect (D-12)', async () => {
  const manualPath = join(global.__reviewVault, 'manual.md');
  writeFileSync(manualPath, '# Old Review\n\n## 3. Growth\n- focus on testing\n', 'utf8');
  // Also seed the auto-detect file — manual must still win.
  writeFileSync(join(global.__reviewVault, 'Reviews', '2025-cycle3.md'), '# Auto Review\n', 'utf8');
  const r = await loadPriorCycleReview({
    cycleName: '2026-cycle1',
    manualPath,
    cycleEndMonths: [5, 9, 12],
  });
  assert.equal(r.kind, 'manual');
  assert.equal(r.path, manualPath);
  assert.match(r.body, /focus on testing/);
});

test('loadPriorCycleReview: manual missing → null (soft-fail)', async () => {
  const r = await loadPriorCycleReview({
    cycleName: '2026-cycle1',
    manualPath: '/nonexistent/never/here.md',
    cycleEndMonths: [5, 9, 12],
  });
  assert.equal(r, null);
});

test('loadPriorCycleReview: auto-detect Q3 from prior cycle when no manualPath', async () => {
  const priorPath = join(global.__reviewVault, 'Reviews', '2025-cycle3.md');
  writeFileSync(priorPath, [
    '# Self-Review — 2025-cycle3',
    '',
    '## 1. Accomplishments',
    '- Did stuff',
    '',
    '## 2. Differently',
    '- nothing',
    '',
    '## 3. What is your current area of focus',
    '- TDD adoption across the team',
    '- Pairing more deliberately',
    '',
    '## Sources',
    '- file.md',
    '',
  ].join('\n'), 'utf8');

  const r = await loadPriorCycleReview({
    cycleName: '2026-cycle1',
    cycleEndMonths: [5, 9, 12],
  });
  assert.equal(r.kind, 'autoQ3');
  assert.equal(r.priorCycleName, '2025-cycle3');
  assert.match(r.body, /^## 3\. What is your current area of focus/);
  assert.match(r.body, /TDD adoption/);
  // Must NOT include the next ## Sources section.
  assert.ok(!r.body.includes('## Sources'));
});

test('loadPriorCycleReview: auto-detect with no Q3 returns empty body but kind=autoQ3', async () => {
  // Overwrite prior cycle file without a Q3 section.
  const priorPath = join(global.__reviewVault, 'Reviews', '2025-cycle3.md');
  writeFileSync(priorPath, '# Self-Review\n\n## 1. Accomplishments\n- x\n', 'utf8');
  const r = await loadPriorCycleReview({
    cycleName: '2026-cycle1',
    cycleEndMonths: [5, 9, 12],
  });
  assert.equal(r.kind, 'autoQ3');
  assert.equal(r.body, '');
});

test('loadPriorCycleReview: auto-detect with no prior file → null', async () => {
  // Remove the prior file.
  const priorPath = join(global.__reviewVault, 'Reviews', '2025-cycle3.md');
  try { (await import('fs')).unlinkSync(priorPath); } catch {}
  const r = await loadPriorCycleReview({
    cycleName: '2026-cycle1',
    cycleEndMonths: [5, 9, 12],
  });
  assert.equal(r, null);
});
