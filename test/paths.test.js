import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp;
let paths;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-paths-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('getStateFilePath honors XDG_DATA_HOME', () => {
  assert.equal(
    paths.getStateFilePath(),
    join(tmp, 'data', 'self-wiki', 'state.json'),
  );
});

test('getSessionsDir honors XDG_DATA_HOME', () => {
  assert.equal(
    paths.getSessionsDir(),
    join(tmp, 'data', 'self-wiki', 'sessions'),
  );
});

test('getUserConfigFilePath honors XDG_CONFIG_HOME', () => {
  assert.equal(
    paths.getUserConfigFilePath(),
    join(tmp, 'cfg', 'self-wiki', 'config.json'),
  );
});

test('getSessionFilePath sanitizes unsafe characters in id', () => {
  const p = paths.getSessionFilePath('abc/xyz!@#');
  assert.match(p, /abc_xyz___\.json$/);
});

test('getSessionFilePath rejects empty id', () => {
  assert.throws(() => paths.getSessionFilePath(''), /required/);
  assert.throws(() => paths.getSessionFilePath(null), /required/);
  assert.throws(() => paths.getSessionFilePath(undefined), /required/);
});

test('getVaultPath throws before vault is configured', () => {
  assert.throws(() => paths.getVaultPath(), /No vault configured/);
});

test('tryGetVaultPath returns null before vault is configured', () => {
  assert.equal(paths.tryGetVaultPath(), null);
});

test('setVaultPath enables vault-relative helpers', () => {
  const vault = join(tmp, 'vault');
  paths.setVaultPath(vault);
  assert.equal(paths.tryGetVaultPath(), vault);
  assert.equal(
    paths.getDailyFilePath('2026-04-27'),
    join(vault, 'Daily', '2026-04-27.md'),
  );
  assert.equal(
    paths.getReportFilePath('2026-W18'),
    join(vault, 'Reports', '2026-W18.md'),
  );
  assert.equal(
    paths.getTicketFilePath('LPD-123'),
    join(vault, 'Tickets', 'LPD-123.md'),
  );
  assert.equal(
    paths.getComponentFilePath('liferay-portal'),
    join(vault, 'Components', 'liferay-portal.md'),
  );
  assert.equal(
    paths.getVaultConfigFilePath(),
    join(vault, '.self-wiki', 'config.json'),
  );
});

test('ensureVaultDirs creates Daily/Reports/Reviews/Tickets/Components/.self-wiki', async () => {
  const vault = join(tmp, 'vault');
  paths.setVaultPath(vault);
  await paths.ensureVaultDirs();
  for (const sub of ['Daily', 'Reports', 'Reviews', 'Tickets', 'Components', '.self-wiki']) {
    assert.ok(statSync(join(vault, sub)).isDirectory(), `missing ${sub}`);
  }
});

test('ensureDataDir + ensureSessionsDir + ensureConfigDir are idempotent', async () => {
  await paths.ensureDataDir();
  await paths.ensureDataDir();
  await paths.ensureSessionsDir();
  await paths.ensureSessionsDir();
  await paths.ensureConfigDir();
  await paths.ensureConfigDir();
  assert.ok(statSync(join(tmp, 'data', 'self-wiki')).isDirectory());
  assert.ok(statSync(join(tmp, 'data', 'self-wiki', 'sessions')).isDirectory());
  assert.ok(statSync(join(tmp, 'cfg', 'self-wiki')).isDirectory());
});

test('ensureParentDir creates the parent for a nested file path', async () => {
  const target = join(tmp, 'deep', 'nested', 'leaf.txt');
  await paths.ensureParentDir(target);
  assert.ok(statSync(join(tmp, 'deep', 'nested')).isDirectory());
});
