import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, paths, config;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-config-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  config = await import('../src/core/config.js');
  vault = join(tmp, 'vault');
  mkdirSync(vault, { recursive: true });
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('readUserConfig returns defaults when file missing', async () => {
  const cfg = await config.readUserConfig();
  assert.equal(cfg.vaultPath, null);
  assert.equal(cfg.jira.enabled, false);
  assert.equal(cfg.jira.baseUrl, null);
  assert.equal(cfg.jira.tokenEnvVar, null);
});

test('writeUserConfig persists patch and round-trips through readUserConfig', async () => {
  await config.writeUserConfig({ vaultPath: '/some/path' });
  const cfg = await config.readUserConfig();
  assert.equal(cfg.vaultPath, '/some/path');
  // defaults preserved on unrelated branches
  assert.equal(cfg.jira.enabled, false);
});

test('writeUserConfig deep-merges jira sub-object across calls', async () => {
  await config.writeUserConfig({ jira: { enabled: true } });
  let cfg = await config.readUserConfig();
  assert.equal(cfg.jira.enabled, true);
  assert.equal(cfg.jira.baseUrl, null);

  await config.writeUserConfig({ jira: { baseUrl: 'https://j' } });
  cfg = await config.readUserConfig();
  // earlier `enabled: true` not lost by partial patch
  assert.equal(cfg.jira.enabled, true);
  assert.equal(cfg.jira.baseUrl, 'https://j');
});

test('applyUserConfig sets the active vault path', async () => {
  await config.writeUserConfig({ vaultPath: vault });
  const cfg = await config.applyUserConfig();
  assert.equal(cfg.vaultPath, vault);
  assert.equal(paths.tryGetVaultPath(), vault);
});

test('readVaultConfig returns defaults when file missing', async () => {
  paths.setVaultPath(vault);
  const cfg = await config.readVaultConfig();
  assert.equal(cfg.softCloseMinutes, 5);
  assert.match(cfg.ticketRegex, /LPD/);
  assert.match(cfg.branchTicketRegex, /LPD/);
  assert.deepEqual(cfg.components, []);
});

test('writeVaultConfig merges patch with defaults and persists', async () => {
  paths.setVaultPath(vault);
  await config.writeVaultConfig({
    softCloseMinutes: 10,
    components: ['portal'],
  });
  const cfg = await config.readVaultConfig();
  assert.equal(cfg.softCloseMinutes, 10);
  assert.deepEqual(cfg.components, ['portal']);
  // default fields still present after a partial patch
  assert.match(cfg.ticketRegex, /LPD/);
});

test('getVaultDefaults returns a fresh clone each call', () => {
  const a = config.getVaultDefaults();
  const b = config.getVaultDefaults();
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  a.softCloseMinutes = 999;
  assert.notEqual(b.softCloseMinutes, 999);
});
