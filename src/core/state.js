import { readFile, writeFile, unlink, readdir, rename } from 'fs/promises';
import { join } from 'path';
import {
  getStateFilePath,
  getSessionFilePath,
  getSessionsDir,
  ensureSessionsDir,
} from '../utils/paths.js';

export async function readSession(claudeSessionId) {
  try {
    const raw = await readFile(getSessionFilePath(claudeSessionId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeSession(claudeSessionId, obj) {
  await ensureSessionsDir();
  await writeFile(getSessionFilePath(claudeSessionId), JSON.stringify(obj, null, 2), 'utf8');
}

export async function clearSession(claudeSessionId) {
  try {
    await unlink(getSessionFilePath(claudeSessionId));
  } catch {
    // already gone
  }
}

export async function listActiveSessions() {
  let entries;
  try {
    entries = await readdir(getSessionsDir());
  } catch {
    return [];
  }
  const sessions = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(getSessionsDir(), name), 'utf8');
      const parsed = JSON.parse(raw);
      sessions.push(parsed);
    } catch {
      // ignore unreadable / corrupt slot
    }
  }
  return sessions;
}

export async function migrateLegacyState() {
  let raw;
  try {
    raw = await readFile(getStateFilePath(), 'utf8');
  } catch {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await unlink(getStateFilePath()).catch(() => {});
    return;
  }
  if (parsed?.claudeSessionId) {
    await ensureSessionsDir();
    const target = getSessionFilePath(parsed.claudeSessionId);
    try {
      await rename(getStateFilePath(), target);
    } catch {
      // fallback: write then unlink
      await writeFile(target, JSON.stringify(parsed, null, 2), 'utf8');
      await unlink(getStateFilePath()).catch(() => {});
    }
  } else {
    await unlink(getStateFilePath()).catch(() => {});
  }
}
