import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { selfReviewOrchestrator } from '../core/reviews.js';

export async function selfReviewCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();

  // Use explicit truthiness checks (string non-empty, boolean true) rather
  // than a permissive `!== undefined && !== null && !== false` filter —
  // an empty string would survive a permissive filter and count as "set".
  const windowFlags = [
    typeof opts.since === 'string' && opts.since.length > 0,
    typeof opts.cycle === 'string' && opts.cycle.length > 0,
    opts.lastCycle === true,
  ].filter(Boolean);
  if (windowFlags.length > 1) {
    process.stderr.write('error: --since, --cycle, and --last-cycle are mutually exclusive\n');
    process.exit(1);
  }

  if (opts.since && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
    process.stderr.write(`error: invalid --since value: ${opts.since} (expected YYYY-MM-DD)\n`);
    process.exit(1);
  }

  try {
    await selfReviewOrchestrator(opts);
  } catch (err) {
    // Surface resolveReviewWindow's "invalid --cycle value:" rejection as
    // an exit-1 usage error instead of letting it bubble through.
    if (err && typeof err.message === 'string' && err.message.startsWith('invalid --cycle value')) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}
