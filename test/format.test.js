import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatHHMM,
  todayISO,
  formatDuration,
  isoWeek,
  datesInWeek,
  datesInMonth,
  priorMonth,
  weeksInMonth,
  diffMinutes,
} from '../src/utils/format.js';

test('formatHHMM zero-pads hours and minutes', () => {
  assert.equal(formatHHMM(new Date('2026-04-27T03:05:00')), '03:05');
  assert.equal(formatHHMM(new Date('2026-04-27T23:59:00')), '23:59');
});

test('todayISO produces YYYY-MM-DD with zero padding', () => {
  assert.equal(todayISO(new Date('2026-01-09T15:30:00')), '2026-01-09');
  assert.equal(todayISO(new Date('2026-12-31T01:00:00')), '2026-12-31');
});

test('formatDuration formats sub-hour as "N min"', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(45), '45 min');
});

test('formatDuration drops minutes when on the hour', () => {
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(180), '3h');
});

test('formatDuration combines hours and minutes', () => {
  assert.equal(formatDuration(75), '1h 15 min');
  assert.equal(formatDuration(125), '2h 5 min');
});

test('isoWeek returns YYYY-Www', () => {
  // 2026-04-27 is a Monday → week 18
  assert.equal(isoWeek(new Date('2026-04-27T12:00:00Z')), '2026-W18');
});

test('isoWeek pads single-digit weeks', () => {
  // 2025-01-01 is a Wednesday in ISO week 2025-W01
  assert.equal(isoWeek(new Date('2025-01-01T12:00:00Z')), '2025-W01');
});

test('datesInWeek returns 7 ISO dates Mon-Sun', () => {
  const dates = datesInWeek('2026-W18');
  assert.equal(dates.length, 7);
  assert.equal(dates[0], '2026-04-27');
  assert.equal(dates[6], '2026-05-03');
});

test('datesInWeek throws on bad format', () => {
  assert.throws(() => datesInWeek('2026-18'), /Invalid ISO week/);
  assert.throws(() => datesInWeek('not-a-week'), /Invalid ISO week/);
});

test('diffMinutes rounds to nearest minute', () => {
  assert.equal(
    diffMinutes('2026-04-27T10:00:00Z', new Date('2026-04-27T10:45:30Z')),
    46,
  );
});

test('diffMinutes clamps negative spans to 0', () => {
  assert.equal(
    diffMinutes('2026-04-27T10:00:00Z', new Date('2026-04-27T09:00:00Z')),
    0,
  );
});

test('diffMinutes accepts ISO string for endedAt', () => {
  assert.equal(
    diffMinutes('2026-04-27T10:00:00Z', '2026-04-27T10:30:00Z'),
    30,
  );
});

test('datesInMonth returns 30 dates for April 2026', () => {
  const dates = datesInMonth('2026-04');
  assert.equal(dates.length, 30);
  assert.equal(dates[0], '2026-04-01');
  assert.equal(dates[29], '2026-04-30');
});

test('datesInMonth handles February non-leap (28) and leap (29)', () => {
  assert.equal(datesInMonth('2026-02').length, 28);
  assert.equal(datesInMonth('2024-02').length, 29);
  assert.equal(datesInMonth('2024-02')[28], '2024-02-29');
});

test('datesInMonth handles December (31)', () => {
  const dec = datesInMonth('2026-12');
  assert.equal(dec.length, 31);
  assert.equal(dec[30], '2026-12-31');
});

test('datesInMonth throws on bad format', () => {
  assert.throws(() => datesInMonth('2026-4'), /Invalid YYYY-MM/);
  assert.throws(() => datesInMonth('2026/04'), /Invalid YYYY-MM/);
  assert.throws(() => datesInMonth('not-a-month'), /Invalid YYYY-MM/);
  assert.throws(() => datesInMonth('2026-13'), /Invalid YYYY-MM/);
  assert.throws(() => datesInMonth('2026-00'), /Invalid YYYY-MM/);
});

test('priorMonth steps back one month within a year', () => {
  assert.equal(priorMonth('2026-04'), '2026-03');
  assert.equal(priorMonth('2026-12'), '2026-11');
});

test('priorMonth wraps January to prior December', () => {
  assert.equal(priorMonth('2026-01'), '2025-12');
  assert.equal(priorMonth('2000-01'), '1999-12');
});

test('priorMonth throws on bad format', () => {
  assert.throws(() => priorMonth('2026-1'), /Invalid YYYY-MM/);
  assert.throws(() => priorMonth('2026-13'), /Invalid YYYY-MM/);
});

test('weeksInMonth April 2026 returns W14..W18 in order', () => {
  // D-04 example: any ISO week with >=1 day in the month is included.
  // Mar 30 = Mon → 2026-W14 (because Apr 1 is in W14).
  // May 1, 2 = Fri/Sat in 2026-W18 (because Apr 30 is W18).
  const weeks = weeksInMonth('2026-04');
  assert.deepEqual(weeks, ['2026-W14', '2026-W15', '2026-W16', '2026-W17', '2026-W18']);
});

test('weeksInMonth January 2026 covers year-boundary ISO week', () => {
  // 2026-01-01 is a Thursday — ISO week 2026-W01.
  const weeks = weeksInMonth('2026-01');
  assert.equal(weeks[0], '2026-W01');
  // 2026-01-31 is a Saturday in W05.
  assert.ok(weeks.includes('2026-W05'));
  // No duplicates.
  assert.equal(weeks.length, new Set(weeks).size);
});

test('weeksInMonth dedupes and preserves first-occurrence order', () => {
  const weeks = weeksInMonth('2026-04');
  assert.equal(weeks.length, new Set(weeks).size);
  // First entry is the week containing Apr 1.
  assert.equal(weeks[0], isoWeek(new Date('2026-04-01T00:00:00Z')));
});
