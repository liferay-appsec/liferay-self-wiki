import {
  readSession,
  writeSession,
  migrateLegacyState,
} from '../core/state.js';
import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { readHookSessionId } from '../utils/hook-input.js';
import { parseDailyFile } from '../utils/log-parser.js';

const DEFAULT_NUDGE_AFTER_MIN = 10;

export async function nudgeCommand(opts = {}) {
  await applyUserConfig();
  try {
    ensureVaultConfigured();
  } catch {
    return;
  }
  await migrateLegacyState();

  const id =
    opts.claudeSessionId ||
    process.env.CLAUDE_SESSION_ID ||
    (await readHookSessionId());
  if (!id) return;

  const slot = await readSession(id);
  if (!slot || slot.status !== 'open') return;
  if (slot.nudgedAt) return;

  const threshold = Number(opts.afterMin) || DEFAULT_NUDGE_AFTER_MIN;
  const elapsedMin = (Date.now() - new Date(slot.startedAt).getTime()) / 60000;
  if (!Number.isFinite(elapsedMin) || elapsedMin < threshold) return;

  const { sessions } = await parseDailyFile(slot.dateStr);
  const today = sessions.find((s) => s.sessionNumber === slot.sessionNumber);
  if (!today) return;
  if (today.notes.length > 0) return;

  await writeSession(id, { ...slot, nudgedAt: new Date().toISOString() });

  const label = slot.ticketId ? `[${slot.ticketId}] ${slot.task}` : slot.task;
  process.stdout.write(
    `[self-wiki] Session ${slot.sessionNumber} (${label}) is ${Math.round(
      elapsedMin
    )} min in with zero notes logged. If you've reached a decision, root cause, blocker, or completion since starting, drop a 1–2 line note now: self-wiki note "<text>". If the work so far has been pure exploration with no outcome yet, ignore this.\n`
  );
}
