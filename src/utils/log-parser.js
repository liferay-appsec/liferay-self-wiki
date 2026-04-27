import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { getDailyFilePath, getVaultPath } from './paths.js';

export async function parseDailyFile(dateStr) {
  let raw;
  try {
    raw = await readFile(getDailyFilePath(dateStr), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`warn: could not read ${dateStr}: ${err.message}\n`);
    }
    return { dateStr, sessions: [], breaks: [] };
  }

  const sessions = parseSessions(raw, dateStr);
  const breaks = parseBreaks(raw, dateStr);
  return { dateStr, sessions, breaks };
}

export async function listDailyDates() {
  const dir = join(getVaultPath(), 'Daily');
  try {
    const files = await readdir(dir);
    return files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

function parseSessions(raw, dateStr) {
  const blocks = raw.split(/^## Session /m).slice(1);
  const sessions = [];
  for (const block of blocks) {
    const headerMatch = block.match(/^(\d+) — Task: (.+?)$/m);
    if (!headerMatch) continue;
    const sessionNumber = parseInt(headerMatch[1], 10);
    const fullTask = headerMatch[2].trim();
    const ticketMatch = fullTask.match(/^([A-Z]+-\d+)(?:\s+—\s+(.+))?$/);
    const ticketId = ticketMatch ? ticketMatch[1] : null;
    const taskLabel = ticketMatch ? (ticketMatch[2] ?? ticketMatch[1]) : fullTask;

    const start = block.match(/^- Started: (\d{2}:\d{2})$/m)?.[1] ?? null;
    const end = block.match(/^- Ended: (\d{2}:\d{2})$/m)?.[1] ?? null;
    const duration = block.match(/^- Duration: (\d+) min$/m);
    const completed = /^- Completed: ✅/m.test(block);
    const interrupted = /^- Interrupted: ⚠️/m.test(block);
    const open = block.includes(`<!-- session-${sessionNumber}-open -->`);

    const notes = [];
    const noteRe = /^- Note \[(\d{2}:\d{2})\]:\s*(.+)$/gm;
    let m;
    while ((m = noteRe.exec(block)) != null) {
      notes.push({ time: m[1], text: m[2].trim() });
    }

    const switches = [];
    const switchRe = /^- Switched: (\d{2}:\d{2}) → (.+)$/gm;
    while ((m = switchRe.exec(block)) != null) {
      switches.push({ time: m[1], newTask: m[2].trim() });
    }

    sessions.push({
      dateStr,
      sessionNumber,
      task: taskLabel,
      ticketId,
      startTime: start,
      endTime: end,
      duration: duration ? parseInt(duration[1], 10) : null,
      status: completed ? 'completed' : interrupted ? 'interrupted' : open ? 'open' : 'unknown',
      notes,
      switches,
    });
  }
  return sessions;
}

function parseBreaks(raw, dateStr) {
  const blocks = raw.split(/^## Break #/m).slice(1);
  const breaks = [];
  for (const block of blocks) {
    const headerMatch = block.match(/^(\d+) — (.+)$/m);
    if (!headerMatch) continue;
    const start = block.match(/^- Started: (\d{2}:\d{2})$/m)?.[1] ?? null;
    const end = block.match(/^- Ended: (\d{2}:\d{2})$/m)?.[1] ?? null;
    const duration = block.match(/^- Duration: (\d+) min$/m);
    breaks.push({
      dateStr,
      breakNumber: parseInt(headerMatch[1], 10),
      label: headerMatch[2].trim(),
      startTime: start,
      endTime: end,
      duration: duration ? parseInt(duration[1], 10) : null,
    });
  }
  return breaks;
}
