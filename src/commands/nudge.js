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

  // Second-chance nudge: the soft-close path on Stop set this when it detected
  // a closing-summary tell with no `self-wiki note` in the same turn. Surface
  // it once, then clear so it doesn't repeat.
  if (slot.pendingNudge?.kind === 'closing-summary') {
    const snippet = (slot.pendingNudge.snippet ?? '').replace(/\s+/g, ' ').trim();
    const tail = snippet.length > 160 ? snippet.slice(-160) : snippet;
    process.stdout.write(
      `[self-wiki] Heads up: your last turn looked like a wrap-up but no \`self-wiki note\` landed. ` +
      (tail ? `Tail of that turn: "…${tail}". ` : '') +
      `If that was a real completion (PR opened, tests green, fix landed), drop a \`self-wiki note "<text>"\` now naming the artifact (PR/commit/test count). Otherwise ignore this.\n`
    );
    await writeSession(id, { ...slot, pendingNudge: null });
    return;
  }

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
    `**A closing summary is a tell**: if you're about to write "Done", "X landed", "all tests pass", "PR opened", "implementation complete", "I have finished", "I'm done", "wrapping up", "ready for review", or a multi-bullet wrap-up listing files/PRs/tests, drop the note *before* that line, naming the artifact. ` +
    `1–2 lines, terse, like a git commit subject. ` +
    `Skip only narration ("editing X", "running tests") and pure restatement of what the user said.\n`
  );
}
