import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { selfReviewOrchestrator } from '../core/reviews.js';

// `self-wiki self-review` — Commander action handler.
//
// Responsibilities at this layer:
//   1. Standard preamble (applyUserConfig + ensureVaultConfigured).
//   2. Flag-mutex validation (--since / --cycle / --last-cycle are
//      mutually exclusive among themselves; --prior-review / --out
//      compose orthogonally).
//   3. Surface known usage errors from resolveReviewWindow as exit-1
//      with a clean stderr message rather than letting the raw rejection
//      bubble through cli.js's parseAsync catch (which prints `error: ...`
//      but still exits 1 — the behavior is the same, but doing it here
//      lets us prefix consistently with `error:`).
//   4. Delegate to selfReviewOrchestrator for everything else.
export async function selfReviewCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();

  // Mutex: at most ONE of {--since, --cycle, --last-cycle}. --prior-review
  // and --out are orthogonal and may co-exist with any of these.
  // Use an explicit truthiness check that matches the documented contract
  // (string for --since/--cycle, true for --last-cycle) rather than a
  // permissive `!== undefined && !== null && !== false` filter — an empty
  // string would survive the permissive filter and count as "set", and the
  // predicate's meaning would shift silently if Commander ever started
  // emitting `false` for an absent boolean flag (WR-05).
  const windowFlags = [
    typeof opts.since === 'string' && opts.since.length > 0,
    typeof opts.cycle === 'string' && opts.cycle.length > 0,
    opts.lastCycle === true,
  ].filter(Boolean);
  if (windowFlags.length > 1) {
    process.stderr.write('error: --since, --cycle, and --last-cycle are mutually exclusive\n');
    process.exit(1);
  }

  // --since must be a YYYY-MM-DD string. resolveReviewWindow trusts its
  // input; validate format at the command layer (the Commander option is
  // a string by default, but the user could pass `--since` with garbage).
  if (opts.since && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
    process.stderr.write(`error: invalid --since value: ${opts.since} (expected YYYY-MM-DD)\n`);
    process.exit(1);
  }

  try {
    await selfReviewOrchestrator(opts);
  } catch (err) {
    // resolveReviewWindow throws with `invalid --cycle value:` for malformed
    // cycle names; surface those as exit-1 usage errors rather than letting
    // the raw rejection propagate.
    if (err && typeof err.message === 'string' && err.message.startsWith('invalid --cycle value')) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}
