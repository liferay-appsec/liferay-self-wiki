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
// (0-based) whose review month falls in calendar year `reviewYear`.
//   end   = last day of (cycleEndMonth - 1) of reviewYear   (D-03 contiguous coverage)
//   start = day after the previous cycle's end             (D-03 contiguous coverage)
// If ordinalZero === 0, the previous cycle is the LAST entry of the prior year.
function cycleAt(reviewYear, ordinalZero, cycleEndMonths) {
  const endMonth = cycleEndMonths[ordinalZero];
  // end = last day of (endMonth - 1). Last-day-of-prior-month uses Date.UTC(year, endMonth - 1, 0)
  // — but expressed via lastDayOfMonth where the second arg is the 1-indexed *target*
  // month-of-end, i.e. (endMonth - 1).
  const end = lastDayOfMonth(reviewYear, endMonth - 1);

  const prevOrdinalZero = ordinalZero === 0 ? cycleEndMonths.length - 1 : ordinalZero - 1;
  const prevReviewYear = ordinalZero === 0 ? reviewYear - 1 : reviewYear;
  const prevEndMonth = cycleEndMonths[prevOrdinalZero];
  const prevEnd = lastDayOfMonth(prevReviewYear, prevEndMonth - 1);
  const start = dayAfter(prevEnd);

  const name = `${reviewYear}-cycle${ordinalZero + 1}`;
  return { name, start: isoDate(start), end: isoDate(end) };
}

/**
 * Compute the current and previous Liferay-style review cycles for a given date.
 *
 * @param {Date|string} date - Date object or ISO-8601 parseable string. Time component is discarded.
 * @param {number[]} cycleEndMonths - Sorted ascending array of distinct integers 1..12 marking
 *   the months in which a cycle's review happens. The cycle "ends" the last day of the month
 *   BEFORE its review month (contiguous coverage — every day belongs to exactly one cycle).
 * @returns {{
 *   current:  { name: string, start: string, end: string },
 *   previous: { name: string, start: string, end: string }
 * }}  All `start` / `end` values are ISO `YYYY-MM-DD` strings (UTC). `name` format is
 *     `<YYYY>-cycle<N>` where N is the 1-indexed position in `cycleEndMonths` and YYYY is
 *     the year in which that cycle's review month falls.
 * @throws {Error} message exactly: "cycleEndMonths must be a non-empty sorted array of integers 1–12"
 *   on any of: empty array, non-array, value <= 0, value > 12, duplicates, non-monotonic order, non-integers.
 */
export function resolveCycle(date, cycleEndMonths) {
  validateCycleEndMonths(cycleEndMonths);
  const today = normalizeDateUTC(date);
  const m = today.getUTCMonth() + 1; // 1-indexed
  const y = today.getUTCFullYear();

  // current = cycle whose cycleEndMonth is the smallest entry >= m, with one
  // refinement reconciled from must_haves and D-03 contiguous coverage:
  //
  //   - When m equals the FIRST entry (i.e. cycle1's review month), `current`
  //     stays cycle1 (D-04 explicit example: during May with [5,9,12], current
  //     remains cycle1 because the user is writing cycle1's review).
  //   - When m equals any LATER entry, that month is the start of the *next*
  //     cycle's coverage per D-03 contiguous coverage. Example: with [5,9,12],
  //     Sep 1 is the start of cycle3's coverage (per D-03 cycle3 = Sep 1 → Nov 30),
  //     so on Sep 1 current=cycle3 — not cycle2. Mechanically: on m == cem[i] for
  //     i > 0, advance to i+1 (with year-wrap to cycle1 of y+1 if past end).
  //
  // If m exceeds every entry, current is the FIRST entry of NEXT year (its review
  // month falls next year; the cycle has already started its coverage this year).
  let curOrdinalZero = -1;
  for (let i = 0; i < cycleEndMonths.length; i++) {
    if (cycleEndMonths[i] >= m) { curOrdinalZero = i; break; }
  }
  let curReviewYear;
  if (curOrdinalZero === -1) {
    curOrdinalZero = 0;
    curReviewYear = y + 1;
  } else if (curOrdinalZero > 0 && cycleEndMonths[curOrdinalZero] === m) {
    // m exactly equals a non-first entry — we're already in the next cycle's
    // coverage (D-03). Advance one slot, year-wrap if needed.
    if (curOrdinalZero + 1 < cycleEndMonths.length) {
      curOrdinalZero += 1;
      curReviewYear = y;
    } else {
      curOrdinalZero = 0;
      curReviewYear = y + 1;
    }
  } else {
    curReviewYear = y;
  }

  const current = cycleAt(curReviewYear, curOrdinalZero, cycleEndMonths);

  // previous = step one back in the sorted array (year-wraps on index 0).
  const prevOrdinalZero = curOrdinalZero === 0 ? cycleEndMonths.length - 1 : curOrdinalZero - 1;
  const prevReviewYear = curOrdinalZero === 0 ? curReviewYear - 1 : curReviewYear;
  const previous = cycleAt(prevReviewYear, prevOrdinalZero, cycleEndMonths);

  return { current, previous };
}
