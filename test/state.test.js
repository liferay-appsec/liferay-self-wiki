import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, paths, state;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-state-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  state = await import('../src/core/state.js');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('readSession returns null for unknown id', async () => {
  assert.equal(await state.readSession('does-not-exist'), null);
});

test('writeSession + readSession round-trip', async () => {
  const obj = { status: 'open', sessionNumber: 1, claudeSessionId: 's1' };
  await state.writeSession('s1', obj);
  assert.deepEqual(await state.readSession('s1'), obj);
});

test('clearSession removes the slot file', async () => {
  await state.writeSession('s2', { status: 'open', claudeSessionId: 's2' });
  assert.ok(await state.readSession('s2'));
  await state.clearSession('s2');
  assert.equal(await state.readSession('s2'), null);
});

test('clearSession on a missing session is a no-op', async () => {
  await state.clearSession('definitely-not-there');
});

test('listActiveSessions returns all readable session JSON files', async () => {
  await state.writeSession('a', { status: 'open', claudeSessionId: 'a' });
  await state.writeSession('b', { status: 'soft-closed', claudeSessionId: 'b' });
  const all = await state.listActiveSessions();
  const ids = all.map((s) => s.claudeSessionId).sort();
  assert.ok(ids.includes('a'));
  assert.ok(ids.includes('b'));
});

test('listActiveSessions ignores corrupt files and non-json siblings', async () => {
  await paths.ensureSessionsDir();
  writeFileSync(join(paths.getSessionsDir(), 'bad.json'), '{not-json', 'utf8');
  writeFileSync(join(paths.getSessionsDir(), 'note.txt'), 'ignored', 'utf8');

  const all = await state.listActiveSessions();
  // Sessions written above ('a', 'b') still load.
  assert.ok(all.some((s) => s.claudeSessionId === 'a'));
  // bad.json must not raise; its contents are silently dropped.
  for (const s of all) assert.equal(typeof s, 'object');
});

test('listActiveSessions returns [] when sessions dir does not exist', async () => {
  // wipe the sessions dir; subsequent calls must not throw
  rmSync(paths.getSessionsDir(), { recursive: true, force: true });
  const all = await state.listActiveSessions();
  assert.deepEqual(all, []);
});

test('migrateLegacyState moves legacy state.json into the per-session slot', async () => {
  await paths.ensureDataDir();
  const legacy = { claudeSessionId: 'legacy-id', status: 'open', sessionNumber: 7 };
  writeFileSync(paths.getStateFilePath(), JSON.stringify(legacy), 'utf8');

  await state.migrateLegacyState();

  assert.equal(existsSync(paths.getStateFilePath()), false);
  assert.deepEqual(await state.readSession('legacy-id'), legacy);
});

test('migrateLegacyState removes corrupt legacy files', async () => {
  await paths.ensureDataDir();
  writeFileSync(paths.getStateFilePath(), '{not-json', 'utf8');
  await state.migrateLegacyState();
  assert.equal(existsSync(paths.getStateFilePath()), false);
});

test('migrateLegacyState removes legacy without claudeSessionId', async () => {
  await paths.ensureDataDir();
  writeFileSync(
    paths.getStateFilePath(),
    JSON.stringify({ status: 'open' }),
    'utf8',
  );
  await state.migrateLegacyState();
  assert.equal(existsSync(paths.getStateFilePath()), false);
});

test('migrateLegacyState is a no-op when no legacy file exists', async () => {
  // already removed above; should not throw
  await state.migrateLegacyState();
});
