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
  markActivity,
  closeOrphanedSentinels,
} from '../core/logger.js';
import { todayISO, formatHHMM, diffMinutes } from '../utils/format.js';
import { ensureVaultDirs } from '../utils/paths.js';
import { readHookInput, readHookSessionId } from '../utils/hook-input.js';
import { logCloseError } from '../core/error-log.js';
import { inspectTranscript } from '../core/stop-detector.js';
import { appendFile } from 'node:fs/promises';

const REAPER_AGE_MS = 6 * 60 * 60 * 1000;

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

  // Read hook stdin once; reuse for session id resolution and transcript inspection.
  const hookPayload = opts.hookPayload ?? (await readHookInput());

  const claudeSessionId = await resolveSessionId(opts, hookPayload);
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
    let pendingNudge = state.pendingNudge ?? null;
    let lastBlockedTurnId = state.lastBlockedTurnId ?? null;
    let blockEmission = null;
    try {
      const inspection = await inspectTranscript(hookPayload?.transcript_path);
      if (inspection.closingTellDetected && !inspection.noteAdded) {
        pendingNudge = {
          kind: 'closing-summary',
          detectedAt: new Date().toISOString(),
          snippet: inspection.lastTextSnippet,
        };
        const shouldBlock =
          opts.blockOnTell &&
          inspection.leafUuid &&
          inspection.leafUuid !== state.lastBlockedTurnId;
        if (shouldBlock) {
          lastBlockedTurnId = inspection.leafUuid;
          blockEmission = {
            decision: 'block',
            reason:
              'Your last turn looks like a wrap-up but no `self-wiki note` was logged. Drop a `self-wiki note "<text>"` now naming the artifact (PR/commit/test count) before stopping. Tail of that turn: ' +
              JSON.stringify(inspection.lastTextSnippet),
          };
        }
      }
    } catch (err) {
      await logCloseError({
        kind: 'inspect-transcript',
        sessionId: claudeSessionId,
        error: err.message,
      });
    }

    const next = {
      ...state,
      status: 'soft-closed',
      closedAt: new Date().toISOString(),
      pendingNudge,
      lastBlockedTurnId,
    };
    await writeSession(claudeSessionId, next);
    try {
      await markActivity({
        sessionNumber: state.sessionNumber,
        dateStr: state.dateStr,
        at: new Date(),
      });
    } catch (err) {
      await logCloseError({
        kind: 'mark-activity',
        sessionId: claudeSessionId,
        sessionNumber: state.sessionNumber,
        dateStr: state.dateStr,
        error: err.message,
      });
    }
    if (blockEmission) {
      process.stdout.write(JSON.stringify(blockEmission) + '\n');
      return next;
    }
    if (!opts.silent) process.stdout.write(`session ${state.sessionNumber} soft-closed\n`);
    return next;
  }

  const endedAt = new Date();
  const durationMin = diffMinutes(state.startedAt, endedAt);
  const status = opts.interrupted ? 'interrupted' : 'completed';
  try {
    await closeSessionBlock({
      sessionNumber: state.sessionNumber,
      dateStr: state.dateStr,
      status,
      durationMin,
      endedAt,
    });
  } catch (err) {
    await logCloseError({
      kind: 'close-session',
      sessionId: claudeSessionId,
      sessionNumber: state.sessionNumber,
      dateStr: state.dateStr,
      error: err.message,
    });
    if (!opts.silent) process.stderr.write(`warn: close-session failed: ${err.message}\n`);
  }

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

async function resolveSessionId(opts, hookPayload) {
  if (opts.claudeSessionId) return String(opts.claudeSessionId);
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;
  const fromPayload = hookPayload?.session_id;
  if (typeof fromPayload === 'string' && fromPayload) return fromPayload;
  const fromHook = await readHookSessionId();
  if (fromHook) return fromHook;
  return await resolveByCwd(opts.cwd || process.cwd());
}

async function resolveByCwd(cwd) {
  const slots = await listActiveSessions();
  const matching = slots.filter((s) => s.cwd === cwd && (s.status === 'open' || s.status === 'soft-closed'));
  if (matching.length === 1) return matching[0].claudeSessionId;
  return null;
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
    await logCloseError({
      kind: 'close-slot',
      sessionId: slot.claudeSessionId,
      sessionNumber: slot.sessionNumber,
      dateStr: slot.dateStr,
      error: err.message,
    });
    process.stderr.write(`warn: could not auto-close slot ${slot.claudeSessionId}: ${err.message}\n`);
  }
}

async function reapStaleSlots() {
  const slots = await listActiveSessions();
  const now = Date.now();
  const reapedDates = new Set();
  for (const slot of slots) {
    const startedMs = new Date(slot.startedAt).getTime();
    if (Number.isNaN(startedMs)) continue;
    if (now - startedMs < REAPER_AGE_MS) continue;
    await closeSlotIfOpen(slot);
    if (slot.dateStr) reapedDates.add(slot.dateStr);
    if (slot.claudeSessionId) await clearSession(slot.claudeSessionId);
  }

  // Close any orphaned markdown sentinels for the reaped days, ignoring still-active slots.
  if (reapedDates.size > 0) {
    const remaining = await listActiveSessions();
    for (const dateStr of reapedDates) {
      const ignore = remaining
        .filter((s) => s.dateStr === dateStr)
        .map((s) => s.sessionNumber);
      try {
        const closed = await closeOrphanedSentinels({ dateStr, ignoreSessionNumbers: ignore });
        for (const c of closed) {
          try {
            const { updateTopicsForSession } = await import('../core/topics.js');
            await updateTopicsForSession({ dateStr, sessionNumber: c.sessionNumber });
          } catch (err) {
            await logCloseError({
              kind: 'reap-topics',
              dateStr,
              sessionNumber: c.sessionNumber,
              error: err.message,
            });
          }
        }
      } catch (err) {
        await logCloseError({
          kind: 'reap-orphans',
          dateStr,
          error: err.message,
        });
      }
    }
  }
}

function printBanner(state, verb) {
  const ticket = state.ticketId ? `[${state.ticketId}] ` : '';
  process.stdout.write(`session ${state.sessionNumber} ${verb} — ${ticket}${state.task} (${formatHHMM(new Date(state.startedAt))})\n`);
}
