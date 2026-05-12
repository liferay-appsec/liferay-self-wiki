import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  isoWeek,
  datesInWeek,
  datesInMonth,
  priorMonth,
  weeksInMonth,
  diffMinutes,
  monthsInRange,
} from '../src/utils/format.js';

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
  assert.equal(isoWeek(new Date('2026-04-27T12:00:00Z')), '2026-W18');
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

test('priorMonth steps back one month within a year', () => {
  assert.equal(priorMonth('2026-04'), '2026-03');
  assert.equal(priorMonth('2026-12'), '2026-11');
});

test('priorMonth wraps January to prior December', () => {
  assert.equal(priorMonth('2026-01'), '2025-12');
  assert.equal(priorMonth('2000-01'), '1999-12');
});

test('weeksInMonth April 2026 returns W14..W18 in order', () => {
  const weeks = weeksInMonth('2026-04');
  assert.deepEqual(weeks, ['2026-W14', '2026-W15', '2026-W16', '2026-W17', '2026-W18']);
});

test('weeksInMonth January 2026 covers year-boundary ISO week', () => {
  const weeks = weeksInMonth('2026-01');
  assert.equal(weeks[0], '2026-W01');
  assert.ok(weeks.includes('2026-W05'));
  assert.equal(weeks.length, new Set(weeks).size);
});

test('monthsInRange returns the months overlapping a same-year window', () => {
  assert.deepEqual(
    monthsInRange('2026-01-01', '2026-04-30'),
    ['2026-01', '2026-02', '2026-03', '2026-04'],
  );
});

test('monthsInRange handles year-boundary crossing', () => {
  assert.deepEqual(
    monthsInRange('2025-12-15', '2026-04-30'),
    ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04'],
  );
});

test('monthsInRange returns single month for same-day window', () => {
  assert.deepEqual(monthsInRange('2026-04-30', '2026-04-30'), ['2026-04']);
});

test('monthsInRange returns two months for a mid-month-to-mid-month span', () => {
  assert.deepEqual(
    monthsInRange('2026-04-15', '2026-05-15'),
    ['2026-04', '2026-05'],
  );
});
