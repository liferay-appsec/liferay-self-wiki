import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatHHMM,
  todayISO,
  formatDuration,
  isoWeek,
  datesInWeek,
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
