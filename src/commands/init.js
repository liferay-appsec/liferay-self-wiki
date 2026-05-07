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
const PERMISSIONS_SRC = join(TEMPLATES, 'permissions.json');
const VAULT_CFG_SRC = join(TEMPLATES, 'vault', '.self-wiki', 'config.json');

const SKILL_DEST = join(homedir(), '.claude', 'skills', 'wiki', 'SKILL.md');
const SETTINGS_DEST = join(homedir(), '.claude', 'settings.json');

export async function initCommand(vaultArg, opts = {}) {
  const vaultPath = resolve(vaultArg || (await readUserConfig()).vaultPath || join(homedir(), 'self-wiki-vault'));
  await mkdir(vaultPath, { recursive: true });
  setVaultPath(vaultPath);

  process.stdout.write(chalk.bold(`self-wiki init → ${vaultPath}\n\n`));

  await ensureVaultDirs();
  process.stdout.write(`  ${chalk.green('✓')} vault folders ready (Daily/, Reports/, Reviews/, Tickets/, Components/)\n`);

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

  if (opts.permissions !== false) {
    await proposePermissions(opts.yes);
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
  for (const [event, desiredBlocks] of Object.entries(desired.hooks)) {
    const existing = next.hooks[event] ?? [];
    const merged = [];
    const consumed = new Set();
    for (const block of existing) {
      if (isSelfWikiBlock(block)) {
        // Replace an existing self-wiki entry with the matching desired one
        // (upgrade path). Drop it if the new version has nothing for this event.
        const idx = desiredBlocks.findIndex((_, i) => !consumed.has(i));
        if (idx !== -1) {
          merged.push(desiredBlocks[idx]);
          consumed.add(idx);
        }
      } else {
        merged.push(block);
      }
    }
    for (let i = 0; i < desiredBlocks.length; i++) {
      if (!consumed.has(i)) merged.push(desiredBlocks[i]);
    }
    next.hooks[event] = merged;
  }
  return next;
}

async function proposePermissions(skipConfirm) {
  const desired = JSON.parse(await readFile(PERMISSIONS_SRC, 'utf8'));
  const desiredAllow = desired?.permissions?.allow ?? [];
  if (desiredAllow.length === 0) return;

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

  const currentAllow = current?.permissions?.allow ?? [];
  const additions = desiredAllow.filter((entry) => !currentAllow.includes(entry));

  if (additions.length === 0) {
    process.stdout.write(`  ${chalk.green('✓')} self-wiki permissions already present in ${rel(SETTINGS_DEST)}\n`);
    return;
  }

  process.stdout.write(`  ${chalk.bold('proposed permissions.allow additions')} in ${rel(SETTINGS_DEST)}:\n`);
  for (const entry of additions) {
    process.stdout.write(`    ${chalk.green('+')} ${chalk.dim(entry)}\n`);
  }

  const ok = skipConfirm || await confirm('  apply?', true);
  if (!ok) {
    process.stdout.write(`  ${chalk.yellow('·')} permissions not applied. Without these, Claude Code's auto-mode classifier may block self-wiki note calls.\n`);
    return;
  }

  const next = {
    ...current,
    permissions: {
      ...(current.permissions ?? {}),
      allow: [...currentAllow, ...additions],
    },
  };
  await writeFile(SETTINGS_DEST, JSON.stringify(next, null, 2) + '\n', 'utf8');
  process.stdout.write(`  ${chalk.green('✓')} permissions written to ${rel(SETTINGS_DEST)}\n`);
}

function isSelfWikiBlock(block) {
  if (!block?.hooks) return false;
  return block.hooks.some(
    (h) => typeof h?.command === 'string' && /(?:^|\s)self-wiki\s/.test(h.command),
  );
}

function describeHookDiff(currentHooks, mergedHooks) {
  const lines = [];
  for (const event of Object.keys(mergedHooks)) {
    const before = currentHooks[event] ?? [];
    const after = mergedHooks[event];
    const beforeJson = before.map((b) => JSON.stringify(b));
    const afterJson = after.map((b) => JSON.stringify(b));
    for (let i = 0; i < after.length; i++) {
      if (i >= before.length) {
        const cmd = firstCommand(after[i]);
        lines.push(`${chalk.green('+')} ${event}: add → ${chalk.dim(truncate(cmd, 80))}`);
      } else if (beforeJson[i] !== afterJson[i]) {
        const cmd = firstCommand(after[i]);
        lines.push(`${chalk.yellow('~')} ${event}: update → ${chalk.dim(truncate(cmd, 80))}`);
      }
    }
    if (before.length > after.length) {
      lines.push(`${chalk.red('-')} ${event}: ${before.length - after.length} entry/entries removed`);
    }
  }
  return lines;
}

function firstCommand(block) {
  return block?.hooks?.[0]?.command ?? '<command>';
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
