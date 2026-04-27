import { readFile, writeFile, mkdir, copyFile, access } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';
import {
  setVaultPath,
  ensureVaultDirs,
  getVaultConfigFilePath,
} from '../utils/paths.js';
import { writeUserConfig, readUserConfig } from '../core/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(__dirname, '..', 'templates');
const SKILL_SRC = join(TEMPLATES, 'skill', 'SKILL.md');
const HOOKS_SRC = join(TEMPLATES, 'hooks.json');
const VAULT_CFG_SRC = join(TEMPLATES, 'vault', '.self-wiki', 'config.json');

const SKILL_DEST = join(homedir(), '.claude', 'skills', 'wiki', 'SKILL.md');
const SETTINGS_DEST = join(homedir(), '.claude', 'settings.json');

export async function initCommand(vaultArg, opts = {}) {
  const vaultPath = resolve(vaultArg || (await readUserConfig()).vaultPath || join(homedir(), 'self-wiki-vault'));
  await mkdir(vaultPath, { recursive: true });
  setVaultPath(vaultPath);

  process.stdout.write(chalk.bold(`self-wiki init → ${vaultPath}\n\n`));

  await ensureVaultDirs();
  process.stdout.write(`  ${chalk.green('✓')} vault folders ready (Daily/, Reports/, Tickets/, Components/)\n`);

  const vaultCfgDest = getVaultConfigFilePath();
  if (!(await fileExists(vaultCfgDest))) {
    await mkdir(dirname(vaultCfgDest), { recursive: true });
    await copyFile(VAULT_CFG_SRC, vaultCfgDest);
    process.stdout.write(`  ${chalk.green('✓')} seeded ${rel(vaultCfgDest)}\n`);
  } else {
    process.stdout.write(`  ${chalk.yellow('·')} ${rel(vaultCfgDest)} already exists (left as-is)\n`);
  }

  await writeUserConfig({ vaultPath });
  process.stdout.write(`  ${chalk.green('✓')} user config recorded vault path\n`);

  if (opts.skill !== false) {
    await mkdir(dirname(SKILL_DEST), { recursive: true });
    if (await fileExists(SKILL_DEST)) {
      const overwrite = opts.yes || await confirm(`overwrite existing ${rel(SKILL_DEST)}?`, false);
      if (overwrite) {
        await copyFile(SKILL_SRC, SKILL_DEST);
        process.stdout.write(`  ${chalk.green('✓')} skill installed to ${rel(SKILL_DEST)}\n`);
      } else {
        process.stdout.write(`  ${chalk.yellow('·')} skill not overwritten\n`);
      }
    } else {
      await copyFile(SKILL_SRC, SKILL_DEST);
      process.stdout.write(`  ${chalk.green('✓')} skill installed to ${rel(SKILL_DEST)}\n`);
    }
  }

  if (opts.hooks !== false) {
    await proposeHooks(opts.yes);
  }

  process.stdout.write('\n' + chalk.bold('done.') + '\n\n');
  process.stdout.write('next:\n');
  process.stdout.write(`  ${chalk.dim('•')} ${chalk.cyan('cd <repo> && claude')}  — start Claude Code; SessionStart hook opens a session\n`);
  process.stdout.write(`  ${chalk.dim('•')} ${chalk.cyan('self-wiki status')}  — confirm a session is active\n`);
  process.stdout.write(`  ${chalk.dim('•')} ${chalk.cyan('self-wiki report --week')}  — generate a weekly report\n`);
  process.stdout.write('\noptional:\n');
  process.stdout.write(`  ${chalk.dim('•')} ${chalk.cyan('gh auth login')}  — enables PR-title detection\n`);
  process.stdout.write(`  ${chalk.dim('•')} ${chalk.cyan('self-wiki config jira')}  — enable JIRA ticket-title enrichment\n`);
}

async function proposeHooks(skipConfirm) {
  const desired = JSON.parse(await readFile(HOOKS_SRC, 'utf8'));
  await mkdir(dirname(SETTINGS_DEST), { recursive: true });

  let current = {};
  try {
    current = JSON.parse(await readFile(SETTINGS_DEST, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`  ${chalk.red('✗')} could not read ${rel(SETTINGS_DEST)}: ${err.message}\n`);
      return;
    }
  }

  const merged = mergeHooks(current, desired);
  const diffSummary = describeHookDiff(current.hooks ?? {}, merged.hooks);

  if (diffSummary.length === 0) {
    process.stdout.write(`  ${chalk.green('✓')} hooks already present in ${rel(SETTINGS_DEST)}\n`);
    return;
  }

  process.stdout.write(`  ${chalk.bold('proposed hook changes')} in ${rel(SETTINGS_DEST)}:\n`);
  for (const line of diffSummary) {
    process.stdout.write(`    ${line}\n`);
  }

  const ok = skipConfirm || await confirm('  apply?', true);
  if (!ok) {
    process.stdout.write(`  ${chalk.yellow('·')} hooks not applied. Re-run with --yes or copy from ${SRC_HOOKS_REL_HINT}\n`);
    return;
  }

  await writeFile(SETTINGS_DEST, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  process.stdout.write(`  ${chalk.green('✓')} hooks written to ${rel(SETTINGS_DEST)}\n`);
}

function mergeHooks(current, desired) {
  const next = { ...current, hooks: { ...(current.hooks ?? {}) } };
  for (const [event, blocks] of Object.entries(desired.hooks)) {
    const existing = next.hooks[event] ?? [];
    const merged = [...existing];
    for (const block of blocks) {
      const alreadyPresent = existing.some((b) =>
        JSON.stringify(b.hooks) === JSON.stringify(block.hooks),
      );
      if (!alreadyPresent) merged.push(block);
    }
    next.hooks[event] = merged;
  }
  return next;
}

function describeHookDiff(currentHooks, mergedHooks) {
  const lines = [];
  for (const event of Object.keys(mergedHooks)) {
    const before = currentHooks[event] ?? [];
    const after = mergedHooks[event];
    if (after.length > before.length) {
      const added = after.length - before.length;
      const cmd = after[after.length - 1]?.hooks?.[0]?.command ?? '<command>';
      lines.push(`${chalk.green('+')} ${event}: +${added} hook → ${chalk.dim(truncate(cmd, 80))}`);
    }
  }
  return lines;
}

async function confirm(prompt, defaultYes) {
  const rl = createInterface({ input, output });
  try {
    const suffix = defaultYes ? '[Y/n] ' : '[y/N] ';
    const answer = (await rl.question(`${prompt} ${suffix}`)).trim().toLowerCase();
    if (answer === '') return defaultYes;
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function rel(path) {
  return path.replace(homedir(), '~');
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const SRC_HOOKS_REL_HINT = 'src/templates/hooks.json';
