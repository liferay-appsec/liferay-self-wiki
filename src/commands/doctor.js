import { readFile, access } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import chalk from 'chalk';
import { applyUserConfig, readUserConfig } from '../core/config.js';
import { tryGetVaultPath } from '../utils/paths.js';
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

  // Read ~/.claude/settings.json once (ENOENT-tolerant; matches init.js pattern).
  let settings = {};
  try {
    settings = JSON.parse(await readFile(SETTINGS_DEST, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Corrupt JSON / permission error — treat as empty so hooks + perms ✗.
      // Surface why with a dim line so a user knows it isn't just missing.
      process.stdout.write(`  ${chalk.dim('i')} could not read ${rel(SETTINGS_DEST)}: ${err.message}\n`);
    }
  }

  // ── Section 1: Runtime ────────────────────────────────────────────────
  process.stdout.write(chalk.bold('Runtime') + '\n');

  // Check 1: Node ≥ 20
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 20) {
    pass('Node ≥ 20');
  } else {
    fail('Node ≥ 20', 'install Node ≥ 20 (e.g. `nvm install 20`)');
    failingCount++;
  }

  // Check 2: claude CLI on PATH (soft-dep: never throws — hasClaudeCli wraps it)
  const claudePresent = await hasClaudeCli();
  if (claudePresent) {
    pass('claude CLI on PATH');
  } else {
    fail('claude CLI on PATH', 'install Claude Code: https://docs.claude.com/en/docs/claude-code/setup');
    failingCount++;
  }

  process.stdout.write('\n');

  // ── Section 2: Vault ──────────────────────────────────────────────────
  process.stdout.write(chalk.bold('Vault') + '\n');

  // Check 3: vault config present (readUserConfig is no-throw; null = absent)
  //
  // REQ-INST-01 says the user config must be "present and readable".
  // readUserConfig() (src/core/config.js) is no-throw — on any read failure
  // (ENOENT, EACCES, parse error) it returns the USER_DEFAULTS shape with
  // vaultPath: null. So a non-null vaultPath here implies the file was BOTH
  // present AND readable — no separate fs.access(R_OK) probe is needed.
  const userCfg = await readUserConfig();
  const vaultConfigured = userCfg.vaultPath !== null;
  if (vaultConfigured) {
    pass('vault config present');
  } else {
    fail('vault config present', 'run `self-wiki init <vault>` to scaffold one');
    failingCount++;
  }

  // Check 4: vault path exists on disk
  // Use tryGetVaultPath() — applyUserConfig() above will have called setVaultPath()
  // if vaultPath was non-null. If not configured, the path-on-disk check trivially
  // fails with a remediation that re-references the vault setup.
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

  // ── Section 3: Claude Code wiring ─────────────────────────────────────
  process.stdout.write(chalk.bold('Claude Code wiring') + '\n');

  // Check 5: hooks merged in settings.json
  // Tier 1: each of HOOK_EVENTS has at least one block where a hooks[].command
  //         matches /(?:^|\s)self-wiki\s/ (i.e. isSelfWikiBlock).
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

  // Check 6: permissions merged in settings.json
  // Tier 1: at least one entry in permissions.allow starts with `Bash(self-wiki `.
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

  // Check 7: wiki skill installed (Tier 1 only — content drift omitted per
  // CONTEXT "Claude's Discretion → Skill-file content drift" recommendation).
  const skillExists = await fileExists(SKILL_DEST);
  if (skillExists) {
    pass('wiki skill installed');
  } else {
    fail('wiki skill installed', 'run `self-wiki init --skill-only`');
    failingCount++;
  }

  // Tier 2 drift lines — informational, never flip exit code.
  await emitHooksDrift(settings);
  await emitPermissionsDrift(settings);

  process.stdout.write('\n');

  // ── Summary ───────────────────────────────────────────────────────────
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

// ── helpers ────────────────────────────────────────────────────────────

function pass(label) {
  process.stdout.write(`  ${chalk.green('✓')} ${label}\n`);
}

function fail(label, hint) {
  process.stdout.write(`  ${chalk.red('✗')} ${label}\n`);
  process.stdout.write(`    → ${hint}\n`);
}

async function emitHooksDrift(settings) {
  // Compare current hooks to template-merged hooks. The diff count is the
  // length of describeHookDiff's output. Zero diff = silent (no info line).
  let desired;
  try {
    desired = JSON.parse(await readFile(HOOKS_SRC, 'utf8'));
  } catch {
    return; // template missing is a packaging bug — no drift line.
  }
  const merged = mergeHooks(settings, desired);
  const diffs = describeHookDiff(settings.hooks ?? {}, merged.hooks);
  if (diffs.length > 0) {
    process.stdout.write(
      '  ' + chalk.dim('i') + ' hooks: ' + diffs.length + ' command(s) differ from template — run `self-wiki init --hooks-only` to refresh\n'
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
    process.stdout.write(
      '  ' + chalk.dim('i') + ' permissions: ' + missing.length + ' ' + noun + ' missing — run `self-wiki init --permissions-only` to refresh\n'
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
