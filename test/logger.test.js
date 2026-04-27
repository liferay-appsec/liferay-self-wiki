import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  existsSync,
  unlinkSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, paths, logger;
const dateStr = '2026-04-27';
const dailyPath = () => join(vault, 'Daily', `${dateStr}.md`);

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-logger-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  logger = await import('../src/core/logger.js');
  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  paths.setVaultPath(vault);
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  if (existsSync(dailyPath())) unlinkSync(dailyPath());
});

test('openSessionBlockAtomic writes day header + sentinel for first session', async () => {
  const n = await logger.openSessionBlockAtomic({
    task: 'Fix bug',
    ticketId: 'LPD-1',
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  assert.equal(n, 1);

  const content = readFileSync(dailyPath(), 'utf8');
  assert.match(content, /^# 2026-04-27/m);
  assert.match(content, /## Session 1 — Task: LPD-1 — Fix bug/);
  assert.match(content, /- Started: 09:00/);
  assert.match(content, /<!-- session-1-open -->/);
});

test('openSessionBlockAtomic uses bare ticket label when task equals ticket', async () => {
  await logger.openSessionBlockAtomic({
    task: 'LPD-1',
    ticketId: 'LPD-1',
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  const content = readFileSync(dailyPath(), 'utf8');
  assert.match(content, /Task: LPD-1$/m);
  assert.doesNotMatch(content, /Task: LPD-1 — LPD-1/);
});

test('openSessionBlockAtomic writes task only when ticketId is null', async () => {
  await logger.openSessionBlockAtomic({
    task: 'refactor',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  const content = readFileSync(dailyPath(), 'utf8');
  assert.match(content, /Task: refactor$/m);
});

test('openSessionBlockAtomic increments session number within the same day', async () => {
  await logger.openSessionBlockAtomic({
    task: 't1',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  const n2 = await logger.openSessionBlockAtomic({
    task: 't2',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T10:00:00'),
  });
  assert.equal(n2, 2);

  const content = readFileSync(dailyPath(), 'utf8');
  assert.match(content, /## Session 1/);
  assert.match(content, /## Session 2/);
  // Day header written exactly once.
  const headerMatches = content.match(/^# 2026-04-27/gm) ?? [];
  assert.equal(headerMatches.length, 1);
});

test('closeSessionBlock replaces sentinel with end/duration/completed', async () => {
  await logger.openSessionBlockAtomic({
    task: 't',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  await logger.closeSessionBlock({
    sessionNumber: 1,
    dateStr,
    status: 'completed',
    durationMin: 30,
    endedAt: new Date('2026-04-27T09:30:00'),
  });
  const content = readFileSync(dailyPath(), 'utf8');
  assert.doesNotMatch(content, /<!-- session-1-open -->/);
  assert.match(content, /- Ended: 09:30/);
  assert.match(content, /- Duration: 30 min/);
  assert.match(content, /- Completed: ✅/);
});

test('closeSessionBlock with interrupted writes the warning marker', async () => {
  await logger.openSessionBlockAtomic({
    task: 't',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  await logger.closeSessionBlock({
    sessionNumber: 1,
    dateStr,
    status: 'interrupted',
    durationMin: 5,
    endedAt: new Date('2026-04-27T09:05:00'),
  });
  const content = readFileSync(dailyPath(), 'utf8');
  assert.match(content, /- Interrupted: ⚠️/);
  assert.doesNotMatch(content, /- Completed:/);
});

test('closeSessionBlock omits duration line when durationMin is null', async () => {
  await logger.openSessionBlockAtomic({
    task: 't',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  await logger.closeSessionBlock({
    sessionNumber: 1,
    dateStr,
    status: 'completed',
    durationMin: null,
    endedAt: new Date('2026-04-27T09:30:00'),
  });
  const content = readFileSync(dailyPath(), 'utf8');
  assert.doesNotMatch(content, /- Duration:/);
});

test('closeSessionBlock throws when sentinel missing', async () => {
  // file exists but never had a session-99 sentinel
  await logger.openSessionBlockAtomic({
    task: 't',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  await assert.rejects(
    () =>
      logger.closeSessionBlock({
        sessionNumber: 99,
        dateStr,
        status: 'completed',
        durationMin: 0,
      }),
    /No open session 99/,
  );
});

test('appendNote inserts before the sentinel and preserves order', async () => {
  await logger.openSessionBlockAtomic({
    task: 't',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  await logger.appendNote({
    sessionNumber: 1,
    dateStr,
    message: 'first note',
    at: new Date('2026-04-27T09:10:00'),
  });
  await logger.appendNote({
    sessionNumber: 1,
    dateStr,
    message: 'second note',
    at: new Date('2026-04-27T09:20:00'),
  });
  const content = readFileSync(dailyPath(), 'utf8');

  const sentinelIdx = content.indexOf('<!-- session-1-open -->');
  const note1Idx = content.indexOf('first note');
  const note2Idx = content.indexOf('second note');
  assert.ok(note1Idx > 0 && note2Idx > 0);
  assert.ok(note1Idx < note2Idx, 'notes preserved insertion order');
  assert.ok(note2Idx < sentinelIdx, 'all notes live above sentinel');
  assert.match(content, /- Note \[09:10\]: first note/);
  assert.match(content, /- Note \[09:20\]: second note/);
});

test('appendNote throws when sentinel missing', async () => {
  await assert.rejects(
    () =>
      logger.appendNote({
        sessionNumber: 1,
        dateStr,
        message: 'orphan',
      }),
    /No open session 1/,
  );
});

test('appendSwitch writes a switch line above the sentinel', async () => {
  await logger.openSessionBlockAtomic({
    task: 't',
    ticketId: null,
    dateStr,
    startedAt: new Date('2026-04-27T09:00:00'),
  });
  await logger.appendSwitch({
    sessionNumber: 1,
    dateStr,
    newTask: 'LPD-2 — new task',
  });
  const content = readFileSync(dailyPath(), 'utf8');
  assert.match(content, /- Switched: \d{2}:\d{2} → LPD-2 — new task/);
  // sentinel still present
  assert.match(content, /<!-- session-1-open -->/);
});

test('appendSwitch throws when sentinel missing', async () => {
  await assert.rejects(
    () =>
      logger.appendSwitch({
        sessionNumber: 1,
        dateStr,
        newTask: 'LPD-2',
      }),
    /No open session 1/,
  );
});
