import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, paths, state, nudge;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-nudge-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  state = await import('../src/core/state.js');
  nudge = await import('../src/commands/nudge.js');
  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  paths.setVaultPath(vault);
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const SESSION_ID = 'nudge-test-id';
const dateStr = '2026-04-27';
const dailyPath = () => join(vault, 'Daily', `${dateStr}.md`);

beforeEach(async () => {
  delete process.env.CLAUDE_SESSION_ID;
  await state.clearSession(SESSION_ID);
  writeFileSync(
    dailyPath(),
    `# ${dateStr}\n\n## Session 1 — Task: main\n- Started: 09:00\n<!-- session-1-open -->\n`,
    'utf8'
  );
});

function captureStdout(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (chunk, ...rest) => {
    captured += chunk;
    return true;
  };
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = orig;
  }).then(() => captured);
}

async function seed(slot) {
  await state.writeSession(SESSION_ID, {
    status: 'open',
    dateStr,
    sessionNumber: 1,
    task: 'main',
    ticketId: null,
    branch: 'main',
    cwd: '/tmp',
    repo: 'r',
    prNumber: null,
    claudeSessionId: SESSION_ID,
    startedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    closedAt: null,
    ...slot,
  });
}

test('nudge prints reminder and stamps nudgedAt when elapsed > threshold and no notes', async () => {
  await seed({});
  const out = await captureStdout(() => nudge.nudgeCommand({ claudeSessionId: SESSION_ID }));
  assert.match(out, /\[self-wiki\]/);
  assert.match(out, /zero notes/);
  const after = await state.readSession(SESSION_ID);
  assert.ok(after.nudgedAt, 'nudgedAt should be set');
});

test('nudge is silent when session has notes', async () => {
  await seed({});
  writeFileSync(
    dailyPath(),
    `# ${dateStr}\n\n## Session 1 — Task: main\n- Started: 09:00\n- Note [09:05]: did a thing\n<!-- session-1-open -->\n`,
    'utf8'
  );
  const out = await captureStdout(() => nudge.nudgeCommand({ claudeSessionId: SESSION_ID }));
  assert.equal(out, '');
  const after = await state.readSession(SESSION_ID);
  assert.equal(after.nudgedAt, undefined);
});

test('nudge is silent when elapsed is below threshold', async () => {
  await seed({ startedAt: new Date(Date.now() - 2 * 60_000).toISOString() });
  const out = await captureStdout(() => nudge.nudgeCommand({ claudeSessionId: SESSION_ID }));
  assert.equal(out, '');
});

test('nudge is silent on a soft-closed session', async () => {
  await seed({ status: 'soft-closed' });
  const out = await captureStdout(() => nudge.nudgeCommand({ claudeSessionId: SESSION_ID }));
  assert.equal(out, '');
});

test('nudge fires only once per session (nudgedAt gates re-fires)', async () => {
  await seed({ nudgedAt: new Date().toISOString() });
  const out = await captureStdout(() => nudge.nudgeCommand({ claudeSessionId: SESSION_ID }));
  assert.equal(out, '');
});

test('nudge with no resolvable session id is a silent no-op', async () => {
  const out = await captureStdout(() => nudge.nudgeCommand({}));
  assert.equal(out, '');
});

test('nudge respects --after-min override', async () => {
  await seed({ startedAt: new Date(Date.now() - 2 * 60_000).toISOString() });
  const out = await captureStdout(() =>
    nudge.nudgeCommand({ claudeSessionId: SESSION_ID, afterMin: '1' })
  );
  assert.match(out, /\[self-wiki\]/);
});
