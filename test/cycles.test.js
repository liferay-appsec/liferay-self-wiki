import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCycle } from '../src/core/cycles.js';

// ---------------------------------------------------------------------------
// Liferay default [5, 9, 12] under Option B — uniform 4-month cycles.
//   cycle1 = Jan 1 -> Apr 30 (review May)
//   cycle2 = May 1 -> Aug 31 (review Sep)
//   cycle3 = Sep 1 -> Dec 31 (review Dec / early Jan)
// ---------------------------------------------------------------------------

test('resolveCycle Liferay [5,9,12] — Jan 1 2026 is start of 2026-cycle1', () => {
  const r = resolveCycle(new Date('2026-01-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' });
  assert.deepEqual(r.previous, { name: '2025-cycle3', start: '2025-09-01', end: '2025-12-31' });
});

test('resolveCycle Liferay [5,9,12] — Apr 30 2026 is last day of 2026-cycle1', () => {
  const r = resolveCycle(new Date('2026-04-30T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle1');
  assert.equal(r.current.start, '2026-01-01');
  assert.equal(r.current.end, '2026-04-30');
});

test('resolveCycle Liferay [5,9,12] — May 1 2026 rolls into 2026-cycle2', () => {
  const r = resolveCycle(new Date('2026-05-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2026-cycle2', start: '2026-05-01', end: '2026-08-31' });
  assert.deepEqual(r.previous, { name: '2026-cycle1', start: '2026-01-01', end: '2026-04-30' });
});

test('resolveCycle Liferay [5,9,12] — May 15 2026 is mid-cycle2', () => {
  const r = resolveCycle(new Date('2026-05-15T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle2');
  assert.equal(r.current.start, '2026-05-01');
  assert.equal(r.current.end, '2026-08-31');
  assert.equal(r.previous.name, '2026-cycle1');
  assert.equal(r.previous.end, '2026-04-30');
});

test('resolveCycle Liferay [5,9,12] — Aug 31 2026 is last day of 2026-cycle2', () => {
  const r = resolveCycle(new Date('2026-08-31T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle2');
  assert.equal(r.current.end, '2026-08-31');
});

test('resolveCycle Liferay [5,9,12] — Sep 1 2026 starts 2026-cycle3', () => {
  const r = resolveCycle(new Date('2026-09-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2026-cycle3', start: '2026-09-01', end: '2026-12-31' });
  assert.deepEqual(r.previous, { name: '2026-cycle2', start: '2026-05-01', end: '2026-08-31' });
});

test('resolveCycle Liferay [5,9,12] — Dec 31 2026 is last day of 2026-cycle3', () => {
  const r = resolveCycle(new Date('2026-12-31T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle3');
  assert.equal(r.current.start, '2026-09-01');
  assert.equal(r.current.end, '2026-12-31');
});

test('resolveCycle Liferay [5,9,12] — Jan 1 2027 starts 2027-cycle1 (year-wrap forward)', () => {
  const r = resolveCycle(new Date('2027-01-01T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(r.current, { name: '2027-cycle1', start: '2027-01-01', end: '2027-04-30' });
  assert.deepEqual(r.previous, { name: '2026-cycle3', start: '2026-09-01', end: '2026-12-31' });
});

// ---------------------------------------------------------------------------
// Year-wrap previous (D-11 explicit example)
// ---------------------------------------------------------------------------

test('resolveCycle Liferay [5,9,12] — Jan 5 2026 previous wraps to 2025-cycle3', () => {
  const r = resolveCycle(new Date('2026-01-05T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle1');
  assert.deepEqual(r.previous, { name: '2025-cycle3', start: '2025-09-01', end: '2025-12-31' });
});

// ---------------------------------------------------------------------------
// Alternate cadences — semi-annual [6,12] and annual [12].
// [6,12] under Option B is non-uniform (5mo + 7mo) — accepted Liferay-shape tradeoff.
// ---------------------------------------------------------------------------

test('resolveCycle [6,12] semi-annual under Option B yields 5mo + 7mo (NOT uniform)', () => {
  const may = resolveCycle(new Date('2026-05-15T00:00:00Z'), [6, 12]);
  assert.deepEqual(may.current, { name: '2026-cycle1', start: '2026-01-01', end: '2026-05-31' });
  assert.deepEqual(may.previous, { name: '2025-cycle2', start: '2025-06-01', end: '2025-12-31' });

  const nov = resolveCycle(new Date('2026-11-15T00:00:00Z'), [6, 12]);
  assert.deepEqual(nov.current, { name: '2026-cycle2', start: '2026-06-01', end: '2026-12-31' });
  assert.deepEqual(nov.previous, { name: '2026-cycle1', start: '2026-01-01', end: '2026-05-31' });
});

test('resolveCycle [12] annual yields single 12-month cycle', () => {
  const r = resolveCycle(new Date('2026-06-15T00:00:00Z'), [12]);
  assert.deepEqual(r.current, { name: '2026-cycle1', start: '2026-01-01', end: '2026-12-31' });
  assert.deepEqual(r.previous, { name: '2025-cycle1', start: '2025-01-01', end: '2025-12-31' });
});

// ---------------------------------------------------------------------------
// Date-input parity — accept Date OR ISO string
// ---------------------------------------------------------------------------

test('resolveCycle accepts ISO string in addition to Date object', () => {
  const fromString = resolveCycle('2026-05-15', [5, 9, 12]);
  const fromDate = resolveCycle(new Date('2026-05-15T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(fromString, fromDate);
});

// ---------------------------------------------------------------------------
// D-PREREQ explicit oracle + contiguous-coverage invariant (Option B)
// ---------------------------------------------------------------------------

test('D-PREREQ contiguous coverage [5,9,12] — every month maps to exactly one cycle', () => {
  // Walk every month of 2026 and confirm cycle membership matches the
  // intended Jan-Apr / May-Aug / Sep-Dec partition.
  const expected = [
    { m: 1,  name: '2026-cycle1' },
    { m: 2,  name: '2026-cycle1' },
    { m: 3,  name: '2026-cycle1' },
    { m: 4,  name: '2026-cycle1' },
    { m: 5,  name: '2026-cycle2' },
    { m: 6,  name: '2026-cycle2' },
    { m: 7,  name: '2026-cycle2' },
    { m: 8,  name: '2026-cycle2' },
    { m: 9,  name: '2026-cycle3' },
    { m: 10, name: '2026-cycle3' },
    { m: 11, name: '2026-cycle3' },
    { m: 12, name: '2026-cycle3' },
  ];
  for (const { m, name } of expected) {
    const mm = String(m).padStart(2, '0');
    const r = resolveCycle(`2026-${mm}-15`, [5, 9, 12]);
    assert.equal(r.current.name, name, `2026-${mm}-15 should be in ${name}`);
  }
});

test('D-PREREQ year-boundary contiguity — cycle3.end + 1 day === next-year cycle1.start', () => {
  const dec31 = resolveCycle('2026-12-31', [5, 9, 12]);
  const jan1 = resolveCycle('2027-01-01', [5, 9, 12]);
  assert.equal(dec31.current.end, '2026-12-31');
  assert.equal(jan1.current.start, '2027-01-01');
  assert.equal(jan1.current.name, '2027-cycle1');
  assert.equal(jan1.previous.name, '2026-cycle3');
  assert.equal(jan1.previous.end, '2026-12-31');
});

test('D-PREREQ uniform 4-month invariant for Liferay [5,9,12]', () => {
  // Each cycle must be exactly 4 calendar months (or contain exactly the
  // months listed). Length check via month arithmetic.
  const c1 = resolveCycle('2026-02-15', [5, 9, 12]).current;
  const c2 = resolveCycle('2026-06-15', [5, 9, 12]).current;
  const c3 = resolveCycle('2026-10-15', [5, 9, 12]).current;
  assert.equal(c1.start, '2026-01-01');
  assert.equal(c1.end, '2026-04-30');
  assert.equal(c2.start, '2026-05-01');
  assert.equal(c2.end, '2026-08-31');
  assert.equal(c3.start, '2026-09-01');
  assert.equal(c3.end, '2026-12-31');
});

// ---------------------------------------------------------------------------
// Invalid-input cases — all throw the D-06 message verbatim (en dash preserved)
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
  assert.throws(
    () => resolveCycle(new Date(), []),
    /cycleEndMonths must be a non-empty sorted array of integers 1–12/,
  );
});
