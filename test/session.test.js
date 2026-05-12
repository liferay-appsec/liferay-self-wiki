import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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

function writeTranscript(name, entries) {
  const path = join(tmp, name);
  const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(path, body, 'utf8');
  return path;
}

function userMsg(text) {
  return { type: 'user', message: { role: 'user', content: text } };
}

function asstWrap(text, uuid) {
  return {
    type: 'assistant',
    uuid,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

function asstWithNote(text, uuid, command) {
  return {
    type: 'assistant',
    uuid,
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text },
        { type: 'tool_use', name: 'Bash', input: { command } },
      ],
    },
  };
}

async function captureStdout(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (chunk, ...rest) => {
    captured += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  };
  try {
    const result = await fn();
    return { result, captured };
  } finally {
    process.stdout.write = orig;
  }
}

test('sessionClose --soft --block-on-tell emits decision:block JSON when wrap-up has no note', async () => {
  await session.sessionOpen({ claudeSessionId: 'block-1', cwd: tmp });
  const transcript = writeTranscript('t-block-1.jsonl', [
    userMsg('open the PR'),
    asstWrap('PR #2814 opened against liferay-appsec.', 'leaf-1'),
  ]);
  const { captured } = await captureStdout(() =>
    session.sessionClose({
      claudeSessionId: 'block-1',
      soft: true,
      silent: true,
      blockOnTell: true,
      hookPayload: { session_id: 'block-1', transcript_path: transcript },
    }),
  );
  const trimmed = captured.trim();
  const parsed = JSON.parse(trimmed);
  assert.equal(parsed.decision, 'block');
  assert.match(parsed.reason, /self-wiki note/);

  const persisted = await state.readSession('block-1');
  assert.equal(persisted.lastBlockedTurnId, 'leaf-1');
  assert.equal(persisted.pendingNudge?.kind, 'closing-summary');
});

test('sessionClose --soft --block-on-tell does not re-block the same turn', async () => {
  await session.sessionOpen({ claudeSessionId: 'block-2', cwd: tmp });
  const transcript = writeTranscript('t-block-2.jsonl', [
    userMsg('open the PR'),
    asstWrap('PR #2814 opened.', 'leaf-2'),
  ]);
  // First close emits block
  await captureStdout(() =>
    session.sessionClose({
      claudeSessionId: 'block-2',
      soft: true,
      silent: true,
      blockOnTell: true,
      hookPayload: { session_id: 'block-2', transcript_path: transcript },
    }),
  );
  // Reopen via switch (soft-closed → open)
  await session.sessionSwitch({ claudeSessionId: 'block-2', task: 'still working', silent: true });
  // Second close on the same leafUuid must not re-emit block
  const { captured } = await captureStdout(() =>
    session.sessionClose({
      claudeSessionId: 'block-2',
      soft: true,
      silent: true,
      blockOnTell: true,
      hookPayload: { session_id: 'block-2', transcript_path: transcript },
    }),
  );
  assert.equal(captured.trim(), '', 'second close on same leafUuid must emit no JSON');
});

test('sessionClose --soft --block-on-tell does not block when self-wiki note ran in turn', async () => {
  await session.sessionOpen({ claudeSessionId: 'block-3', cwd: tmp });
  const transcript = writeTranscript('t-block-3.jsonl', [
    userMsg('open the PR'),
    asstWithNote('PR #99 opened.', 'leaf-3', 'self-wiki note "PR #99 opened"'),
  ]);
  const { captured } = await captureStdout(() =>
    session.sessionClose({
      claudeSessionId: 'block-3',
      soft: true,
      silent: true,
      blockOnTell: true,
      hookPayload: { session_id: 'block-3', transcript_path: transcript },
    }),
  );
  assert.equal(captured.trim(), '');
  const persisted = await state.readSession('block-3');
  assert.equal(persisted.lastBlockedTurnId ?? null, null);
  assert.equal(persisted.pendingNudge ?? null, null);
});

test('sessionClose --soft without --block-on-tell still queues pendingNudge but emits no JSON', async () => {
  await session.sessionOpen({ claudeSessionId: 'block-4', cwd: tmp });
  const transcript = writeTranscript('t-block-4.jsonl', [
    userMsg('open the PR'),
    asstWrap('PR #1 opened.', 'leaf-4'),
  ]);
  const { captured } = await captureStdout(() =>
    session.sessionClose({
      claudeSessionId: 'block-4',
      soft: true,
      silent: true,
      hookPayload: { session_id: 'block-4', transcript_path: transcript },
    }),
  );
  assert.equal(captured.trim(), '', 'without --block-on-tell, no JSON to stdout');
  const persisted = await state.readSession('block-4');
  assert.equal(persisted.pendingNudge?.kind, 'closing-summary', 'fallback queue still set');
  assert.equal(persisted.lastBlockedTurnId ?? null, null);
});

