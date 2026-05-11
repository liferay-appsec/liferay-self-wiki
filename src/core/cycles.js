// src/core/cycles.js — pure cycle-boundary helper. No imports. UTC-only arithmetic.
// See .planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md (D-01..D-06)
// and src/utils/format.js for the canonical UTC-arithmetic pattern.
//
// Phases 2 and 3 will call resolveCycle(date, cycleEndMonths) to derive the
// {current, previous} cycle window. Cycle math is deterministic per CLAUDE.md
// — never delegate this to claude -p.

const INVALID_MONTHS_MSG =
  'cycleEndMonths must be a non-empty sorted array of integers 1–12';

function validateCycleEndMonths(arr) {
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(INVALID_MONTHS_MSG);
  let prev = 0;
  for (const v of arr) {
    if (!Number.isInteger(v) || v <= 0 || v > 12 || v <= prev) {
      throw new Error(INVALID_MONTHS_MSG);
    }
    prev = v;
  }
}

function normalizeDateUTC(date) {
  const d = date instanceof Date ? date : new Date(date);
  // Re-anchor at UTC midnight; reading via getUTC* avoids local-tz drift.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function lastDayOfMonth(year, monthOneIndexed) {
  // Date.UTC with day=0 of `monthOneIndexed + 1` (passed as a 0-indexed month here)
  // yields the last day of the requested 1-indexed month. Equivalently, day=0 of
  // a 0-indexed month yields the last day of the prior month — so to get the last
  // day of 1-indexed month M, pass (year, M, 0).
  return new Date(Date.UTC(year, monthOneIndexed, 0));
}

function dayAfter(d) {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// Compute {name, start, end} for the cycle at sorted-array index `ordinalZero`
// (0-based) of `cycleEndMonths` for review year `reviewYear`.
//
// Option B semantic (D-PREREQ, user-confirmed 2026-05-08):
//   `cycleEndMonths[i]` is the REVIEW month of cycle (i+1). Cycle bounds are:
//     start = first day of `cycleEndMonths[i-1]`     (for i > 0)
//     start = Jan 1 of reviewYear                    (for i === 0, special case)
//     end   = last day of (cycleEndMonths[i] - 1)    (for i < len - 1)
//     end   = Dec 31 of reviewYear                   (for i === len - 1, special case)
//
//   Both special cases break the "ends month-before-review-month" rule for
//   the seam between Dec and Jan. They reflect the user's mental model that
//   the December-cycle covers Sep-Dec and the January-1 boundary is a hard
//   cycle-1 start, not a chained "day-after-prior-cycle-end".
//
// The function is purely arithmetic over `reviewYear`; year-wrap is handled
// by `resolveCycle` at the level above (it picks `reviewYear` and
// `prevReviewYear` and calls `cycleAt` twice).
function cycleAt(reviewYear, ordinalZero, cycleEndMonths) {
  const k = cycleEndMonths.length;
  const isLast = ordinalZero === k - 1;
  const isFirst = ordinalZero === 0;
  const reviewMonth = cycleEndMonths[ordinalZero];

  // End: last cycle of year ends Dec 31 (special); otherwise last day of (reviewMonth - 1).
  const end = isLast
    ? lastDayOfMonth(reviewYear, 12)
    : lastDayOfMonth(reviewYear, reviewMonth - 1);

  // Start: cycle 0 starts Jan 1 (special); otherwise first day of prior cycle's review month.
  const start = isFirst
    ? new Date(Date.UTC(reviewYear, 0, 1))
    : new Date(Date.UTC(reviewYear, cycleEndMonths[ordinalZero - 1] - 1, 1));

  const name = `${reviewYear}-cycle${ordinalZero + 1}`;
  return { name, start: isoDate(start), end: isoDate(end) };
}

/**
 * Compute the current and previous Liferay-style review cycles for a given date.
 *
 * Option B semantic (D-PREREQ, user-confirmed 2026-05-08): `cycleEndMonths[i]`
 * is the review month of cycle (i+1). Cycle 1 always starts Jan 1 of its
 * review-year; the last cycle of the year always ends Dec 31 of its review-year.
 * Non-last cycles end at last-day-of-(reviewMonth - 1); non-first cycles start
 * at first-day-of-(prior-reviewMonth). The result: cycles partition each
 * calendar year into contiguous (but not necessarily uniform-length) windows.
 *
 * For Liferay's `[5, 9, 12]`: cycle1 = Jan-Apr, cycle2 = May-Aug, cycle3 = Sep-Dec
 * (uniform 4 months — the design target).
 * For `[6, 12]`: cycle1 = Jan-May (5mo), cycle2 = Jun-Dec (7mo) — NOT uniform.
 * For `[4, 8, 12]`: cycle1 = Jan-Mar (3mo), cycle2 = Apr-Jul (4mo), cycle3 = Aug-Dec (5mo)
 * — also not uniform. To get uniform N-month cycles the user picks evenly-spaced
 * review months whose last entry is 12 (e.g. `[4, 8, 12]` does NOT yield uniform 4mo
 * under Option B; only schemes whose entries' deltas all equal `12 / k` and
 * whose last entry IS 12 produce uniform cycles, which for k=3 means... none of the
 * above. Uniformity is a Liferay-specific outcome under `[5, 9, 12]`).
 *
 * @param {Date|string} date - Date object or ISO-8601 parseable string. Time component is discarded.
 * @param {number[]} cycleEndMonths - Sorted ascending array of distinct integers 1..12 marking
 *   the review months. See semantic notes above for cycle bound derivation.
 * @returns {{
 *   current:  { name: string, start: string, end: string },
 *   previous: { name: string, start: string, end: string }
 * }}  All `start` / `end` values are ISO `YYYY-MM-DD` strings (UTC). `name` format is
 *     `<YYYY>-cycle<N>` where N is the 1-indexed position in `cycleEndMonths` and
 *     YYYY is the calendar year of the cycle's end-date (which under Option B equals
 *     `reviewYear` for every cycle since cycles never span a year boundary).
 * @throws {Error} message exactly: "cycleEndMonths must be a non-empty sorted array of integers 1–12"
 *   on any of: empty array, non-array, value <= 0, value > 12, duplicates, non-monotonic order, non-integers.
 */
export function resolveCycle(date, cycleEndMonths) {
  validateCycleEndMonths(cycleEndMonths);
  const today = normalizeDateUTC(date);
  const m = today.getUTCMonth() + 1; // 1-indexed
  const y = today.getUTCFullYear();

  // Find the cycle that contains month m within reviewYear y. Each cycle i
  // spans [startMonth_i, endMonth_i] inclusive:
  //   startMonth_i = i === 0 ? 1 : cycleEndMonths[i - 1]
  //   endMonth_i   = i === k-1 ? 12 : cycleEndMonths[i] - 1
  // The intervals partition months 1..12, so exactly one cycle matches.
  const k = cycleEndMonths.length;
  let curOrdinalZero = -1;
  for (let i = 0; i < k; i++) {
    const startMonth = i === 0 ? 1 : cycleEndMonths[i - 1];
    const endMonth = i === k - 1 ? 12 : cycleEndMonths[i] - 1;
    if (m >= startMonth && m <= endMonth) {
      curOrdinalZero = i;
      break;
    }
  }
  // Defensive: the partition covers 1..12, so curOrdinalZero is always >= 0.
  // (If validateCycleEndMonths admits an empty array somehow, k=0 and we'd
  // never set curOrdinalZero — but validate throws on empty input first.)

  const current = cycleAt(y, curOrdinalZero, cycleEndMonths);

  // Previous cycle: step one back. If curOrdinalZero === 0, previous is
  // cycle (k-1) of (y - 1).
  const prevOrdinalZero = curOrdinalZero === 0 ? k - 1 : curOrdinalZero - 1;
  const prevReviewYear = curOrdinalZero === 0 ? y - 1 : y;
  const previous = cycleAt(prevReviewYear, prevOrdinalZero, cycleEndMonths);

  return { current, previous };
}
