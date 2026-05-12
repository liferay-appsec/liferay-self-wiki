import { readFile, access } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import chalk from 'chalk';
import { applyUserConfig, readUserConfig } from '../core/config.js';
import { tryGetVaultPath, getUserConfigFilePath } from '../utils/paths.js';
import { hasClaudeCli } from '../core/claude.js';
import { mergeHooks, describeHookDiff, isSelfWikiBlock } from './init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(__dirname, '..', 'templates');
const HOOKS_SRC = join(TEMPLATES, 'hooks.json');
const PERMISSIONS_SRC = join(TEMPLATES, 'permissions.json');
const SKILL_DEST = join(homedir(), '.claude', 'skills', 'wiki', 'SKILL.md');
const SETTINGS_DEST = join(homedir(), '.claude', 'settings.json');

const HOOK_EVENTS = ['SessionStart', 'Stop', 'SessionEnd', 'UserPromptSubmit'];
const PERMISSIONS_PREFIX = 'Bash(self-wiki ';

export async function doctorCommand(opts = {}) {
  await applyUserConfig();

  process.stdout.write(chalk.bold('self-wiki doctor') + '\n\n');

  let failingCount = 0;

  let settings = {};
  try {
    settings = JSON.parse(await readFile(SETTINGS_DEST, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Corrupt JSON / permission error — surface why so the user knows it
      // isn't just missing, then continue with an empty settings shape.
      process.stdout.write(`  ${chalk.dim('i')} could not read ${rel(SETTINGS_DEST)}: ${err.message}\n`);
    }
  }

  process.stdout.write(chalk.bold('Runtime') + '\n');

  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 20) {
    pass('Node ≥ 20');
  } else {
    fail('Node ≥ 20', 'install Node ≥ 20 (e.g. `nvm install 20`)');
    failingCount++;
  }

  const claudePresent = await hasClaudeCli();
  if (claudePresent) {
    pass('claude CLI on PATH');
  } else {
    fail('claude CLI on PATH', 'install Claude Code: https://docs.claude.com/en/docs/claude-code/setup');
    failingCount++;
  }

  process.stdout.write('\n');

  process.stdout.write(chalk.bold('Vault') + '\n');

  // readUserConfig is no-throw — it returns the default shape on any read
  // failure, conflating "absent" with "present-but-malformed". Probe the
  // file separately so the two cases get distinct remediations.
  const userCfg = await readUserConfig();
  const vaultConfigured = userCfg.vaultPath !== null;
  const cfgFile = getUserConfigFilePath();
  let cfgFilePresent = false;
  try {
    await access(cfgFile);
    cfgFilePresent = true;
  } catch {
    /* file effectively absent */
  }
  if (vaultConfigured) {
    pass('vault config present');
  } else if (cfgFilePresent) {
    fail(
      'vault config present',
      rel(cfgFile) + ' exists but vaultPath is unset/unreadable — fix the file or rerun `self-wiki init <vault>`'
    );
    failingCount++;
  } else {
    fail('vault config present', 'run `self-wiki init <vault>` to scaffold one');
    failingCount++;
  }

  const vaultPath = tryGetVaultPath();
  let vaultExists = false;
  if (vaultPath) {
    vaultExists = await fileExists(vaultPath);
  }
  if (vaultExists) {
    pass('vault path exists on disk');
  } else {
    const resolvedHint = vaultPath ? rel(vaultPath) : '<unset>';
    fail(
      'vault path exists on disk',
      'vault path `' + resolvedHint + '` does not exist — run `self-wiki init <vault>` to recreate or `self-wiki config vault <path>` to point at an existing one'
    );
    failingCount++;
  }

  process.stdout.write('\n');

  process.stdout.write(chalk.bold('Claude Code wiring') + '\n');

  const currentHooks = settings.hooks ?? {};
  const missingHookEvents = HOOK_EVENTS.filter((event) => {
    const blocks = currentHooks[event] ?? [];
    return !blocks.some(isSelfWikiBlock);
  });
  const hooksPresent = missingHookEvents.length === 0;
  if (hooksPresent) {
    pass('hooks merged in settings.json');
  } else {
    fail('hooks merged in settings.json', 'run `self-wiki init --hooks-only`');
    failingCount++;
  }

  const currentAllow = settings?.permissions?.allow ?? [];
  const permissionsPresent = currentAllow.some(
    (entry) => typeof entry === 'string' && entry.startsWith(PERMISSIONS_PREFIX)
  );
  if (permissionsPresent) {
    pass('permissions merged in settings.json');
  } else {
    fail('permissions merged in settings.json', 'run `self-wiki init --permissions-only`');
    failingCount++;
  }

  const skillExists = await fileExists(SKILL_DEST);
  if (skillExists) {
    pass('wiki skill installed');
  } else {
    fail('wiki skill installed', 'run `self-wiki init --skill-only`');
    failingCount++;
  }

  await emitHooksDrift(settings);
  await emitPermissionsDrift(settings);

  process.stdout.write('\n');

  const passingCount = 7 - failingCount;
  if (failingCount === 0) {
    process.stdout.write(`summary: 7/7 passing\n`);
  } else {
    process.stdout.write(
      `summary: ${passingCount}/7 passing — ${failingCount} ✗ — fix the items above and re-run\n`
    );
  }

  if (failingCount > 0 && !opts.skipExit) {
    process.exit(1);
  }
  return { failingCount };
}

function pass(label) {
  process.stdout.write(`  ${chalk.green('✓')} ${label}\n`);
}

function fail(label, hint) {
  process.stdout.write(`  ${chalk.red('✗')} ${label}\n`);
  process.stdout.write(`    → ${hint}\n`);
}

async function emitHooksDrift(settings) {
  let desired;
  try {
    desired = JSON.parse(await readFile(HOOKS_SRC, 'utf8'));
  } catch {
    return;
  }
  const merged = mergeHooks(settings, desired);
  const diffs = describeHookDiff(settings.hooks ?? {}, merged.hooks);
  if (diffs.length > 0) {
    // Token 'i hooks:' must be a single contiguous string — the README's
    // Troubleshooting table quotes it verbatim for grep.
    process.stdout.write(
      '  ' + chalk.dim('i hooks:') + ' ' + diffs.length + ' command(s) differ from template — run `self-wiki init --hooks-only` to refresh\n'
    );
  }
}

async function emitPermissionsDrift(settings) {
  let desired;
  try {
    desired = JSON.parse(await readFile(PERMISSIONS_SRC, 'utf8'));
  } catch {
    return;
  }
  const desiredAllow = desired?.permissions?.allow ?? [];
  const currentAllow = settings?.permissions?.allow ?? [];
  const missing = desiredAllow.filter((entry) => !currentAllow.includes(entry));
  if (missing.length > 0) {
    const noun = missing.length === 1 ? 'entry' : 'entries';
    // Token 'i permissions:' must be a single contiguous string — README
    // Troubleshooting table quotes it verbatim for grep.
    process.stdout.write(
      '  ' + chalk.dim('i permissions:') + ' ' + missing.length + ' ' + noun + ' missing — run `self-wiki init --permissions-only` to refresh\n'
    );
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
