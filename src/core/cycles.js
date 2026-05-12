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
  // Reject Invalid Date early — otherwise getUTCFullYear() returns NaN and
  // resolveCycle silently produces a "NaN-cycle0" with NaN-NaN-NaN bounds.
  if (Number.isNaN(d.getTime())) {
    throw new Error(`resolveCycle: invalid date input: ${date}`);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function lastDayOfMonth(year, monthOneIndexed) {
  // Date.UTC with day=0 of a 0-indexed month yields the last day of the prior
  // month, so to get the last day of 1-indexed month M, pass (year, M, 0).
  return new Date(Date.UTC(year, monthOneIndexed, 0));
}

// Cycle bounds for `cycleEndMonths[ordinalZero]` in `reviewYear`:
//   cycle 1 always starts Jan 1; last cycle always ends Dec 31. Non-last
//   cycles end on the last day of (reviewMonth - 1); non-first cycles
//   start on the first day of the prior entry's review month.
// Cycles never span a year boundary, so the cycle name's year equals reviewYear.
function cycleAt(reviewYear, ordinalZero, cycleEndMonths) {
  const k = cycleEndMonths.length;
  const isLast = ordinalZero === k - 1;
  const isFirst = ordinalZero === 0;
  const reviewMonth = cycleEndMonths[ordinalZero];

  const end = isLast
    ? lastDayOfMonth(reviewYear, 12)
    : lastDayOfMonth(reviewYear, reviewMonth - 1);

  const start = isFirst
    ? new Date(Date.UTC(reviewYear, 0, 1))
    : new Date(Date.UTC(reviewYear, cycleEndMonths[ordinalZero - 1] - 1, 1));

  const name = `${reviewYear}-cycle${ordinalZero + 1}`;
  return { name, start: isoDate(start), end: isoDate(end) };
}

export function resolveCycle(date, cycleEndMonths) {
  validateCycleEndMonths(cycleEndMonths);
  const today = normalizeDateUTC(date);
  const m = today.getUTCMonth() + 1;
  const y = today.getUTCFullYear();

  // Each cycle i covers months [startMonth_i, endMonth_i] inclusive where
  //   startMonth_i = i === 0 ? 1 : cycleEndMonths[i - 1]
  //   endMonth_i   = i === k-1 ? 12 : cycleEndMonths[i] - 1
  // The intervals partition 1..12, so exactly one cycle matches.
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

  const current = cycleAt(y, curOrdinalZero, cycleEndMonths);

  const prevOrdinalZero = curOrdinalZero === 0 ? k - 1 : curOrdinalZero - 1;
  const prevReviewYear = curOrdinalZero === 0 ? y - 1 : y;
  const previous = cycleAt(prevReviewYear, prevOrdinalZero, cycleEndMonths);

  return { current, previous };
}
