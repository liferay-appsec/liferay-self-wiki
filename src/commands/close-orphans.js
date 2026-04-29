import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { closeOrphanedSentinels } from '../core/logger.js';
import { listActiveSessions, migrateLegacyState } from '../core/state.js';
import { listDailyDates } from '../utils/log-parser.js';
import { updateTopicsForSession } from '../core/topics.js';

export async function closeOrphansCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();
  await migrateLegacyState();

  const dates = await resolveDates(opts);
  const slots = await listActiveSessions();

  let total = 0;
  for (const dateStr of dates) {
    const ignore = slots
      .filter((s) => s.dateStr === dateStr && (s.status === 'open' || s.status === 'soft-closed'))
      .map((s) => s.sessionNumber);
    const closed = await closeOrphanedSentinels({ dateStr, ignoreSessionNumbers: ignore });
    if (closed.length > 0) {
      process.stdout.write(`${dateStr}: closed ${closed.length} orphaned session${closed.length === 1 ? '' : 's'} (${closed.map((c) => `#${c.sessionNumber}@${c.endTime ?? '--:--'}`).join(', ')})\n`);
      total += closed.length;

      if (!opts.skipTopics) {
        for (const c of closed) {
          try {
            await updateTopicsForSession({ dateStr, sessionNumber: c.sessionNumber });
          } catch (err) {
            process.stderr.write(`warn: topic update failed for ${dateStr} session ${c.sessionNumber}: ${err.message}\n`);
          }
        }
      }
    }
  }
  if (total === 0) {
    process.stdout.write('no orphaned sessions found\n');
  }
}

async function resolveDates(opts) {
  if (opts.date) return [opts.date];
  if (opts.all) return await listDailyDates();
  const today = new Date().toISOString().slice(0, 10);
  return [today];
}
