import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCycle } from '../src/core/cycles.js';

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

test('resolveCycle Liferay [5,9,12] — Jan 5 2026 previous wraps to 2025-cycle3', () => {
  const r = resolveCycle(new Date('2026-01-05T00:00:00Z'), [5, 9, 12]);
  assert.equal(r.current.name, '2026-cycle1');
  assert.deepEqual(r.previous, { name: '2025-cycle3', start: '2025-09-01', end: '2025-12-31' });
});

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

test('resolveCycle accepts ISO string in addition to Date object', () => {
  const fromString = resolveCycle('2026-05-15', [5, 9, 12]);
  const fromDate = resolveCycle(new Date('2026-05-15T00:00:00Z'), [5, 9, 12]);
  assert.deepEqual(fromString, fromDate);
});

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
