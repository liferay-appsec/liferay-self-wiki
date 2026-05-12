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

test('readVaultConfig lazy-migrates a legacy on-disk config without a review key (D-07)', async () => {
  // Write a legacy-shape vault config (no `review` key) directly to disk and
  // confirm readVaultConfig surfaces the new defaults transparently.
  const { writeFile, mkdir } = await import('fs/promises');
  const { dirname } = await import('path');
  paths.setVaultPath(vault);
  const cfgPath = paths.getVaultConfigFilePath();
  await mkdir(dirname(cfgPath), { recursive: true });
  const legacy = {
    ticketRegex: '\\b(LPD|LPP|LPS|LRELEASE)-\\d+\\b',
    branchTicketRegex: '(?:^|[/_-])((?:LPD|LPP|LPS|LRELEASE)-\\d+)(?:[/_-]|$)',
    components: ['portal'],
    softCloseMinutes: 7,
  };
  await writeFile(cfgPath, JSON.stringify(legacy, null, 2), 'utf8');

  const cfg = await config.readVaultConfig();
  // Legacy values preserved
  assert.deepEqual(cfg.components, ['portal']);
  assert.equal(cfg.softCloseMinutes, 7);
  // New defaults transparently present
  assert.deepEqual(cfg.review.cycleEndMonths, [5, 9, 12]);
  assert.equal(cfg.review.lastReviewedAt, null);
  assert.equal(cfg.review.lastReviewedCycle, null);
});

test('writeVaultConfig deep-merges review sub-object (Phase-3 ambush prevention)', async () => {
  paths.setVaultPath(vault);
  // First write — only stamps lastReviewedAt/lastReviewedCycle.
  await config.writeVaultConfig({
    review: { lastReviewedAt: '2026-05-15', lastReviewedCycle: '2026-cycle1' },
  });
  let cfg = await config.readVaultConfig();
  // Sibling default cycleEndMonths must survive a partial review patch.
  assert.deepEqual(cfg.review.cycleEndMonths, [5, 9, 12]);
  assert.equal(cfg.review.lastReviewedAt, '2026-05-15');
  assert.equal(cfg.review.lastReviewedCycle, '2026-cycle1');

  // Second write — change cycleEndMonths only; lastReviewedAt must survive.
  await config.writeVaultConfig({ review: { cycleEndMonths: [6, 12] } });
  cfg = await config.readVaultConfig();
  assert.deepEqual(cfg.review.cycleEndMonths, [6, 12]);
  assert.equal(cfg.review.lastReviewedAt, '2026-05-15');
  assert.equal(cfg.review.lastReviewedCycle, '2026-cycle1');
});

test('getVaultDefaults includes review and returns a fresh clone each call', () => {
  const a = config.getVaultDefaults();
  const b = config.getVaultDefaults();
  assert.notEqual(a.review, b.review);
  a.review.cycleEndMonths.push(99);
  assert.deepEqual(b.review.cycleEndMonths, [5, 9, 12]);
});
