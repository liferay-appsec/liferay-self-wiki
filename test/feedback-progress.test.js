import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setVaultPath } from '../src/utils/paths.js';
import {
  resolveApplicableFeedbackCycle,
  renderProgressBlock,
  parseAssessments,
  synthesizeFeedbackAssessments,
  buildProgressFeedbackBlock,
} from '../src/core/feedback-progress.js';

let tmp, vault;

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

const DEFAULT_CFG = {
  review: { cycleEndMonths: [5, 9, 12] },
};

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-feedback-progress-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  vault = join(tmp, 'vault');
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
      review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null },
    }, null, 2),
    'utf8',
  );
  setVaultPath(vault);
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ─── resolveApplicableFeedbackCycle ─────────────────────────────────────────

test('resolveApplicableFeedbackCycle returns { cycleName, items } for nearest completed cycle with items (D-01)', async () => {
  // 2026-04-15 is in 2026-cycle1 (Jan–Apr). The previous cycle is 2025-cycle3 (Sep–Dec 2025).
  // 2025-cycle3 ends 2025-12-31 which is strictly < 2026-04-15 ✓
  writeFileSync(
    join(vault, 'Reviews', '2025-cycle3-manager.md'),
    managerReviewBody('2025-cycle3', [
      { id: 'FB-1', text: 'Be more concise in PR descriptions' },
      { id: 'FB-2', text: 'Deepen OSGi knowledge' },
    ]),
    'utf8',
  );
  const result = await resolveApplicableFeedbackCycle('2026-04-15', DEFAULT_CFG);
  assert.ok(result !== null, 'should find 2025-cycle3');
  assert.equal(result.cycleName, '2025-cycle3');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, 'FB-1');
  assert.equal(result.items[0].text, 'Be more concise in PR descriptions');
});

test('resolveApplicableFeedbackCycle returns null when no manager file exists (RRPT-04)', async () => {
  // Use a date whose prior cycles have no manager files: clean slate under a
  // date range we haven't written anything for. Use year 2020 which has no
  // Reviews files in our tmp vault.
  const result = await resolveApplicableFeedbackCycle('2020-06-15', DEFAULT_CFG);
  assert.equal(result, null, 'should return null when no completed cycle has a manager review');
});

test('resolveApplicableFeedbackCycle steps past cycles with absent manager file (D-02)', async () => {
  // 2024-06-15 is in 2024-cycle2 (May–Aug). previous = 2024-cycle1 (Jan–Apr).
  // 2024-cycle1 has no manager file → step to 2023-cycle3 → write that one.
  writeFileSync(
    join(vault, 'Reviews', '2023-cycle3-manager.md'),
    managerReviewBody('2023-cycle3', [{ id: 'FB-1', text: 'Improve test coverage' }]),
    'utf8',
  );
  // Ensure 2024-cycle1-manager.md does NOT exist (no write needed — it shouldn't be there)
  const result = await resolveApplicableFeedbackCycle('2024-06-15', DEFAULT_CFG);
  assert.ok(result !== null, 'should step past missing 2024-cycle1 and find 2023-cycle3');
  assert.equal(result.cycleName, '2023-cycle3');
  assert.equal(result.items[0].text, 'Improve test coverage');
});

test('resolveApplicableFeedbackCycle steps past cycles with zero items (D-02)', async () => {
  // 2027-06-15 is in 2027-cycle2. previous = 2027-cycle1 (Jan–Apr).
  // Write 2027-cycle1 with empty feedback section, then 2026-cycle3 with real items.
  writeFileSync(
    join(vault, 'Reviews', '2027-cycle1-manager.md'),
    managerReviewBody('2027-cycle1', []), // zero items
    'utf8',
  );
  writeFileSync(
    join(vault, 'Reviews', '2026-cycle3-manager.md'),
    managerReviewBody('2026-cycle3', [{ id: 'FB-1', text: 'Write better commit messages' }]),
    'utf8',
  );
  const result = await resolveApplicableFeedbackCycle('2027-06-15', DEFAULT_CFG);
  assert.ok(result !== null, 'should skip zero-item cycle and find 2026-cycle3');
  assert.equal(result.cycleName, '2026-cycle3');
  assert.equal(result.items[0].text, 'Write better commit messages');
});

test('resolveApplicableFeedbackCycle never returns the in-progress cycle (D-01 guard)', async () => {
  // 2026-06-15 is in 2026-cycle2 (May–Aug, end 2026-08-31).
  // 2026-cycle2 is NOT completed relative to 2026-06-15 — its end (2026-08-31) >= periodDateStr.
  // So it must not be considered. The nearest completed cycle is 2026-cycle1 (end 2026-04-30).
  writeFileSync(
    join(vault, 'Reviews', '2026-cycle2-manager.md'),
    managerReviewBody('2026-cycle2', [{ id: 'FB-1', text: 'SHOULD NOT APPEAR' }]),
    'utf8',
  );
  writeFileSync(
    join(vault, 'Reviews', '2026-cycle1-manager.md'),
    managerReviewBody('2026-cycle1', [{ id: 'FB-1', text: 'Be more proactive in reviews' }]),
    'utf8',
  );
  const result = await resolveApplicableFeedbackCycle('2026-06-15', DEFAULT_CFG);
  assert.ok(result !== null);
  assert.notEqual(result.cycleName, '2026-cycle2', 'must not return the current (in-progress) cycle');
  assert.equal(result.cycleName, '2026-cycle1');
});

test('resolveApplicableFeedbackCycle uses default cycleEndMonths when cfg has none', async () => {
  // Passing a cfg without review.cycleEndMonths should fall back to [5,9,12]
  // 2025-06-15 is in 2025-cycle2 (May–Aug). previous = 2025-cycle1.
  writeFileSync(
    join(vault, 'Reviews', '2025-cycle1-manager.md'),
    managerReviewBody('2025-cycle1', [{ id: 'FB-1', text: 'Add missing error handling' }]),
    'utf8',
  );
  const result = await resolveApplicableFeedbackCycle('2025-06-15', {});
  assert.ok(result !== null);
  assert.equal(result.cycleName, '2025-cycle1');
});

// ─── renderProgressBlock ─────────────────────────────────────────────────────

test('renderProgressBlock starts with ## Progress vs. review feedback heading', () => {
  const block = renderProgressBlock(
    [{ id: 'FB-1', text: 'Be more concise in PR descriptions' }],
    new Map(),
  );
  assert.ok(block.startsWith('## Progress vs. review feedback'), `got: ${block.slice(0, 50)}`);
});

test('renderProgressBlock renders verbatim FB-N line byte-identical to input (RRPT-03)', () => {
  const items = [
    { id: 'FB-1', text: 'Be more concise in PR descriptions' },
    { id: 'FB-2', text: 'Deepen OSGi knowledge' },
  ];
  const block = renderProgressBlock(items, new Map());
  assert.ok(block.includes('- **FB-1**: Be more concise in PR descriptions'));
  assert.ok(block.includes('- **FB-2**: Deepen OSGi knowledge'));
});

test('renderProgressBlock uses fallback when assessmentsMap has no entry for an item (D-05)', () => {
  const block = renderProgressBlock(
    [{ id: 'FB-1', text: 'Be more concise in PR descriptions' }],
    new Map(),
  );
  assert.ok(block.includes('No activity noted this period.'), `block: ${block}`);
});

test('renderProgressBlock stitches model assessment prose beneath the verbatim line (D-04)', () => {
  const assessments = new Map([['FB-2', 'Shipped the big refactor this week.']]);
  const block = renderProgressBlock(
    [{ id: 'FB-2', text: 'Refactor the login flow' }],
    assessments,
  );
  assert.ok(block.includes('Shipped the big refactor this week.'));
  assert.ok(!block.includes('No activity noted this period.'));
});

test('renderProgressBlock renders every item even when assessment map is empty', () => {
  const items = [
    { id: 'FB-1', text: 'One' },
    { id: 'FB-2', text: 'Two' },
    { id: 'FB-3', text: 'Three' },
  ];
  const block = renderProgressBlock(items, new Map());
  for (const { id, text } of items) {
    assert.ok(block.includes(`- **${id}**: ${text}`), `missing item ${id}`);
  }
});

test('renderProgressBlock does NOT contain the heading ## Review feedback addressed (D-03 naming guard)', () => {
  const block = renderProgressBlock([{ id: 'FB-1', text: 'x' }], new Map());
  assert.ok(!block.includes('## Review feedback addressed'), 'must use distinct heading');
});

// ─── parseAssessments ────────────────────────────────────────────────────────

test('parseAssessments parses FB-N: <text> lines into a Map', () => {
  const map = parseAssessments('FB-1: did the thing\nFB-2:  trimmed value\n');
  assert.equal(map.get('FB-1'), 'did the thing');
  assert.equal(map.get('FB-2'), 'trimmed value');
});

test('parseAssessments ignores preamble and non-matching lines', () => {
  const raw = 'Here is the assessment output:\nFB-1: made progress on it\nsome trailing note\nFB-2: nothing relevant';
  const map = parseAssessments(raw);
  assert.equal(map.get('FB-1'), 'made progress on it');
  assert.equal(map.get('FB-2'), 'nothing relevant');
  assert.equal(map.size, 2);
});

test('parseAssessments returns empty Map for empty string', () => {
  const map = parseAssessments('');
  assert.equal(map.size, 0);
});

// ─── synthesizeFeedbackAssessments ───────────────────────────────────────────

test('synthesizeFeedbackAssessments returns empty Map when claude CLI is absent (soft-degrade)', async () => {
  // Temporarily clear PATH so hasClaudeCli() returns false
  const savedPath = process.env.PATH;
  process.env.PATH = '/nonexistent';
  try {
    const items = [{ id: 'FB-1', text: 'Be more concise' }];
    const map = await synthesizeFeedbackAssessments({
      items,
      corpusLabel: 'week',
      corpusBlock: 'some daily log content',
    });
    assert.ok(map instanceof Map, 'should return a Map');
    assert.equal(map.size, 0, 'empty Map on soft-degrade');
  } finally {
    process.env.PATH = savedPath;
  }
});

// ─── buildProgressFeedbackBlock ──────────────────────────────────────────────

test('buildProgressFeedbackBlock returns null when no applicable completed cycle exists (RRPT-04)', async () => {
  // 2019-06-15 is far back — no manager files exist for those cycles
  const result = await buildProgressFeedbackBlock('2019-06-15', DEFAULT_CFG, {
    corpusLabel: 'week',
    corpusBlock: 'no log content',
  });
  assert.equal(result, null);
});

test('buildProgressFeedbackBlock returns { cycleName, block } when a cycle is found', async () => {
  // 2028-06-15 is in 2028-cycle2. We'll write a manager file for 2028-cycle1.
  writeFileSync(
    join(vault, 'Reviews', '2028-cycle1-manager.md'),
    managerReviewBody('2028-cycle1', [{ id: 'FB-1', text: 'Improve documentation quality' }]),
    'utf8',
  );
  // Run with no PATH so synthesize degrades → all-fallback assessments still produce a block
  const savedPath = process.env.PATH;
  process.env.PATH = '/nonexistent';
  try {
    const result = await buildProgressFeedbackBlock('2028-06-15', DEFAULT_CFG, {
      corpusLabel: 'week',
      corpusBlock: 'daily log content here',
    });
    assert.ok(result !== null);
    assert.equal(result.cycleName, '2028-cycle1');
    assert.ok(result.block.startsWith('## Progress vs. review feedback'));
    assert.ok(result.block.includes('- **FB-1**: Improve documentation quality'));
    // With soft-degrade, fallback assessment renders
    assert.ok(result.block.includes('No activity noted this period.'));
  } finally {
    process.env.PATH = savedPath;
  }
});
