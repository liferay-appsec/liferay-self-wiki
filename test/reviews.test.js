import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ensureReviewsDir,
  resolveReviewWindow,
  loadPriorCycleReview,
  loadInCycleTopicPages,
  buildSelfReviewPrompt,
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

// ---------------------------------------------------------------------------
// loadInCycleTopicPages — REVIEW-05 + D-08
// ---------------------------------------------------------------------------

test('loadInCycleTopicPages: surfaces topic pages with in-cycle ## date headers', async () => {
  // Use the same global.__reviewVault from the earlier setup.
  const vault = global.__reviewVault;
  mkdirSync(join(vault, 'Tickets'), { recursive: true });
  mkdirSync(join(vault, 'Components'), { recursive: true });
  writeFileSync(join(vault, 'Tickets', 'LPD-12345.md'),
    '# LPD-12345\n\n## 2026-02-15 — Session 1\n- worked\n', 'utf8');
  writeFileSync(join(vault, 'Tickets', 'LPD-OTHER.md'),
    '# LPD-OTHER\n\n## 2024-01-01 — Session 1\n- old\n', 'utf8');
  writeFileSync(join(vault, 'Components', 'wiki.md'),
    '# wiki\n\n## 2026-03-22 — Session 2\n- worked\n', 'utf8');

  const cycleDates = ['2026-02-15', '2026-02-16', '2026-03-22'];
  const out = await loadInCycleTopicPages(cycleDates);

  const slugs = out.map((p) => p.slug).sort();
  assert.deepEqual(slugs, ['LPD-12345', 'wiki']);
  assert.equal(out.find((p) => p.slug === 'LPD-12345').kind, 'ticket');
  assert.equal(out.find((p) => p.slug === 'wiki').kind, 'component');
});

test('loadInCycleTopicPages: returns [] when dates is empty or missing dirs', async () => {
  assert.deepEqual(await loadInCycleTopicPages([]), []);
  assert.deepEqual(await loadInCycleTopicPages(null), []);
});

// ---------------------------------------------------------------------------
// buildSelfReviewPrompt — REVIEW-06 + REVIEW-09 + D-08 + D-13
// ---------------------------------------------------------------------------

test('buildSelfReviewPrompt: emits CYCLE, MONTHLIES (primary), WEEKLIES (secondary), TOPIC_PAGES blocks in order', async () => {
  const out = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [
      { monthStr: '2026-01', raw: '# Jan\nstuff' },
      { monthStr: '2026-02', raw: '# Feb\nmore' },
    ],
    weeklies: [{ weekStr: '2026-W14', raw: '# W14\nweek body' }],
    topicPages: [{ slug: 'LPD-12345', raw: '# Ticket', kind: 'ticket' }],
    priorReview: null,
  });
  assert.match(out, /CYCLE: 2026-cycle1 \(2026-01-01 → 2026-04-30\)/);
  assert.match(out, /MONTHLIES: \(primary — use as the spine\)/);
  assert.match(out, /WEEKLIES: \(secondary — for detail when monthly is thin\)/);
  assert.match(out, /TOPIC_PAGES: \(ticket\/component ground truth\)/);
  // Order: MONTHLIES must appear before WEEKLIES, which must appear before TOPIC_PAGES.
  const iM = out.indexOf('MONTHLIES:');
  const iW = out.indexOf('WEEKLIES:');
  const iT = out.indexOf('TOPIC_PAGES:');
  assert.ok(iM < iW && iW < iT, `expected order MONTHLIES < WEEKLIES < TOPIC_PAGES; got ${iM}, ${iW}, ${iT}`);
  // Per-input separators present.
  assert.match(out, /## --- 2026-01 ---/);
  assert.match(out, /## --- 2026-02 ---/);
  assert.match(out, /## --- 2026-W14 ---/);
  assert.match(out, /## --- LPD-12345 ---/);
  // Sources line surfaces files.
  assert.match(out, /Reports\/2026-01\.md/);
  assert.match(out, /Reports\/2026-02\.md/);
  assert.match(out, /Reports\/2026-W14\.md/);
  assert.match(out, /Tickets\/LPD-12345\.md/);
});

test('buildSelfReviewPrompt: emits empty placeholders when monthlies/weeklies/topics are empty', async () => {
  const out = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [],
    weeklies: [],
    topicPages: [],
    priorReview: null,
  });
  assert.match(out, /\(no monthlies for this cycle\)/);
  assert.match(out, /\(no weeklies for this cycle\)/);
  assert.match(out, /\(no in-cycle topic pages\)/);
  assert.match(out, /Sources: Monthlies: \(none\)\. Weeklies: \(none\)\./);
});

test('buildSelfReviewPrompt: emits PRIOR_REVIEW block on manual override', async () => {
  const out = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [],
    weeklies: [],
    topicPages: [],
    priorReview: { kind: 'manual', path: '/tmp/old.md', body: 'old review body content' },
  });
  assert.match(out, /PRIOR_REVIEW:/);
  assert.match(out, /old review body content/);
  assert.ok(!out.includes('PRIOR_GROWTH_FOCUS'));
});

test('buildSelfReviewPrompt: emits PRIOR_GROWTH_FOCUS on auto-detect with non-empty Q3', async () => {
  const out = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [],
    weeklies: [],
    topicPages: [],
    priorReview: { kind: 'autoQ3', path: '/v/Reviews/2025-cycle3.md', body: '## 3. Growth\n- TDD focus', priorCycleName: '2025-cycle3' },
  });
  assert.match(out, /PRIOR_GROWTH_FOCUS \(2025-cycle3\):/);
  assert.match(out, /TDD focus/);
  assert.ok(!out.includes('PRIOR_REVIEW:'));
});

test('buildSelfReviewPrompt: WINDOW_NOTE emitted when partialNote provided (D-04)', async () => {
  const out = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-02-15', end: '2026-04-30' },
    monthlies: [],
    weeklies: [],
    topicPages: [],
    priorReview: null,
    partialNote: 'Custom window 2026-02-15 → 2026-04-30; report covers a partial slice of 2026-cycle1.',
  });
  assert.match(out, /WINDOW_NOTE:/);
  assert.match(out, /partial slice of 2026-cycle1/);
});

test('buildSelfReviewPrompt: WINDOW_NOTE concatenates partialNote and missingMonthlyNote', async () => {
  const out = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [],
    weeklies: [],
    topicPages: [],
    priorReview: null,
    partialNote: 'Partial window note here.',
    missingMonthlyNote: 'Missing monthlies note here.',
  });
  assert.match(out, /WINDOW_NOTE:/);
  assert.match(out, /Partial window note here/);
  assert.match(out, /Missing monthlies note here/);
});

test('buildSelfReviewPrompt: METRICS block only emitted when metrics provided', async () => {
  const without = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [], weeklies: [], topicPages: [], priorReview: null,
  });
  assert.ok(!without.includes('METRICS:'));
  const withM = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [], weeklies: [], topicPages: [], priorReview: null,
    metrics: '- Sessions: 12\n- Tickets: 5',
  });
  assert.match(withM, /METRICS:\n- Sessions: 12/);
});

test('buildSelfReviewPrompt: prompt header from self-review.md is included', async () => {
  const out = await buildSelfReviewPrompt({
    window: { cycleName: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' },
    monthlies: [], weeklies: [], topicPages: [], priorReview: null,
  });
  // Top of self-review.md says "# Self-review synthesis prompt" and "Liferay values".
  assert.match(out, /# Self-review synthesis prompt/);
  assert.match(out, /## Liferay values/);
  assert.match(out, /Produce Excellence/);
});
