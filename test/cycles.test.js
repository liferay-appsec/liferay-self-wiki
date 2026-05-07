import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCycle } from '../src/core/cycles.js';

// ---------------------------------------------------------------------------
// Liferay default [5, 9, 12] — boundary cases for each cycle
// (D-11 success criterion 3, D-03 contiguous coverage, D-04 review-month rule)
// ---------------------------------------------------------------------------

test('resolveCycle Liferay [5,9,12] — Dec 1 2025 is start of 2026-cycle1', () => {
  const r = resolveCycle(new Date('2025-12-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2026-cycle1', start: '2025-12-01', end: '2026-04-30' });
  assert.deepEqual(r.previous, { name: '2025-cycle3', start: '2025-09-01', end: '2025-11-30' });
});

test('resolveCycle Liferay [5,9,12] — Apr 30 2026 is last day of 2026-cycle1', () => {
  const r = resolveCycle(new Date('2026-04-30T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle1');
  assert.equal(r.current.end, '2026-04-30');
  assert.equal(r.current.start, '2025-12-01');
});

test('resolveCycle Liferay [5,9,12] — review month (May) keeps current as 2026-cycle1 (D-04)', () => {
  const may1 = resolveCycle(new Date('2026-05-01T00:00:00Z'), [5, 9, 12]);
  assert.equal(may1.current.name, '2026-cycle1');
  assert.equal(may1.current.start, '2025-12-01');
  assert.equal(may1.current.end, '2026-04-30');
  const may31 = resolveCycle(new Date('2026-05-31T00:00:00Z'), [5, 9, 12]);
  assert.equal(may31.current.name, '2026-cycle1');
});

test('resolveCycle Liferay [5,9,12] — Jun 1 2026 rolls forward to 2026-cycle2', () => {
  const r = resolveCycle(new Date('2026-06-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2026-cycle2', start: '2026-05-01', end: '2026-08-31' });
  assert.deepEqual(r.previous, { name: '2026-cycle1', start: '2025-12-01', end: '2026-04-30' });
});

test('resolveCycle Liferay [5,9,12] — Aug 31 2026 is last day of 2026-cycle2', () => {
  const r = resolveCycle(new Date('2026-08-31T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle2');
  assert.equal(r.current.end, '2026-08-31');
});

test('resolveCycle Liferay [5,9,12] — Sep 1 2026 is 2026-cycle3', () => {
  const r = resolveCycle(new Date('2026-09-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2026-cycle3', start: '2026-09-01', end: '2026-11-30' });
  assert.deepEqual(r.previous, { name: '2026-cycle2', start: '2026-05-01', end: '2026-08-31' });
});

test('resolveCycle Liferay [5,9,12] — Nov 30 2026 is last day of 2026-cycle3', () => {
  const r = resolveCycle(new Date('2026-11-30T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle3');
  assert.equal(r.current.end, '2026-11-30');
});

test('resolveCycle Liferay [5,9,12] — Dec 1 2026 starts 2027-cycle1 (year-wrap forward)', () => {
  const r = resolveCycle(new Date('2026-12-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2027-cycle1', start: '2026-12-01', end: '2027-04-30' });
  assert.deepEqual(r.previous, { name: '2026-cycle3', start: '2026-09-01', end: '2026-11-30' });
});

// ---------------------------------------------------------------------------
// Year-wrap previousCycle (D-11 explicit example)
// ---------------------------------------------------------------------------

test('resolveCycle Liferay [5,9,12] — Jan 5 2026 previous wraps to 2025-cycle3 (year-wrap back)', () => {
  const r = resolveCycle(new Date('2026-01-05T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle1');
  assert.deepEqual(r.previous, { name: '2025-cycle3', start: '2025-09-01', end: '2025-11-30' });
});

// ---------------------------------------------------------------------------
// Alternate cadences — semi-annual [6,12] (ROADMAP success criterion 4) + annual [12]
// ---------------------------------------------------------------------------

test('resolveCycle [6,12] semi-annual yields two 6-month cycles (contiguous coverage)', () => {
  // Per D-03 contiguous coverage with [6,12]:
  //   2026-cycle1 = day-after-cycle2-of-2025-end (Dec 1 2025) → May 31 2026 (6 months)
  //   2026-cycle2 = Jun 1 2026 → Nov 30 2026 (6 months)
  const may = resolveCycle(new Date('2026-05-15T00:00:00Z'), [6, 12]);
  assert.deepEqual(may.current, { name: '2026-cycle1', start: '2025-12-01', end: '2026-05-31' });
  assert.deepEqual(may.previous, { name: '2025-cycle2', start: '2025-06-01', end: '2025-11-30' });
  const nov = resolveCycle(new Date('2026-11-15T00:00:00Z'), [6, 12]);
  assert.deepEqual(nov.current, { name: '2026-cycle2', start: '2026-06-01', end: '2026-11-30' });
  assert.deepEqual(nov.previous, { name: '2026-cycle1', start: '2025-12-01', end: '2026-05-31' });
});

test('resolveCycle [12] annual yields single 12-month cycle', () => {
  const r = resolveCycle(new Date('2026-06-15T00:00:00Z'), [12]);
  assert.deepEqual(r.current, { name: '2026-cycle1', start: '2025-12-01', end: '2026-11-30' });
  assert.deepEqual(r.previous, { name: '2025-cycle1', start: '2024-12-01', end: '2025-11-30' });
});

// ---------------------------------------------------------------------------
// Date-input parity (D-Claude-Discretion: accept Date OR ISO string)
// ---------------------------------------------------------------------------

test('resolveCycle accepts ISO string in addition to Date object', () => {
  const fromString = resolveCycle('2026-05-15', [5, 9, 12]);
  const fromDate = resolveCycle(new Date('2026-05-15T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(fromString, fromDate);
});

// ---------------------------------------------------------------------------
// Invalid-input cases — all throw the D-06 message verbatim
// ---------------------------------------------------------------------------

test('resolveCycle throws on empty / non-array cycleEndMonths', () => {
  assert.throws(() => resolveCycle(new Date(), []), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), null), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), undefined), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), '5,9,12'), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), {}), /cycleEndMonths must be/);
});

test('resolveCycle throws on out-of-range / non-integer months', () => {
  assert.throws(() => resolveCycle(new Date(), [0]), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), [13]), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), [-1]), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), [5.5, 9, 12]), /cycleEndMonths must be/);
});

test('resolveCycle throws on duplicate / non-monotonic input', () => {
  assert.throws(() => resolveCycle(new Date(), [5, 5, 12]), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), [5, 12, 9]), /cycleEndMonths must be/);
  assert.throws(() => resolveCycle(new Date(), [12, 5, 9]), /cycleEndMonths must be/);
});

test('resolveCycle throws message contains the U+2013 en dash (1–12) verbatim', () => {
  // Defensive: Phase 3 docs will quote this message; if a normalizer ever rewrites
  // the en dash to a hyphen-minus, downstream search/grep breaks. Lock it.
  assert.throws(
    () => resolveCycle(new Date(), []),
    /cycleEndMonths must be a non-empty sorted array of integers 1–12/,
  );
});
