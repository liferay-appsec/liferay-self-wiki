import {
  readSession,
  writeSession,
  clearSession,
  listActiveSessions,
  migrateLegacyState,
} from '../core/state.js';
import { readVaultConfig, ensureVaultConfigured, applyUserConfig } from '../core/config.js';
import { detectTask } from '../core/detect.js';
import {
  openSessionBlockAtomic,
  closeSessionBlock,
  appendSwitch,
} from '../core/logger.js';
import { todayISO, formatHHMM, diffMinutes } from '../utils/format.js';
import { ensureVaultDirs } from '../utils/paths.js';
import { readHookSessionId } from '../utils/hook-input.js';
import { appendFile } from 'node:fs/promises';

const REAPER_AGE_MS = 24 * 60 * 60 * 1000;

export async function sessionOpen(opts = {}) {
  const userCfg = await applyUserConfig();
  ensureVaultConfigured();
  const vaultCfg = await readVaultConfig();
  await ensureVaultDirs();
  await migrateLegacyState();

  const cwd = opts.cwd || process.cwd();
  const claudeSessionId = await resolveSessionId(opts);
  if (!claudeSessionId) {
    process.stderr.write('error: claude session id required (pass --claude-session-id, set $CLAUDE_SESSION_ID, or pipe hook JSON on stdin)\n');
    process.exit(2);
  }

  await reapStaleSlots();

  const existing = await readSession(claudeSessionId);
  if (existing?.status === 'soft-closed' && (await maybeSoftReopen(existing, vaultCfg, cwd))) {
    printBanner(existing, 'reopened');
    return existing;
  }
  if (existing) {
    await closeSlotIfOpen(existing);
    await clearSession(claudeSessionId);
  }

  const detected = await detectTask({ cwd, vaultConfig: vaultCfg, userConfig: userCfg });
  const dateStr = todayISO();
  const startedAt = new Date();

  const sessionNumber = await openSessionBlockAtomic({
    task: detected.task,
    ticketId: detected.ticketId,
    dateStr,
    startedAt,
  });

  const state = {
    status: 'open',
    dateStr,
    sessionNumber,
    task: detected.task,
    ticketId: detected.ticketId,
    branch: detected.branch,
    cwd,
    repo: detected.repo,
    prNumber: detected.prNumber,
    claudeSessionId,
    startedAt: startedAt.toISOString(),
    closedAt: null,
  };
  await writeSession(claudeSessionId, state);
  await exportSessionIdToHookEnv(claudeSessionId);
  printBanner(state, 'opened');
  return state;
}

async function exportSessionIdToHookEnv(claudeSessionId) {
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile) return;
  if (!/^[A-Za-z0-9._-]+$/.test(claudeSessionId)) return;
  try {
    await appendFile(envFile, `export CLAUDE_SESSION_ID=${claudeSessionId}\n`);
  } catch (err) {
    process.stderr.write(`warn: could not export CLAUDE_SESSION_ID to hook env: ${err.message}\n`);
  }
}

export async function sessionClose(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();
  await migrateLegacyState();

  const claudeSessionId = await resolveSessionId(opts);
  if (!claudeSessionId) {
    if (!opts.silent) process.stderr.write('no claude session id — nothing to close\n');
    return null;
  }
  const state = await readSession(claudeSessionId);
  if (!state || state.status !== 'open') {
    if (!opts.silent) process.stderr.write(`no active session for ${claudeSessionId}\n`);
    return null;
  }

  const mode = opts.soft ? 'soft' : 'hard';
  if (mode === 'soft') {
    const next = { ...state, status: 'soft-closed', closedAt: new Date().toISOString() };
    await writeSession(claudeSessionId, next);
    if (!opts.silent) process.stdout.write(`session ${state.sessionNumber} soft-closed\n`);
    return next;
  }

  const endedAt = new Date();
  const durationMin = diffMinutes(state.startedAt, endedAt);
  const status = opts.interrupted ? 'interrupted' : 'completed';
  await closeSessionBlock({
    sessionNumber: state.sessionNumber,
    dateStr: state.dateStr,
    status,
    durationMin,
    endedAt,
  });

  if (!opts.skipTopics) {
    try {
      const { updateTopicsForSession } = await import('../core/topics.js');
      await updateTopicsForSession(state);
    } catch (err) {
      process.stderr.write(`warn: topic update failed: ${err.message}\n`);
    }
  }

  await clearSession(claudeSessionId);
  if (!opts.silent) process.stdout.write(`session ${state.sessionNumber} closed (${durationMin} min, ${status})\n`);
  return { ...state, status, closedAt: endedAt.toISOString(), durationMin };
}

export async function sessionSwitch(opts = {}) {
  const userCfg = await applyUserConfig();
  ensureVaultConfigured();
  await migrateLegacyState();
  const vaultCfg = await readVaultConfig();

  const claudeSessionId = await resolveSessionId(opts);
  if (!claudeSessionId) {
    if (!opts.silent) process.stderr.write('no claude session id — nothing to switch\n');
    return null;
  }
  let state = await readSession(claudeSessionId);
  if (!state) {
    if (!opts.silent) process.stderr.write(`no active session for ${claudeSessionId}\n`);
    return null;
  }
  if (state.status === 'soft-closed') {
    state = { ...state, status: 'open', closedAt: null };
    await writeSession(claudeSessionId, state);
  }

  const detected = opts.task
    ? { task: opts.task, ticketId: opts.ticket ?? null, branch: state.branch, repo: state.repo, prNumber: null }
    : await detectTask({ cwd: state.cwd, vaultConfig: vaultCfg, userConfig: userCfg });

  if (detected.ticketId === state.ticketId && detected.task === state.task) {
    if (!opts.silent) process.stdout.write('no change detected\n');
    return state;
  }

  const newLabel = detected.ticketId ? `${detected.ticketId} — ${detected.task}` : detected.task;
  await appendSwitch({
    sessionNumber: state.sessionNumber,
    dateStr: state.dateStr,
    newTask: newLabel,
  });

  const next = { ...state, task: detected.task, ticketId: detected.ticketId };
  await writeSession(claudeSessionId, next);
  if (!opts.silent) process.stdout.write(`switched to ${newLabel}\n`);
  return next;
}

async function resolveSessionId(opts) {
  if (opts.claudeSessionId) return String(opts.claudeSessionId);
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;
  return await readHookSessionId();
}

async function maybeSoftReopen(existing, vaultCfg, cwd) {
  if (existing.status !== 'soft-closed') return false;
  if (existing.dateStr !== todayISO()) return false;
  const minutesSinceClose = (Date.now() - new Date(existing.closedAt).getTime()) / 60000;
  if (minutesSinceClose > (vaultCfg.softCloseMinutes ?? 5)) return false;
  if (existing.cwd !== cwd) return false;
  existing.status = 'open';
  existing.closedAt = null;
  await writeSession(existing.claudeSessionId, existing);
  return true;
}

async function closeSlotIfOpen(slot) {
  if (slot.status !== 'open') return;
  try {
    const durationMin = diffMinutes(slot.startedAt);
    await closeSessionBlock({
      sessionNumber: slot.sessionNumber,
      dateStr: slot.dateStr,
      status: 'interrupted',
      durationMin,
    });
  } catch (err) {
    process.stderr.write(`warn: could not auto-close slot ${slot.claudeSessionId}: ${err.message}\n`);
  }
}

async function reapStaleSlots() {
  const slots = await listActiveSessions();
  const now = Date.now();
  for (const slot of slots) {
    const startedMs = new Date(slot.startedAt).getTime();
    if (Number.isNaN(startedMs)) continue;
    if (now - startedMs < REAPER_AGE_MS) continue;
    await closeSlotIfOpen(slot);
    if (slot.claudeSessionId) await clearSession(slot.claudeSessionId);
  }
}

function printBanner(state, verb) {
  const ticket = state.ticketId ? `[${state.ticketId}] ` : '';
  process.stdout.write(`session ${state.sessionNumber} ${verb} — ${ticket}${state.task} (${formatHHMM(new Date(state.startedAt))})\n`);
}
