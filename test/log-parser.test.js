import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, paths, logParser;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-parser-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  logParser = await import('../src/utils/log-parser.js');
  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  paths.setVaultPath(vault);
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeDaily(dateStr, body) {
  writeFileSync(join(vault, 'Daily', `${dateStr}.md`), body, 'utf8');
}

test('parseDailyFile returns empty arrays when file missing', async () => {
  const result = await logParser.parseDailyFile('1999-12-31');
  assert.deepEqual(result, { dateStr: '1999-12-31', sessions: [], breaks: [] });
});

test('parseDailyFile parses a completed session with notes and switches', async () => {
  writeDaily('2026-04-27', `# 2026-04-27

## Session 1 — Task: LPD-12345 — Fix something
- Started: 09:00
- Note [09:15]: looked at the bug
- Switched: 09:30 → LPD-12345 — Fix something else
- Note [09:45]: another note
- Ended: 10:00
- Duration: 60 min
- Completed: ✅
`);

  const { sessions } = await logParser.parseDailyFile('2026-04-27');
  assert.equal(sessions.length, 1);

  const s = sessions[0];
  assert.equal(s.sessionNumber, 1);
  assert.equal(s.ticketId, 'LPD-12345');
  assert.equal(s.task, 'Fix something');
  assert.equal(s.startTime, '09:00');
  assert.equal(s.endTime, '10:00');
  assert.equal(s.duration, 60);
  assert.equal(s.status, 'completed');
  assert.deepEqual(s.notes, [
    { time: '09:15', text: 'looked at the bug' },
    { time: '09:45', text: 'another note' },
  ]);
  assert.deepEqual(s.switches, [
    { time: '09:30', newTask: 'LPD-12345 — Fix something else' },
  ]);
});

test('parseDailyFile flags an open session via sentinel', async () => {
  writeDaily('2026-04-26', `## Session 1 — Task: refactor logging
- Started: 10:30
<!-- session-1-open -->
`);
  const { sessions } = await logParser.parseDailyFile('2026-04-26');
  assert.equal(sessions[0].status, 'open');
  assert.equal(sessions[0].endTime, null);
  assert.equal(sessions[0].duration, null);
  assert.equal(sessions[0].ticketId, null);
});

test('parseDailyFile flags interrupted sessions', async () => {
  writeDaily('2026-04-25', `## Session 1 — Task: foo
- Started: 09:00
- Ended: 09:10
- Duration: 10 min
- Interrupted: ⚠️
`);
  const { sessions } = await logParser.parseDailyFile('2026-04-25');
  assert.equal(sessions[0].status, 'interrupted');
});

test('parseDailyFile treats bare ticket header as ticketId == task', async () => {
  writeDaily('2026-04-24', `## Session 1 — Task: LPD-99
- Started: 08:00
<!-- session-1-open -->
`);
  const { sessions } = await logParser.parseDailyFile('2026-04-24');
  assert.equal(sessions[0].ticketId, 'LPD-99');
  assert.equal(sessions[0].task, 'LPD-99');
});

test('parseDailyFile parses multiple sessions in one file', async () => {
  writeDaily('2026-04-23', `## Session 1 — Task: a
- Started: 09:00
- Ended: 09:30
- Duration: 30 min
- Completed: ✅

## Session 2 — Task: b
- Started: 10:00
- Ended: 10:15
- Duration: 15 min
- Completed: ✅
`);
  const { sessions } = await logParser.parseDailyFile('2026-04-23');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].sessionNumber, 1);
  assert.equal(sessions[1].sessionNumber, 2);
});

test('parseDailyFile parses break blocks', async () => {
  writeDaily('2026-04-22', `## Break #1 — coffee
- Started: 11:00
- Ended: 11:15
- Duration: 15 min
`);
  const { breaks } = await logParser.parseDailyFile('2026-04-22');
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].breakNumber, 1);
  assert.equal(breaks[0].label, 'coffee');
  assert.equal(breaks[0].startTime, '11:00');
  assert.equal(breaks[0].endTime, '11:15');
  assert.equal(breaks[0].duration, 15);
});

test('listDailyDates returns only YYYY-MM-DD.md filenames, sorted', async () => {
  writeDaily('2026-04-22', '# stub\n');
  writeFileSync(join(vault, 'Daily', 'README.md'), 'noise', 'utf8');
  writeFileSync(join(vault, 'Daily', 'not-a-date.md'), 'noise', 'utf8');

  const dates = await logParser.listDailyDates();
  assert.ok(dates.includes('2026-04-22'));
  assert.ok(dates.includes('2026-04-27'));
  assert.ok(!dates.includes('README'));
  assert.ok(!dates.includes('not-a-date'));
  assert.deepEqual([...dates].sort(), dates);
});
