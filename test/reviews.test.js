import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
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
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.start, '2026-01-01');
  assert.equal(r.end, '2026-04-30');
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

test('resolveReviewWindow: preferCompletedCycle skips lastReviewedAt and targets the completed cycle (review-record default)', () => {
  // lastReviewedAt is in the review-month (May), which lands in cycle2's date range
  // even though cycle1 was the cycle reviewed. review record must file under cycle1.
  const cfg = {
    review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: '2026-05-11', lastReviewedCycle: '2026-cycle1' },
  };
  // Without the flag (self-review/report) the implicit-since path still yields cycle2 — unchanged.
  assert.equal(resolveReviewWindow({ today: '2026-06-15', vaultConfig: cfg }).cycleName, '2026-cycle2');
  // With the flag (review record) it falls through to the most-recently-completed cycle.
  const r = resolveReviewWindow({ today: '2026-06-15', vaultConfig: cfg, preferCompletedCycle: true });
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.end, '2026-04-30');
  assert.equal(r.partialNote, null);
});

test('resolveReviewWindow: D-01 default — bare invocation picks most recently ended cycle', () => {
  const r = resolveReviewWindow({ today: '2026-06-15', vaultConfig: defaultVaultCfg });
  assert.equal(r.cycleName, '2026-cycle1');
  assert.equal(r.end, '2026-04-30');
  assert.equal(r.partialNote, null);
});

test('resolveReviewWindow: D-01 default — at start of new cycle, prior cycle just ended', () => {
  const r = resolveReviewWindow({ today: '2026-05-01', vaultConfig: defaultVaultCfg });
  assert.equal(r.cycleName, '2026-cycle1');
});

test('resolveReviewWindow: throws when vault config lacks review.cycleEndMonths', () => {
  assert.throws(
    () => resolveReviewWindow({ today: '2026-06-15', vaultConfig: { review: {} } }),
    /missing review\.cycleEndMonths/,
  );
});

test('loadPriorCycleReview: manual path wins over auto-detect (D-12)', async () => {
  const manualPath = join(global.__reviewVault, 'manual.md');
  writeFileSync(manualPath, '# Old Review\n\n## 3. Growth\n- focus on testing\n', 'utf8');
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
  assert.ok(!r.body.includes('## Sources'));
});

test('loadPriorCycleReview: auto-detect with no prior file → null', async () => {
  const priorPath = join(global.__reviewVault, 'Reviews', '2025-cycle3.md');
  try { (await import('fs')).unlinkSync(priorPath); } catch {}
  const r = await loadPriorCycleReview({
    cycleName: '2026-cycle1',
    cycleEndMonths: [5, 9, 12],
  });
  assert.equal(r, null);
});

test('loadInCycleTopicPages: surfaces topic pages with in-cycle ## date headers', async () => {
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
  assert.match(out, /## --- 2026-01 ---/);
  assert.match(out, /## --- 2026-02 ---/);
  assert.match(out, /## --- 2026-W14 ---/);
  assert.match(out, /## --- LPD-12345 ---/);
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
  // Envelope-specific marker is `PRIOR_GROWTH_FOCUS (<priorCycleName>):`. The
  // bare token `PRIOR_GROWTH_FOCUS` appears in the prompt header as
  // documentation, so check only that the envelope block was not emitted.
  assert.ok(!out.includes('PRIOR_GROWTH_FOCUS ('));
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
