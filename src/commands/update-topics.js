import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { parseDailyFile } from '../utils/log-parser.js';
import { updateTopicsForSession } from '../core/topics.js';
import { todayISO } from '../utils/format.js';

export async function updateTopicsCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();
  const dateStr = opts.date || todayISO();
  const parsed = await parseDailyFile(dateStr);
  if (parsed.sessions.length === 0) {
    process.stdout.write(`no sessions found for ${dateStr}\n`);
    return;
  }
  const targetNumber = opts.session ? parseInt(opts.session, 10) : parsed.sessions[parsed.sessions.length - 1].sessionNumber;
  const session = parsed.sessions.find((s) => s.sessionNumber === targetNumber);
  if (!session) {
    process.stderr.write(`session ${targetNumber} not found in ${dateStr}\n`);
    process.exit(1);
  }
  await updateTopicsForSession({ dateStr, sessionNumber: session.sessionNumber });
  process.stdout.write(`folded ${dateStr} session ${session.sessionNumber} into topic pages\n`);
}
