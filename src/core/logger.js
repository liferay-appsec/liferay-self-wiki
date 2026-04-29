import { readFile, writeFile, appendFile } from 'fs/promises';
import { getDailyFilePath, ensureParentDir } from '../utils/paths.js';
import { formatHHMM } from '../utils/format.js';
import { withLock } from './lock.js';

const sentinel = (n) => `<!-- session-${n}-open -->`;
const ACTIVITY_LINE_RE = /^- Last activity: \d{2}:\d{2}$\n?/m;

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
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`No daily file for ${dateStr}`);
      }
      throw err;
    }

    const block = findBlock(raw, sessionNumber);
    if (!block) {
      throw new Error(`No session ${sessionNumber} found in ${dateStr}`);
    }

    if (isAlreadyClosed(block.text) && !block.text.includes(sentinel(sessionNumber))) {
      // idempotent: already closed, nothing to do
      return;
    }

    const ended = `- Ended: ${formatHHMM(endedAt ?? new Date())}`;
    const duration = durationMin != null ? `\n- Duration: ${durationMin} min` : '';
    const statusLine = status === 'completed' ? '\n- Completed: ✅' : '\n- Interrupted: ⚠️';
    const closingMeta = `${ended}${duration}${statusLine}`;

    const newBlock = composeClosedBlock(block.text, sessionNumber, closingMeta);
    const updated = raw.slice(0, block.startIdx) + newBlock + raw.slice(block.endIdx);
    await writeFile(file, updated, 'utf8');
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
    // Replace only the first occurrence — function-form callback avoids $N substitution.
    await writeFile(file, raw.replace(tag, () => line), 'utf8');
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
    await writeFile(file, raw.replace(tag, () => line), 'utf8');
  });
}

export async function markActivity({ sessionNumber, dateStr, at }) {
  const file = getDailyFilePath(dateStr);
  await withLock(file, async () => {
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    const tag = sentinel(sessionNumber);
    if (!raw.includes(tag)) return;

    const block = findBlock(raw, sessionNumber);
    if (!block) return;

    const stripped = block.text.replace(ACTIVITY_LINE_RE, '');
    const activityLine = `- Last activity: ${formatHHMM(at ?? new Date())}\n`;
    const newBlockText = stripped.replace(tag, () => `${activityLine}${tag}`);
    if (newBlockText === block.text) return;

    const updated = raw.slice(0, block.startIdx) + newBlockText + raw.slice(block.endIdx);
    await writeFile(file, updated, 'utf8');
  });
}

export async function closeOrphanedSentinels({ dateStr, ignoreSessionNumbers = [], status = 'interrupted' }) {
  const file = getDailyFilePath(dateStr);
  return withLock(file, async () => {
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }

    const ignore = new Set(ignoreSessionNumbers);
    const closed = [];
    let working = raw;
    let didChange = false;

    const sentinelRe = /<!-- session-(\d+)-open -->/g;
    const numbers = new Set();
    let m;
    while ((m = sentinelRe.exec(working)) != null) {
      numbers.add(parseInt(m[1], 10));
    }

    for (const n of numbers) {
      if (ignore.has(n)) continue;
      const block = findBlock(working, n);
      if (!block) continue;
      if (!block.text.includes(sentinel(n))) continue;

      const start = extractStartTime(block.text);
      const lastActivity = extractLastActivity(block.text);
      const endTime = lastActivity ?? start ?? null;
      const durationMin = computeDuration(start, endTime);
      const endedLine = endTime ? `- Ended: ${endTime}` : `- Ended: --:--`;
      const durationLine = durationMin != null ? `\n- Duration: ${durationMin} min` : '';
      const statusLine = status === 'completed' ? '\n- Completed: ✅' : '\n- Interrupted: ⚠️';
      const closingMeta = `${endedLine}${durationLine}${statusLine}`;

      const newBlockText = composeClosedBlock(block.text, n, closingMeta);
      working = working.slice(0, block.startIdx) + newBlockText + working.slice(block.endIdx);
      closed.push({ sessionNumber: n, endTime, durationMin });
      didChange = true;
    }

    if (didChange) await writeFile(file, working, 'utf8');
    return closed;
  });
}

function findBlock(raw, sessionNumber) {
  const headerRe = new RegExp(`^## Session ${sessionNumber} — Task: `, 'm');
  const m = headerRe.exec(raw);
  if (!m) return null;
  const startIdx = m.index;
  const after = raw.slice(startIdx + m[0].length);
  const nextHeaderRe = /^## /m;
  const nextMatch = nextHeaderRe.exec(after);
  const endIdx = nextMatch ? startIdx + m[0].length + nextMatch.index : raw.length;
  return { startIdx, endIdx, text: raw.slice(startIdx, endIdx) };
}

function isAlreadyClosed(blockText) {
  return /^- Ended: /m.test(blockText);
}

function composeClosedBlock(blockText, sessionNumber, closingMeta) {
  const tag = sentinel(sessionNumber);
  // 1. Strip any "Last activity:" lines.
  let working = blockText.replace(new RegExp(ACTIVITY_LINE_RE.source, 'gm'), '');

  // 2. If a sentinel is present, replace the first with the closing meta and remove any duplicates.
  if (working.includes(tag)) {
    let firstReplaced = false;
    working = working.replace(new RegExp(escapeRe(tag), 'g'), () => {
      if (firstReplaced) return '';
      firstReplaced = true;
      return closingMeta;
    });
    return working;
  }

  // 3. No sentinel and no "Ended:" yet → append closing meta at the end of the block.
  if (!isAlreadyClosed(working)) {
    return appendToBlock(working, closingMeta);
  }
  // 4. Already closed and no sentinel: idempotent no-op.
  return working;
}

function appendToBlock(blockText, closingMeta) {
  // Trim trailing blank lines, append closingMeta, then a single trailing newline.
  const trimmed = blockText.replace(/\n*$/, '');
  return `${trimmed}\n${closingMeta}\n`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractStartTime(blockText) {
  return blockText.match(/^- Started: (\d{2}:\d{2})$/m)?.[1] ?? null;
}

function extractLastActivity(blockText) {
  const match = blockText.match(/^- Last activity: (\d{2}:\d{2})$/m);
  if (match) return match[1];
  // fall back to last switch or last note time, if present
  const noteTimes = [...blockText.matchAll(/^- Note \[(\d{2}:\d{2})\]:/gm)].map((m) => m[1]);
  if (noteTimes.length > 0) return noteTimes[noteTimes.length - 1];
  const switchTimes = [...blockText.matchAll(/^- Switched: (\d{2}:\d{2}) /gm)].map((m) => m[1]);
  if (switchTimes.length > 0) return switchTimes[switchTimes.length - 1];
  return null;
}

function computeDuration(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return null;
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  return minutes >= 0 ? minutes : null;
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
