import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const HOOKS_TEMPLATE = join(REPO_ROOT, 'src', 'templates', 'hooks.json');
const PERMISSIONS_TEMPLATE = join(REPO_ROOT, 'src', 'templates', 'permissions.json');

let tmp;
let init;
let settingsPath, skillPath, userCfgPath;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-narrow-flags-'));
  // HOME + XDG_* must be set BEFORE the dynamic import — init.js computes
  // SETTINGS_DEST/SKILL_DEST at module load via homedir().
  process.env.HOME = tmp;
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');

  init = await import('../src/commands/init.js');

  settingsPath = join(tmp, '.claude', 'settings.json');
  skillPath = join(tmp, '.claude', 'skills', 'wiki', 'SKILL.md');
  userCfgPath = join(tmp, 'cfg', 'self-wiki', 'config.json');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(join(tmp, '.claude'), { recursive: true, force: true });
  rmSync(join(tmp, 'vault'), { recursive: true, force: true });
  rmSync(join(tmp, 'self-wiki-vault'), { recursive: true, force: true });
  rmSync(join(tmp, 'cfg'), { recursive: true, force: true });
  mkdirSync(join(tmp, '.claude'), { recursive: true });
  mkdirSync(join(tmp, 'cfg'), { recursive: true });
});

// No stdout capture: replacing process.stdout.write breaks node:test's TAP
// emission (all but the last subtest get dropped from the roll-up). A tee
// variant overflows the runner's IPC channel under `npm test`. These tests
// assert filesystem state, not stdout — noisier TAP is the right tradeoff.

test('--hooks-only: writes hooks to settings.json; skips vault, skill, permissions, user config', async () => {
  await init.initCommand(undefined, { hooksOnly: true, yes: true });
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  for (const event of ['SessionStart', 'Stop', 'SessionEnd', 'UserPromptSubmit']) {
    assert.ok(settings.hooks?.[event]?.length >= 1, `hook ${event} missing after --hooks-only`);
  }
  assert.equal(settings.permissions?.allow?.length ?? 0, 0);
  assert.equal(existsSync(skillPath), false, 'skill must not be installed by --hooks-only');
  assert.equal(existsSync(userCfgPath), false, 'user config must not be written by --hooks-only');
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false, '--hooks-only must not scaffold a vault');
  assert.equal(existsSync(join(tmp, 'vault')), false, '--hooks-only must not scaffold a vault');
});

test('--permissions-only: writes permissions.allow; skips vault, hooks, skill, user config', async () => {
  await init.initCommand(undefined, { permissionsOnly: true, yes: true });
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const allow = settings.permissions?.allow ?? [];
  assert.ok(allow.some((e) => e.startsWith('Bash(self-wiki ')), 'expected at least one Bash(self-wiki ...) entry');
  assert.equal(Object.keys(settings.hooks ?? {}).length, 0, '--permissions-only must not write hooks');
  assert.equal(existsSync(skillPath), false);
  assert.equal(existsSync(userCfgPath), false);
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false);
});

test('--skill-only: installs skill file; skips vault, hooks, permissions, user config', async () => {
  await init.initCommand(undefined, { skillOnly: true, yes: true });
  assert.equal(existsSync(skillPath), true, 'skill must be installed by --skill-only');
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(Object.keys(settings.hooks ?? {}).length, 0, '--skill-only must not write hooks');
    assert.equal(settings.permissions?.allow?.length ?? 0, 0, '--skill-only must not write permissions');
  }
  assert.equal(existsSync(userCfgPath), false);
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false);
});

test('--hooks-only --permissions-only combination: both land; skill and vault skipped', async () => {
  await init.initCommand(undefined, {
    hooksOnly: true,
    permissionsOnly: true,
    yes: true,
  });
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  for (const event of ['SessionStart', 'Stop', 'SessionEnd', 'UserPromptSubmit']) {
    assert.ok(settings.hooks?.[event]?.length >= 1, `hook ${event} missing after combination`);
  }
  const allow = settings.permissions?.allow ?? [];
  assert.ok(allow.some((e) => e.startsWith('Bash(self-wiki ')), 'expected at least one Bash(self-wiki ...) entry');
  assert.equal(existsSync(skillPath), false, '--hooks-only + --permissions-only must NOT install skill');
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false);
  assert.equal(existsSync(userCfgPath), false);
});

test('--hooks-only --permissions-only --skill-only triple combination: all three land; vault skipped', async () => {
  await init.initCommand(undefined, {
    hooksOnly: true,
    permissionsOnly: true,
    skillOnly: true,
    yes: true,
  });
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.ok(Object.keys(settings.hooks ?? {}).length >= 4);
  assert.ok((settings.permissions?.allow ?? []).length >= 1);
  assert.equal(existsSync(skillPath), true);
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false);
  assert.equal(existsSync(userCfgPath), false);
});

test('Full-flow regression: init <vault> with no narrow flags still scaffolds everything', async () => {
  const vault = join(tmp, 'vault');
  await init.initCommand(vault, { yes: true, setDefault: false });
  assert.equal(existsSync(vault), true);
  assert.equal(existsSync(join(vault, '.self-wiki', 'config.json')), true);
  assert.equal(existsSync(skillPath), true);
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  for (const event of ['SessionStart', 'Stop', 'SessionEnd', 'UserPromptSubmit']) {
    assert.ok(settings.hooks?.[event]?.length >= 1, `full flow missing hook ${event}`);
  }
  assert.ok((settings.permissions?.allow ?? []).some((e) => e.startsWith('Bash(self-wiki ')));
  assert.equal(existsSync(userCfgPath), false);
});
