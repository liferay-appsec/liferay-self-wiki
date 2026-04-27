import {
  readSession,
  writeSession,
  migrateLegacyState,
} from '../core/state.js';
import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { readHookSessionId } from '../utils/hook-input.js';
import { parseDailyFile } from '../utils/log-parser.js';

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

  const { sessions } = await parseDailyFile(slot.dateStr);
  const today = sessions.find((s) => s.sessionNumber === slot.sessionNumber);
  if (!today) return;
  if (today.notes.length > 0) return;

  await writeSession(id, { ...slot, nudgedAt: new Date().toISOString() });

  const label = slot.ticketId ? `[${slot.ticketId}] ${slot.task}` : slot.task;
  process.stdout.write(
    `[self-wiki] Active session ${slot.sessionNumber} — ${label}. ` +
    `Drop a \`self-wiki note "<text>"\` whenever a root cause is identified, ` +
    `a non-obvious decision is made (name the rejected alternative), a blocker is hit, ` +
    `a subtask/PR/commit lands (mention the PR number / commit), or scope changes. ` +
    `1–2 lines, terse — like a git commit subject. ` +
    `Skip activity ("editing X", "running tests"). ` +
    `If still in pure exploration with no outcome yet, ignore this.\n`
  );
}
