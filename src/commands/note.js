import { readSession, listActiveSessions, migrateLegacyState } from '../core/state.js';
import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { appendNote } from '../core/logger.js';

export async function noteCommand(text, opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();
  await migrateLegacyState();

  const state = await resolveActiveSession(opts);
  if (!state) {
    process.exit(1);
  }
  await appendNote({
    sessionNumber: state.sessionNumber,
    dateStr: state.dateStr,
    message: text.trim(),
  });
}

async function resolveActiveSession(opts) {
  const explicitId = opts.claudeSessionId || process.env.CLAUDE_SESSION_ID || null;
  if (explicitId) {
    const slot = await readSession(explicitId);
    if (slot && slot.status === 'open') return slot;
    if (slot && slot.status === 'soft-closed') return slot;
    process.stderr.write(`error: no active session for claude id ${explicitId}\n`);
    return null;
  }

  const slots = (await listActiveSessions()).filter((s) => s.status === 'open' || s.status === 'soft-closed');
  if (slots.length === 0) {
    process.stderr.write('error: no active session — note discarded.\n');
    return null;
  }
  if (slots.length === 1) return slots[0];

  process.stderr.write('error: multiple active sessions; pass --claude-session-id <id> or set $CLAUDE_SESSION_ID.\n');
  process.stderr.write('active sessions:\n');
  for (const s of slots) {
    process.stderr.write(`  - ${s.claudeSessionId}: session ${s.sessionNumber}, ${s.ticketId ?? s.task}\n`);
  }
  return null;
}
