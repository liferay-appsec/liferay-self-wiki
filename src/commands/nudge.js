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
    `Drop a \`self-wiki note "<text>"\` liberally — ` +
    `whenever the session produces something worth recalling later: ` +
    `a diagnosis, a decision, a blocker or surprise, a completion (PR/commit/tests-green — name the artifact), ` +
    `a config or environment change, a preference the user persists or asks you to remember, ` +
    `a lesson learned, a scope shift, or any concrete progress marker. ` +
    `When in doubt, note it — gaps cost more than redundancy. ` +
    `1–2 lines, terse, like a git commit subject. ` +
    `Skip only narration ("editing X", "running tests") and pure restatement of what the user said.\n`
  );
}
