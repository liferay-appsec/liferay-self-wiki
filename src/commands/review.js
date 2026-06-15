import { Command } from 'commander';
import { access, readFile } from 'fs/promises';
import { applyUserConfig, ensureVaultConfigured, readVaultConfig } from '../core/config.js';
import { recordFinalReview, recordManagerReview, parseFeedbackItems } from '../core/review-capture.js';
import { resolveReviewWindow } from '../core/reviews.js';
import { getReviewFilePath, getReviewFinalFilePath, getReviewManagerFilePath } from '../utils/paths.js';

function todayISO(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

export function reviewCommand() {
  const cmd = new Command('review').description('Record and inspect captured review artifacts for a cycle.');

  cmd
    .command('record')
    .description('Record the final submitted self-review (--self) or the manager review (--manager) for a cycle.')
    .argument('<source>', "path to the review text file, or '-' to read from stdin")
    .option('--self', 'record the final submitted self-review (Reviews/<cycle>-final.md)')
    .option('--manager', 'record the manager review + extracted Feedback Items (Reviews/<cycle>-manager.md)')
    .option('--cycle <YYYY-cycleN>', 'target cycle (default: most-recently-completed cycle)')
    .option('--last-cycle', 'target the previous cycle explicitly')
    .option('--force', 'overwrite an existing artifact file (your edits will be lost)')
    .option('--no-extract', 'skip AI feedback extraction; write an empty Feedback Items stub (--manager only)')
    .action(async (source, opts) => {
      await applyUserConfig();
      ensureVaultConfigured();

      // --self / --manager are mutually exclusive and exactly one is required.
      const kindFlags = [opts.self === true, opts.manager === true].filter(Boolean);
      if (kindFlags.length !== 1) {
        process.stderr.write('error: exactly one of --self or --manager is required\n');
        process.exit(1);
      }
      if (opts.self === true && opts.extract === false) {
        process.stderr.write('error: --no-extract only applies to --manager\n');
        process.exit(1);
      }

      try {
        if (opts.self) {
          await recordFinalReview({ source, cycle: opts.cycle, lastCycle: opts.lastCycle, force: opts.force === true });
        } else {
          // commander maps --no-extract to opts.extract === false
          await recordManagerReview({ source, cycle: opts.cycle, lastCycle: opts.lastCycle, force: opts.force === true, noExtract: opts.extract === false });
        }
      } catch (err) {
        if (err && typeof err.message === 'string' && err.message.startsWith('invalid --cycle value')) {
          process.stderr.write(`error: ${err.message}\n`);
          process.exit(1);
        }
        if (err && err.code === 'ENOENT') {
          process.stderr.write(`error: cannot read review source: ${source} (no such file)\n`);
          process.exit(1);
        }
        throw err;
      }
    });

  cmd
    .command('status')
    .description('Show which review artifacts (generated draft / final / manager / feedback items) exist for a cycle.')
    .option('--cycle <YYYY-cycleN>', 'target cycle (default: most-recently-completed cycle)')
    .option('--last-cycle', 'target the previous cycle explicitly')
    .action(async (opts) => {
      await applyUserConfig();
      ensureVaultConfigured();

      let window;
      try {
        const cfg = await readVaultConfig();
        window = resolveReviewWindow({ cycle: opts.cycle, lastCycle: opts.lastCycle, today: todayISO(), vaultConfig: cfg });
      } catch (err) {
        if (err && typeof err.message === 'string' && err.message.startsWith('invalid --cycle value')) {
          process.stderr.write(`error: ${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }

      const cycle = window.cycleName;
      const draftPath = getReviewFilePath(cycle);
      const finalPath = getReviewFinalFilePath(cycle);
      const managerPath = getReviewManagerFilePath(cycle);

      const draftPresent = await fileExists(draftPath);
      const finalPresent = await fileExists(finalPath);
      const managerPresent = await fileExists(managerPath);

      // Feedback-items count read from the manager file (deterministic, code-counted, never modeled).
      let feedbackCount = 0;
      if (managerPresent) {
        try { feedbackCount = parseFeedbackItems(await readFile(managerPath, 'utf8')).length; } catch { feedbackCount = 0; }
      }

      process.stdout.write(`Review status for ${cycle}:\n`);
      process.stdout.write(`  generated draft: ${draftPresent ? 'present' : 'absent'}\n`);
      process.stdout.write(`  final:           ${finalPresent ? 'present' : 'absent'}\n`);
      process.stdout.write(`  manager:         ${managerPresent ? 'present' : 'absent'}\n`);
      process.stdout.write(`  feedback items:  ${managerPresent ? `${feedbackCount} item(s)` : 'absent'}\n`);
    });

  return cmd;
}
