import { readFile, writeFile } from 'fs/promises';
import {
  getTicketFilePath,
  getComponentFilePath,
  ensureParentDir,
} from '../utils/paths.js';
import { readVaultConfig } from './config.js';
import { parseDailyFile, listDailyDates } from '../utils/log-parser.js';
import { withLock } from './lock.js';

export async function updateTopicsForSession(state) {
  const cfg = await readVaultConfig();
  const parsed = await parseDailyFile(state.dateStr);
  const session = parsed.sessions.find((s) => s.sessionNumber === state.sessionNumber);
  if (!session) return;

  const tickets = collectTicketsFromSession(session, cfg);
  const components = collectComponentsFromSession(session, cfg);

  for (const ticketId of tickets) {
    await appendDatedSection({
      filePath: getTicketFilePath(ticketId),
      title: ticketId,
      dateStr: state.dateStr,
      session,
      cfg,
    });
  }
  for (const slug of components) {
    await appendDatedSection({
      filePath: getComponentFilePath(slug),
      title: slug,
      dateStr: state.dateStr,
      session,
      cfg,
    });
  }
}

export async function rebuildTicketPage(ticketId) {
  const cfg = await readVaultConfig();
  const dates = await listDailyDates();
  const sections = [];
  for (const dateStr of dates) {
    const parsed = await parseDailyFile(dateStr);
    for (const s of parsed.sessions) {
      const tickets = collectTicketsFromSession(s, cfg);
      if (!tickets.has(ticketId)) continue;
      const body = renderSessionBody(s, dateStr, ticketId, cfg);
      if (body) sections.push({ dateStr, sessionNumber: s.sessionNumber, body });
    }
  }
  const content = renderTopicFile(ticketId, sections);
  const filePath = getTicketFilePath(ticketId);
  await ensureParentDir(filePath);
  await withLock(filePath, async () => {
    await writeFile(filePath, content, 'utf8');
  });
  return { filePath, sectionCount: sections.length };
}

export async function rebuildComponentPage(slug) {
  const cfg = await readVaultConfig();
  const compConfig = cfg.components.find(
    (c) => (typeof c === 'string' ? c : c.slug) === slug,
  );
  if (!compConfig) throw new Error(`component "${slug}" not found in vault config`);
  const keywords = typeof compConfig === 'string' ? [compConfig] : (compConfig.keywords ?? [compConfig.slug]);
  const dates = await listDailyDates();
  const sections = [];
  for (const dateStr of dates) {
    const parsed = await parseDailyFile(dateStr);
    for (const s of parsed.sessions) {
      const matched = sessionMentionsAny(s, keywords);
      if (!matched) continue;
      const body = renderSessionBody(s, dateStr, null, cfg, keywords);
      if (body) sections.push({ dateStr, sessionNumber: s.sessionNumber, body });
    }
  }
  const content = renderTopicFile(slug, sections);
  const filePath = getComponentFilePath(slug);
  await ensureParentDir(filePath);
  await withLock(filePath, async () => {
    await writeFile(filePath, content, 'utf8');
  });
  return { filePath, sectionCount: sections.length };
}

function collectTicketsFromSession(session, cfg) {
  const re = new RegExp(cfg.ticketRegex, 'g');
  const found = new Set();
  if (session.ticketId) found.add(session.ticketId);
  for (const note of session.notes) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(note.text)) != null) found.add(m[0]);
  }
  for (const sw of session.switches) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(sw.newTask)) != null) found.add(m[0]);
  }
  return found;
}

function collectComponentsFromSession(session, cfg) {
  const found = new Set();
  for (const comp of cfg.components ?? []) {
    const slug = typeof comp === 'string' ? comp : comp.slug;
    const keywords = typeof comp === 'string' ? [comp] : (comp.keywords ?? [comp.slug]);
    if (sessionMentionsAny(session, keywords)) found.add(slug);
  }
  return found;
}

function sessionMentionsAny(session, keywords) {
  const haystack = [
    session.task,
    session.ticketId ?? '',
    ...session.notes.map((n) => n.text),
    ...session.switches.map((s) => s.newTask),
  ].join('\n').toLowerCase();
  return keywords.some((k) => haystack.includes(k.toLowerCase()));
}

async function appendDatedSection({ filePath, title, dateStr, session, cfg }) {
  await ensureParentDir(filePath);
  const body = renderSessionBody(session, dateStr, title.match(/^[A-Z]+-\d+$/) ? title : null, cfg);
  if (!body) return;
  await withLock(filePath, async () => {
    let raw = '';
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      raw = '';
    }
    if (raw.trim().length === 0) {
      const header = `# ${title}\n\nAuto-maintained by self-wiki. Daily logs are the source of truth.\n\n`;
      await writeFile(filePath, header + body, 'utf8');
      return;
    }
    const sectionMarker = `## ${dateStr} — Session ${session.sessionNumber}`;
    if (raw.includes(sectionMarker)) {
      const re = new RegExp(`(## ${dateStr} — Session ${session.sessionNumber}[\\s\\S]*?)(?=\\n## |$)`);
      await writeFile(filePath, raw.replace(re, body.trimEnd() + '\n\n'), 'utf8');
      return;
    }
    const trailingNewline = raw.endsWith('\n') ? '' : '\n';
    await writeFile(filePath, raw + trailingNewline + body, 'utf8');
  });
}

function renderSessionBody(session, dateStr, ticketFilter, cfg, keywordFilter = null) {
  const ticketRe = cfg ? new RegExp(cfg.ticketRegex, 'g') : null;
  const dailyLink = `[[Daily/${dateStr}#Session ${session.sessionNumber} — Task: ${session.ticketId ? `${session.ticketId} — ${session.task}` : session.task}|${dateStr}]]`;
  const lines = [`## ${dateStr} — Session ${session.sessionNumber}`, '', `Source: ${dailyLink}`, ''];

  const matchedNotes = session.notes.filter((n) => {
    if (ticketFilter) {
      const explicitMentions = ticketsIn(n.text, ticketRe);
      if (explicitMentions.size > 0) return explicitMentions.has(ticketFilter);
      return session.ticketId === ticketFilter;
    }
    if (keywordFilter) return keywordFilter.some((k) => n.text.toLowerCase().includes(k.toLowerCase()));
    return true;
  });

  for (const n of matchedNotes) {
    lines.push(`- [${n.time}] ${n.text}`);
  }
  for (const sw of session.switches) {
    if (ticketFilter && !sw.newTask.includes(ticketFilter)) continue;
    if (keywordFilter && !keywordFilter.some((k) => sw.newTask.toLowerCase().includes(k.toLowerCase()))) continue;
    lines.push(`- [${sw.time}] _switched to_ ${sw.newTask}`);
  }
  if (lines.length <= 4) {
    if (ticketFilter && session.ticketId === ticketFilter) {
      lines.push(`- (no notes captured; session was tagged ${session.ticketId})`);
    } else {
      return null;
    }
  }
  return lines.join('\n') + '\n\n';
}

function ticketsIn(text, ticketRe) {
  const found = new Set();
  if (!ticketRe) return found;
  ticketRe.lastIndex = 0;
  let m;
  while ((m = ticketRe.exec(text)) != null) found.add(m[0]);
  return found;
}

function renderTopicFile(title, sections) {
  const header = `# ${title}\n\nAuto-maintained by self-wiki. Daily logs are the source of truth.\n\n`;
  if (sections.length === 0) {
    return header + '_No daily-log mentions found yet._\n';
  }
  return header + sections.map((s) => s.body.trimEnd()).join('\n\n') + '\n';
}

