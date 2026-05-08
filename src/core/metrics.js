// src/core/metrics.js — Shared metrics helper. Lifted from
// src/commands/report.js per D-10/D-12. Reads raw daily logs (source of
// truth — CLAUDE.md rule); never reads pre-rendered weekly metric blocks.

import { parseDailyFile } from '../utils/log-parser.js';
import { escapeRegex } from '../utils/regex.js';

export async function buildMetrics(dates, opts = {}) {
  const shape = opts.shape ?? 'week';
  const components = opts.components ?? [];

  const prSet = new Set();
  const tickets = new Set();
  const status = { completed: 0, interrupted: 0, open: 0, unknown: 0 };
  let totalSessions = 0;
  let daysWithLogs = 0;
  let forcePushes = 0;

  // For component matching we need the per-session haystacks across the
  // whole window. We collect them while walking the parsed files so the
  // loop runs once.
  const sessionHaystacks = [];

  for (const dateStr of dates) {
    const parsed = await parseDailyFile(dateStr);
    if (parsed.sessions.length > 0) daysWithLogs += 1;
    totalSessions += parsed.sessions.length;
    for (const s of parsed.sessions) {
      if (s.ticketId) tickets.add(s.ticketId);
      status[s.status in status ? s.status : 'unknown'] += 1;
      if (shape === 'month' && components.length > 0) {
        const haystack = [
          s.task ?? '',
          s.ticketId ?? '',
          ...s.notes.map((n) => n.text),
          ...s.switches.map((sw) => sw.newTask),
        ].join('\n');
        sessionHaystacks.push(haystack);
      }
    }
    const text = parsed.sessions.flatMap((s) => s.notes.map((n) => n.text)).join('\n');
    // Tighter PR regex: 2–7 digits (covers any realistic PR number through
    // ~9.9M; large monorepos and active OSS projects routinely exceed 5
    // digits — Liferay's portal in particular). Lower bound of 2 keeps
    // single-digit `#5` noise out of the metrics block.
    const prMatches = text.match(/(?:\b(?:PR|pull)\s*#?|#)(\d{2,7})\b/gi) ?? [];
    for (const m of prMatches) prSet.add('#' + m.match(/\d+/)[0]);
    forcePushes += (text.match(/force[ -]?push/gi) ?? []).length;
  }

  const statusBits = [];
  if (status.completed) statusBits.push(`${status.completed} completed`);
  if (status.interrupted) statusBits.push(`${status.interrupted} interrupted`);
  if (status.open) statusBits.push(`${status.open} open`);
  if (status.unknown) statusBits.push(`${status.unknown} unknown`);
  const sortedPrs = [...prSet].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  const sortedTickets = [...tickets].sort();

  const lines = [];
  lines.push(
    `- **Sessions:** ${totalSessions} total${statusBits.length > 0 ? ` (${statusBits.join(', ')})` : ''}. Days with logs: ${daysWithLogs}.`,
  );
  lines.push(`- **Tickets touched:** ${sortedTickets.length > 0 ? sortedTickets.join(', ') : '—'}.`);
  lines.push(`- **PRs touched:** ${sortedPrs.length > 0 ? sortedPrs.join(', ') : '—'}.`);
  lines.push(`- **Force-push mentions:** ${forcePushes}.`);

  if (shape === 'month') {
    // D-09: promote daysWithLogs to its own line (it is also reported on
    // the Sessions tail to preserve byte-equality with the weekly shape).
    lines.push(`- **Days with logs:** ${daysWithLogs} (of ${dates.length}).`);
    const matchedComponents = matchComponents(sessionHaystacks, components);
    lines.push(
      `- **Components touched:** ${matchedComponents.length > 0 ? matchedComponents.join(', ') : '—'}.`,
    );
  }

  return lines.join('\n');
}

function matchComponents(sessionHaystacks, components) {
  const found = new Set();
  for (const c of components) {
    const slug = typeof c === 'string' ? c : c.slug;
    const keywords = typeof c === 'string' ? [c] : (c.keywords ?? [c.slug]);
    const regexes = keywords.map((k) => new RegExp(`\\b${escapeRegex(k)}\\b`, 'i'));
    for (const haystack of sessionHaystacks) {
      if (regexes.some((re) => re.test(haystack))) {
        found.add(slug);
        break;
      }
    }
  }
  return [...found].sort();
}
