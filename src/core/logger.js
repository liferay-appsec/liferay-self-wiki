import { readFile, writeFile, appendFile } from 'fs/promises';
import { getDailyFilePath, ensureParentDir } from '../utils/paths.js';
import { formatHHMM } from '../utils/format.js';
import { withLock } from './lock.js';

const sentinel = (n) => `<!-- session-${n}-open -->`;

export async function openSessionBlockAtomic({ task, ticketId, dateStr, startedAt }) {
  const file = getDailyFilePath(dateStr);
  await ensureParentDir(file);
  return withLock(file, async () => {
    const sessionNumber = (await countSessionsTodayUnlocked(file)) + 1;
    const header = await ensureDayHeader(file, dateStr);
    const taskLabel = ticketId ? `${ticketId}${task && task !== ticketId ? ` — ${task}` : ''}` : task;
    const block = [
      `## Session ${sessionNumber} — Task: ${taskLabel}`,
      `- Started: ${formatHHMM(startedAt)}`,
      sentinel(sessionNumber),
      '',
    ].join('\n');
    await appendFile(file, header + block, 'utf8');
    return sessionNumber;
  });
}

export async function closeSessionBlock({ sessionNumber, dateStr, status, durationMin, endedAt }) {
  const file = getDailyFilePath(dateStr);
  await withLock(file, async () => {
    const raw = await readFile(file, 'utf8');
    if (!raw.includes(sentinel(sessionNumber))) {
      throw new Error(`No open session ${sessionNumber} found in ${dateStr}`);
    }
    const ended = `- Ended: ${formatHHMM(endedAt ?? new Date())}`;
    const duration = durationMin != null ? `\n- Duration: ${durationMin} min` : '';
    const statusLine = status === 'completed' ? '\n- Completed: ✅' : '\n- Interrupted: ⚠️';
    const replacement = `${ended}${duration}${statusLine}`;
    await writeFile(file, raw.replace(sentinel(sessionNumber), replacement), 'utf8');
  });
}

export async function appendNote({ sessionNumber, dateStr, message, at }) {
  const file = getDailyFilePath(dateStr);
  await withLock(file, async () => {
    const raw = await readFile(file, 'utf8');
    const tag = sentinel(sessionNumber);
    if (!raw.includes(tag)) {
      throw new Error(`No open session ${sessionNumber} found in ${dateStr}`);
    }
    const line = `- Note [${formatHHMM(at ?? new Date())}]: ${message}\n${tag}`;
    await writeFile(file, raw.replace(tag, line), 'utf8');
  });
}

export async function appendSwitch({ sessionNumber, dateStr, newTask }) {
  const file = getDailyFilePath(dateStr);
  await withLock(file, async () => {
    const raw = await readFile(file, 'utf8');
    const tag = sentinel(sessionNumber);
    if (!raw.includes(tag)) {
      throw new Error(`No open session ${sessionNumber} found in ${dateStr}`);
    }
    const line = `- Switched: ${formatHHMM()} → ${newTask}\n${tag}`;
    await writeFile(file, raw.replace(tag, line), 'utf8');
  });
}

async function countSessionsTodayUnlocked(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const matches = raw.match(/^## Session \d+/gm);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

async function ensureDayHeader(file, dateStr) {
  try {
    const raw = await readFile(file, 'utf8');
    if (raw.trim().length === 0) return `# ${dateStr}\n\n`;
    return '\n';
  } catch {
    return `# ${dateStr}\n\n`;
  }
}
