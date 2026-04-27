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
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
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

export function diffMinutes(startedAtIso, endedAt = new Date()) {
  const start = new Date(startedAtIso);
  const end = endedAt instanceof Date ? endedAt : new Date(endedAt);
  return Math.max(0, Math.round((end - start) / 60000));
}
