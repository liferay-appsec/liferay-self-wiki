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

// Paths under the test fixture (HOME redirected to tmp).
let settingsPath; // <tmp>/.claude/settings.json
let skillPath;    // <tmp>/.claude/skills/wiki/SKILL.md
let userCfgPath;  // <tmp>/cfg/self-wiki/config.json

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-narrow-flags-'));
  // Set HOME + XDG_* BEFORE dynamic-import of init.js so the SETTINGS_DEST /
  // SKILL_DEST module-scope constants (computed from homedir() at import
  // time) resolve under the tmp fixture.
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

// NOTE on stdout capture: an earlier iteration of this file used a
// `captureStdout(fn)` helper (verbatim from test/nudge.test.js) to swallow
// init's verbose helper output ("✓ skill installed", "proposed hook
// changes", "done." + next-steps footer, etc.) so the TAP log stayed
// clean. Under `node --test test/init-narrow-flags.test.js` that pattern
// caused all but the last `test(...)` block to be silently dropped from
// the TAP roll-up — even though every test's body ran and every assertion
// passed in-process — because replacing `process.stdout.write` for the
// duration of `fn()` collides with how node:test serializes its `# Subtest`
// / `ok N` emissions to the parent runner. The tee variant from
// test/doctor.test.js overflowed the runner's structured-clone IPC under
// `npm test` ("Unable to deserialize cloned data due to invalid or
// unsupported version") because init's per-test output volume is much
// higher than doctor's. The cleanest fix is to skip stdout capture
// entirely — these tests assert on filesystem side effects, not on what
// init printed, so a noisier-but-correct TAP log is the right tradeoff.

test('--hooks-only: writes hooks to settings.json; skips vault, skill, permissions, user config', async () => {
  await init.initCommand(undefined, { hooksOnly: true, yes: true });
  // Hooks landed.
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  for (const event of ['SessionStart', 'Stop', 'SessionEnd', 'UserPromptSubmit']) {
    assert.ok(settings.hooks?.[event]?.length >= 1, `hook ${event} missing after --hooks-only`);
  }
  // Permissions NOT written.
  assert.equal(settings.permissions?.allow?.length ?? 0, 0);
  // Skill NOT installed.
  assert.equal(existsSync(skillPath), false, 'skill must not be installed by --hooks-only');
  // User config NOT written.
  assert.equal(existsSync(userCfgPath), false, 'user config must not be written by --hooks-only');
  // No vault directory created (none was supplied; the function must NOT default to ~/self-wiki-vault).
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false, '--hooks-only must not scaffold a vault');
  assert.equal(existsSync(join(tmp, 'vault')), false, '--hooks-only must not scaffold a vault');
});

test('--permissions-only: writes permissions.allow; skips vault, hooks, skill, user config', async () => {
  await init.initCommand(undefined, { permissionsOnly: true, yes: true });
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const allow = settings.permissions?.allow ?? [];
  assert.ok(allow.some((e) => e.startsWith('Bash(self-wiki ')), 'expected at least one Bash(self-wiki ...) entry');
  // Hooks NOT written.
  assert.equal(Object.keys(settings.hooks ?? {}).length, 0, '--permissions-only must not write hooks');
  // Skill NOT installed.
  assert.equal(existsSync(skillPath), false);
  // User config NOT written.
  assert.equal(existsSync(userCfgPath), false);
  // No vault.
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false);
});

test('--skill-only: installs skill file; skips vault, hooks, permissions, user config', async () => {
  await init.initCommand(undefined, { skillOnly: true, yes: true });
  // Skill landed.
  assert.equal(existsSync(skillPath), true, 'skill must be installed by --skill-only');
  // settings.json NOT created (or if created by some upstream side-effect, must be empty).
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(Object.keys(settings.hooks ?? {}).length, 0, '--skill-only must not write hooks');
    assert.equal(settings.permissions?.allow?.length ?? 0, 0, '--skill-only must not write permissions');
  }
  // User config NOT written.
  assert.equal(existsSync(userCfgPath), false);
  // No vault.
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
  // Skill skipped (no --skill-only).
  assert.equal(existsSync(skillPath), false, '--hooks-only + --permissions-only must NOT install skill');
  // Vault skipped.
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
  // Vault still skipped.
  assert.equal(existsSync(join(tmp, 'self-wiki-vault')), false);
  assert.equal(existsSync(userCfgPath), false);
});

test('Full-flow regression: init <vault> with no narrow flags still scaffolds everything', async () => {
  const vault = join(tmp, 'vault');
  // setDefault: false guard — HOME is already redirected to tmp, but
  // belt-and-suspenders against any future change that would write user
  // config from a non-redirected path. The assertion below verifies that
  // setDefault: false correctly suppresses the user-config write.
  await init.initCommand(vault, { yes: true, setDefault: false });
  // Vault directory created.
  assert.equal(existsSync(vault), true);
  // Vault config seeded.
  assert.equal(existsSync(join(vault, '.self-wiki', 'config.json')), true);
  // Skill installed.
  assert.equal(existsSync(skillPath), true);
  // Hooks merged.
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  for (const event of ['SessionStart', 'Stop', 'SessionEnd', 'UserPromptSubmit']) {
    assert.ok(settings.hooks?.[event]?.length >= 1, `full flow missing hook ${event}`);
  }
  // Permissions merged.
  assert.ok((settings.permissions?.allow ?? []).some((e) => e.startsWith('Bash(self-wiki ')));
  // setDefault: false → user config NOT written.
  assert.equal(existsSync(userCfgPath), false);
});
