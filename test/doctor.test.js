import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
  readFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TEMPLATES = join(REPO_ROOT, 'src', 'templates');
const HOOKS_TEMPLATE = join(TEMPLATES, 'hooks.json');
const PERMISSIONS_TEMPLATE = join(TEMPLATES, 'permissions.json');
const SKILL_TEMPLATE = join(TEMPLATES, 'skill', 'SKILL.md');

let tmp;
let doctor;
let paths;

// Paths inside the test fixture (HOME is redirected to tmp).
let settingsPath; // <tmp>/.claude/settings.json
let skillPath;    // <tmp>/.claude/skills/wiki/SKILL.md
let vaultPath;    // <tmp>/vault
let userCfgPath;  // <tmp>/cfg/self-wiki/config.json
let origPath;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-doctor-'));
  // Set HOME + XDG_* + PATH BEFORE dynamic-import of doctor.js so the
  // SETTINGS_DEST / SKILL_DEST module-scope constants (computed from
  // homedir() at import time) resolve under the tmp fixture.
  process.env.HOME = tmp;
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');

  // Build a claude stub on PATH so hasClaudeCli() returns true by default.
  const binDir = join(tmp, 'bin');
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, 'claude');
  writeFileSync(stub, '#!/bin/sh\necho "claude 0.0.0"\nexit 0\n', 'utf8');
  chmodSync(stub, 0o755);
  origPath = process.env.PATH;
  process.env.PATH = `${binDir}:${origPath}`;

  doctor = await import('../src/commands/doctor.js');
  paths = await import('../src/utils/paths.js');

  settingsPath = join(tmp, '.claude', 'settings.json');
  skillPath = join(tmp, '.claude', 'skills', 'wiki', 'SKILL.md');
  vaultPath = join(tmp, 'vault');
  userCfgPath = join(tmp, 'cfg', 'self-wiki', 'config.json');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  // Fresh state per test: wipe and rebuild the fixture skeleton, reset
  // the module-scope activeVaultPath so a prior test does not leak.
  rmSync(join(tmp, '.claude'), { recursive: true, force: true });
  rmSync(join(tmp, 'vault'), { recursive: true, force: true });
  rmSync(join(tmp, 'cfg'), { recursive: true, force: true });
  mkdirSync(join(tmp, '.claude', 'skills', 'wiki'), { recursive: true });
  mkdirSync(join(tmp, 'cfg', 'self-wiki'), { recursive: true });
  paths.setVaultPath(null);
});

function captureStdout(fn) {
  // Tee pattern: record everything the wrapped fn writes to stdout, but
  // also flush each chunk to the real stdout so the node:test runner's
  // TAP "ok N - <name>" lines (which are emitted on the same stream
  // between subtests) still reach the parent process. Replacing
  // process.stdout.write outright would swallow those emissions and
  // make `npm test` rollup undercount this file's subtests.
  const orig = process.stdout.write.bind(process.stdout);
  let captured = '';
  let recording = true;
  process.stdout.write = (chunk, ...rest) => {
    if (recording && typeof chunk === 'string') {
      captured += chunk;
    } else if (recording && Buffer.isBuffer(chunk)) {
      captured += chunk.toString('utf8');
    }
    return orig(chunk, ...rest);
  };
  return Promise.resolve(fn()).finally(() => {
    recording = false;
    process.stdout.write = orig;
  }).then(() => captured);
}

function seedHappyPath() {
  // Vault.
  mkdirSync(vaultPath, { recursive: true });
  // User config with vaultPath.
  writeFileSync(userCfgPath, JSON.stringify({ vaultPath }), 'utf8');
  // settings.json with templated hooks + permissions verbatim.
  const hooks = JSON.parse(readFileSync(HOOKS_TEMPLATE, 'utf8'));
  const perms = JSON.parse(readFileSync(PERMISSIONS_TEMPLATE, 'utf8'));
  writeFileSync(
    settingsPath,
    JSON.stringify({ hooks: hooks.hooks, permissions: perms.permissions }, null, 2),
    'utf8'
  );
  // Skill.
  copyFileSync(SKILL_TEMPLATE, skillPath);
}

test('happy path: all 7 checks pass, summary 7/7, failingCount 0', async () => {
  seedHappyPath();
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /Runtime/);
  assert.match(out, /Vault/);
  assert.match(out, /Claude Code wiring/);
  // All seven labels appear with ✓ (note: chalk strips on non-TTY pipe).
  // Build the regex from a plain string (not a template literal) so the `${}`
  // metacharacter escape class doesn't confuse the JS parser.
  for (const label of [
    'Node ≥ 20',
    'claude CLI on PATH',
    'vault config present',
    'vault path exists on disk',
    'hooks merged in settings.json',
    'permissions merged in settings.json',
    'wiki skill installed',
  ]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(out, new RegExp('✓ ' + escaped));
  }
  assert.match(out, /^summary: 7\/7 passing$/m);
  assert.equal(result.failingCount, 0);
});

test('claude ✗: missing claude binary on PATH', async () => {
  seedHappyPath();
  const emptyBin = join(tmp, 'empty-bin');
  mkdirSync(emptyBin, { recursive: true });
  const origPathLocal = process.env.PATH;
  process.env.PATH = emptyBin;
  try {
    let result;
    const out = await captureStdout(async () => {
      result = await doctor.doctorCommand({ skipExit: true });
    });
    assert.match(out, /✗ claude CLI on PATH/);
    assert.match(out, /install Claude Code: https:\/\/docs\.claude\.com\/en\/docs\/claude-code\/setup/);
    assert.ok(result.failingCount >= 1);
  } finally {
    process.env.PATH = origPathLocal;
  }
});

test('vault config missing: ✗ vault config present + scaffold hint', async () => {
  seedHappyPath();
  rmSync(userCfgPath, { force: true });
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /✗ vault config present/);
  assert.match(out, /run `self-wiki init <vault>` to scaffold one/);
  assert.ok(result.failingCount >= 1);
});

test('vault path missing on disk: ✗ vault path exists on disk + path-aware hint', async () => {
  seedHappyPath();
  rmSync(vaultPath, { recursive: true, force: true });
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /✗ vault path exists on disk/);
  assert.match(out, /does not exist — run `self-wiki init <vault>` to recreate or `self-wiki config vault <path>` to point at an existing one/);
  assert.ok(result.failingCount >= 1);
});

test('hooks missing: ✗ hooks merged + --hooks-only hint', async () => {
  seedHappyPath();
  // Strip self-wiki hooks: rewrite settings.json with empty hooks but keep perms.
  const perms = JSON.parse(readFileSync(PERMISSIONS_TEMPLATE, 'utf8'));
  writeFileSync(
    settingsPath,
    JSON.stringify({ hooks: {}, permissions: perms.permissions }, null, 2),
    'utf8'
  );
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /✗ hooks merged in settings.json/);
  assert.match(out, /run `self-wiki init --hooks-only`/);
  assert.ok(result.failingCount >= 1);
});

test('permissions missing: ✗ permissions + --permissions-only hint', async () => {
  seedHappyPath();
  const hooks = JSON.parse(readFileSync(HOOKS_TEMPLATE, 'utf8'));
  writeFileSync(
    settingsPath,
    JSON.stringify({ hooks: hooks.hooks, permissions: { allow: [] } }, null, 2),
    'utf8'
  );
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /✗ permissions merged in settings.json/);
  assert.match(out, /run `self-wiki init --permissions-only`/);
  assert.ok(result.failingCount >= 1);
});

test('skill missing: ✗ wiki skill installed + --skill-only hint', async () => {
  seedHappyPath();
  rmSync(skillPath, { force: true });
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /✗ wiki skill installed/);
  assert.match(out, /run `self-wiki init --skill-only`/);
  assert.ok(result.failingCount >= 1);
});

test('Tier 2 hooks drift: ✓ + drift line, drift does not flip exit code', async () => {
  seedHappyPath();
  // Same shape as template but with a mutated command string in SessionStart.
  // Mutating the command still keeps isSelfWikiBlock truthy (regex matches
  // "self-wiki "), so Tier 1 passes, but mergeHooks will replace the entry —
  // describeHookDiff returns ≥ 1 line → drift surfaces.
  const settings = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'self-wiki session open --different-flag || true' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'self-wiki session close --soft --silent --block-on-tell || true' }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: 'self-wiki session close --hard --silent 2>&1 || true' }] }],
      UserPromptSubmit: [{ hooks: [
        { type: 'command', command: 'self-wiki session switch --silent 2>&1 || true' },
        { type: 'command', command: 'self-wiki nudge 2>/dev/null || true' },
      ] }],
    },
    permissions: JSON.parse(readFileSync(PERMISSIONS_TEMPLATE, 'utf8')).permissions,
  };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /✓ hooks merged in settings.json/);
  assert.match(out, /command\(s\) differ from template — run `self-wiki init --hooks-only` to refresh/);
  // Tier-2 drift does NOT contribute to failingCount.
  assert.equal(result.failingCount, 0);
});

test('Tier 2 permissions drift: ✓ + drift count, drift does not flip exit code', async () => {
  seedHappyPath();
  const hooks = JSON.parse(readFileSync(HOOKS_TEMPLATE, 'utf8'));
  // Keep only one permission entry — Tier 1 passes (one Bash(self-wiki) match),
  // but the template has 10, so drift count = 9.
  writeFileSync(
    settingsPath,
    JSON.stringify({
      hooks: hooks.hooks,
      permissions: { allow: ['Bash(self-wiki note *)'] },
    }, null, 2),
    'utf8'
  );
  let result;
  const out = await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /✓ permissions merged in settings.json/);
  assert.match(out, /permissions: \d+ (?:entry|entries) missing — run `self-wiki init --permissions-only` to refresh/);
  assert.equal(result.failingCount, 0);
});

test('summary line — failing shape with count', async () => {
  seedHappyPath();
  rmSync(skillPath, { force: true });
  rmSync(vaultPath, { recursive: true, force: true });
  // 2 ✗ expected: skill missing, vault path missing.
  const out = await captureStdout(async () => {
    await doctor.doctorCommand({ skipExit: true });
  });
  assert.match(out, /summary: \d+\/7 passing — \d+ ✗ — fix the items above and re-run/);
});

test('process.exit is NOT called when skipExit is true and failingCount > 0', async () => {
  // Test the opts.skipExit escape hatch. Without it, the test process would die.
  seedHappyPath();
  rmSync(skillPath, { force: true });
  let result;
  await captureStdout(async () => {
    result = await doctor.doctorCommand({ skipExit: true });
  });
  // We're still alive — assertion stands as proof.
  assert.ok(result.failingCount > 0);
});
