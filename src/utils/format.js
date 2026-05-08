export function formatHHMM(date = new Date()) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m} min`;
}

export function isoWeek(date = new Date()) {
  // Read components via getUTC* so callers passing a UTC-anchored Date
  // (e.g. weeksInMonth's `new Date('YYYY-MM-DDT00:00:00Z')`) do not have
  // their calendar date shifted by a negative-offset local TZ before the
  // ISO week math runs. Mixing local-tz reads with UTC arithmetic was the
  // long-standing W52 ↔ W53 boundary bug that priorIsoWeek has its own
  // workaround for.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function priorIsoWeek(weekStr) {
  const m = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO week: ${weekStr}`);
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (week > 1) return `${year}-W${String(week - 1).padStart(2, '0')}`;
  // Year boundary: walk from Mon of W1 of `year` back 7 days, then derive the
  // ISO week of that Monday. Computed entirely in UTC to avoid the local-tz
  // bug in isoWeek that flips W53 ↔ W52 around year boundaries.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monW1 = new Date(jan4);
  monW1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  monW1.setUTCDate(monW1.getUTCDate() - 7);
  // monW1 now = Monday of the prior ISO week (in year-1).
  // Compute its week number: Thursday of that week determines the ISO year.
  const thu = new Date(monW1);
  thu.setUTCDate(monW1.getUTCDate() + 3);
  const isoYear = thu.getUTCFullYear();
  const isoYearJan4 = new Date(Date.UTC(isoYear, 0, 4));
  const isoYearJan4Day = isoYearJan4.getUTCDay() || 7;
  const isoYearMonW1 = new Date(isoYearJan4);
  isoYearMonW1.setUTCDate(isoYearJan4.getUTCDate() - isoYearJan4Day + 1);
  const weekNum = Math.round((monW1 - isoYearMonW1) / (7 * 86400000)) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

export function datesInWeek(weekStr) {
  const m = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO week: ${weekStr}`);
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Mon);
  monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return dates;
}

function parseYYYYMM(monthStr) {
  const m = typeof monthStr === 'string' ? monthStr.match(/^(\d{4})-(\d{2})$/) : null;
  if (!m) throw new Error(`Invalid YYYY-MM: ${monthStr}`);
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) throw new Error(`Invalid YYYY-MM: ${monthStr}`);
  return { year, month };
}

export function datesInMonth(monthStr) {
  const { year, month } = parseYYYYMM(monthStr);
  // Day 0 of (month + 1, 1-indexed) === last day of `month`. JS Date.UTC's
  // monthIdx is 0-indexed, so passing `month` (the 1-indexed human month)
  // already refers to the *next* month; day 0 of next month yields the
  // last day of the requested month.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = [];
  for (let i = 1; i <= lastDay; i++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
  }
  return dates;
}

export function priorMonth(monthStr) {
  const { year, month } = parseYYYYMM(monthStr);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function weeksInMonth(monthStr) {
  const dates = datesInMonth(monthStr);
  const seen = new Set();
  const weeks = [];
  for (const dateStr of dates) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const week = isoWeek(d);
    if (!seen.has(week)) {
      seen.add(week);
      weeks.push(week);
    }
  }
  return weeks;
}

export function diffMinutes(startedAtIso, endedAt = new Date()) {
  const start = new Date(startedAtIso);
  const end = endedAt instanceof Date ? endedAt : new Date(endedAt);
  return Math.max(0, Math.round((end - start) / 60000));
}
