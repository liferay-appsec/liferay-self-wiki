import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
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
    paths.getReviewFilePath('2026-cycle1'),
    join(vault, 'Reviews', '2026-cycle1.md'),
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
