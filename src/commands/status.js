import { readSession, listActiveSessions, migrateLegacyState } from '../core/state.js';
import { applyUserConfig } from '../core/config.js';
import { diffMinutes, formatDuration } from '../utils/format.js';

export async function statusCommand(opts = {}) {
  await applyUserConfig();
  await migrateLegacyState();

  if (opts.claudeSessionId) {
    const slot = await readSession(opts.claudeSessionId);
    if (opts.json) {
      process.stdout.write(JSON.stringify({ session: slot ?? null }, null, 2) + '\n');
      return;
    }
    if (!slot) {
      process.stdout.write(`idle (no session for ${opts.claudeSessionId})\n`);
      return;
    }
    process.stdout.write(formatLine(slot) + '\n');
    return;
  }

  const slots = await listActiveSessions();
  if (opts.json) {
    process.stdout.write(JSON.stringify({ sessions: slots }, null, 2) + '\n');
    return;
  }
  if (slots.length === 0) {
    process.stdout.write('idle (no active sessions)\n');
    return;
  }
  if (slots.length === 1) {
    process.stdout.write(formatLine(slots[0]) + '\n');
    return;
  }
  process.stdout.write(`active sessions: ${slots.length}\n`);
  for (const s of slots) {
    process.stdout.write(`  - ${s.claudeSessionId}: ${formatLine(s)}\n`);
  }
}

function formatLine(state) {
  if (state.status === 'soft-closed') {
    return `soft-closed: session ${state.sessionNumber}, ${state.ticketId ?? state.task}`;
  }
  const elapsed = formatDuration(diffMinutes(state.startedAt));
  const ticket = state.ticketId ? `[${state.ticketId}] ` : '';
  return `active: session ${state.sessionNumber}, ${ticket}${state.task} — ${elapsed}`;
}
