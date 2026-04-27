import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, sessionsDir, paths, session, state;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-session-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  session = await import('../src/commands/session.js');
  state = await import('../src/core/state.js');
  vault = join(tmp, 'vault');
  sessionsDir = paths.getSessionsDir();
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  rmSync(sessionsDir, { recursive: true, force: true });
  paths.setVaultPath(vault);
});

function todayDailyPath() {
  const d = new Date().toISOString().slice(0, 10);
  return join(vault, 'Daily', `${d}.md`);
}

test('sessionOpen creates state file and daily-log block with sentinel', async () => {
  const opened = await session.sessionOpen({
    claudeSessionId: 'test-1',
    cwd: tmp,
  });
  assert.equal(opened.status, 'open');
  assert.equal(opened.sessionNumber, 1);
  assert.equal(opened.claudeSessionId, 'test-1');

  const persisted = await state.readSession('test-1');
  assert.deepEqual(persisted, opened);

  const content = readFileSync(todayDailyPath(), 'utf8');
  assert.match(content, /<!-- session-1-open -->/);
  assert.match(content, /## Session 1 — Task:/);
});

test('sessionOpen rotates an existing open slot for the same id', async () => {
  await session.sessionOpen({ claudeSessionId: 'rot-1', cwd: tmp });
  const reopened = await session.sessionOpen({ claudeSessionId: 'rot-1', cwd: tmp });
  assert.equal(reopened.sessionNumber, 2);

  const content = readFileSync(todayDailyPath(), 'utf8');
  assert.match(content, /## Session 1 — Task:/);
  assert.match(content, /## Session 2 — Task:/);
  assert.match(content, /- Interrupted: ⚠️/);
  assert.match(content, /<!-- session-2-open -->/);
});

test('sessionOpen reuses a soft-closed slot within the soft-close window', async () => {
  await session.sessionOpen({ claudeSessionId: 'soft-reopen', cwd: tmp });
  await session.sessionClose({ claudeSessionId: 'soft-reopen', soft: true, silent: true });

  const reopened = await session.sessionOpen({ claudeSessionId: 'soft-reopen', cwd: tmp });
  assert.equal(reopened.sessionNumber, 1);
  assert.equal(reopened.status, 'open');

  const content = readFileSync(todayDailyPath(), 'utf8');
  const headers = content.match(/^## Session /gm) ?? [];
  assert.equal(headers.length, 1, 'soft-reopen should not append a new section');
});

test('sessionClose --hard removes sentinel and marks completed', async () => {
  await session.sessionOpen({ claudeSessionId: 'close-1', cwd: tmp });
  const closed = await session.sessionClose({
    claudeSessionId: 'close-1',
    hard: true,
    skipTopics: true,
    silent: true,
  });
  assert.equal(closed.status, 'completed');
  assert.equal(await state.readSession('close-1'), null);

  const content = readFileSync(todayDailyPath(), 'utf8');
  assert.doesNotMatch(content, /<!-- session-1-open -->/);
  assert.match(content, /- Completed: ✅/);
  assert.match(content, /- Ended: \d{2}:\d{2}/);
  assert.match(content, /- Duration: \d+ min/);
});

test('sessionClose with interrupted writes the warning marker', async () => {
  await session.sessionOpen({ claudeSessionId: 'int-1', cwd: tmp });
  const closed = await session.sessionClose({
    claudeSessionId: 'int-1',
    hard: true,
    interrupted: true,
    skipTopics: true,
    silent: true,
  });
  assert.equal(closed.status, 'interrupted');

  const content = readFileSync(todayDailyPath(), 'utf8');
  assert.match(content, /- Interrupted: ⚠️/);
  assert.doesNotMatch(content, /- Completed:/);
});

test('sessionClose --soft preserves the open block but marks state soft-closed', async () => {
  await session.sessionOpen({ claudeSessionId: 'soft-1', cwd: tmp });
  const closed = await session.sessionClose({
    claudeSessionId: 'soft-1',
    soft: true,
    silent: true,
  });
  assert.equal(closed.status, 'soft-closed');

  const persisted = await state.readSession('soft-1');
  assert.equal(persisted.status, 'soft-closed');

  const content = readFileSync(todayDailyPath(), 'utf8');
  assert.match(content, /<!-- session-1-open -->/);
  assert.doesNotMatch(content, /- Ended:/);
});

test('sessionSwitch appends a switch line and updates state', async () => {
  await session.sessionOpen({ claudeSessionId: 'sw-1', cwd: tmp });
  const switched = await session.sessionSwitch({
    claudeSessionId: 'sw-1',
    task: 'new task focus',
    ticket: 'LPD-999',
    silent: true,
  });
  assert.equal(switched.task, 'new task focus');
  assert.equal(switched.ticketId, 'LPD-999');

  const content = readFileSync(todayDailyPath(), 'utf8');
  assert.match(content, /- Switched: \d{2}:\d{2} → LPD-999 — new task focus/);

  const persisted = await state.readSession('sw-1');
  assert.equal(persisted.ticketId, 'LPD-999');
  assert.equal(persisted.task, 'new task focus');
});

test('sessionClose with no active session returns null silently', async () => {
  const result = await session.sessionClose({
    claudeSessionId: 'no-such-session',
    hard: true,
    silent: true,
  });
  assert.equal(result, null);
});

test('sessionSwitch on a soft-closed session reopens it before switching', async () => {
  await session.sessionOpen({ claudeSessionId: 'sw-soft', cwd: tmp });
  await session.sessionClose({ claudeSessionId: 'sw-soft', soft: true, silent: true });

  const switched = await session.sessionSwitch({
    claudeSessionId: 'sw-soft',
    task: 'after soft close',
    ticket: 'LPD-42',
    silent: true,
  });
  assert.equal(switched.status, 'open');
  assert.equal(switched.ticketId, 'LPD-42');
});
