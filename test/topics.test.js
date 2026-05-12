import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, paths, topics, config;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-topics-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  topics = await import('../src/core/topics.js');
  config = await import('../src/core/config.js');
  vault = join(tmp, 'vault');
  paths.setVaultPath(vault);
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  mkdirSync(join(vault, 'Tickets'), { recursive: true });
  mkdirSync(join(vault, 'Components'), { recursive: true });
});

function writeDaily(dateStr, body) {
  writeFileSync(join(vault, 'Daily', `${dateStr}.md`), body, 'utf8');
}

test('updateTopicsForSession creates a ticket page from notes', async () => {
  writeDaily(
    '2026-04-27',
    `# 2026-04-27

## Session 1 — Task: LPD-100 — Investigate bug
- Started: 09:00
- Note [09:15]: found root cause in FooService
- Note [09:30]: applied fix
- Ended: 10:00
- Duration: 60 min
- Completed: ✅
`,
  );

  await topics.updateTopicsForSession({
    dateStr: '2026-04-27',
    sessionNumber: 1,
  });

  const ticketPath = join(vault, 'Tickets', 'LPD-100.md');
  assert.ok(existsSync(ticketPath));
  const content = readFileSync(ticketPath, 'utf8');
  assert.match(content, /^# LPD-100/m);
  assert.match(content, /Auto-maintained by self-wiki/);
  assert.match(content, /## 2026-04-27 — Session 1/);
  assert.match(content, /found root cause in FooService/);
  assert.match(content, /applied fix/);
});

test('updateTopicsForSession merges an existing dated section in place', async () => {
  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: LPD-200 — t
- Started: 09:00
- Note [09:15]: first run
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );
  await topics.updateTopicsForSession({
    dateStr: '2026-04-27',
    sessionNumber: 1,
  });

  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: LPD-200 — t
- Started: 09:00
- Note [09:15]: first run
- Note [09:45]: more findings
- Ended: 10:00
- Duration: 60 min
- Completed: ✅
`,
  );
  await topics.updateTopicsForSession({
    dateStr: '2026-04-27',
    sessionNumber: 1,
  });

  const content = readFileSync(join(vault, 'Tickets', 'LPD-200.md'), 'utf8');
  assert.match(content, /more findings/);
  const matches = content.match(/## 2026-04-27 — Session 1/g) ?? [];
  assert.equal(matches.length, 1);
});

test('updateTopicsForSession picks up tickets mentioned only in notes', async () => {
  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: random work
- Started: 09:00
- Note [09:15]: while there I also touched LPD-300
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );
  await topics.updateTopicsForSession({
    dateStr: '2026-04-27',
    sessionNumber: 1,
  });
  assert.ok(existsSync(join(vault, 'Tickets', 'LPD-300.md')));
});

test('updateTopicsForSession does nothing for an untagged note-less session', async () => {
  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: untagged work
- Started: 09:00
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );
  await topics.updateTopicsForSession({
    dateStr: '2026-04-27',
    sessionNumber: 1,
  });
  assert.deepEqual(readdirSync(join(vault, 'Tickets')), []);
  assert.deepEqual(readdirSync(join(vault, 'Components')), []);
});

test('updateTopicsForSession routes to component pages by configured keyword', async () => {
  await config.writeVaultConfig({
    components: [{ slug: 'fooservice', keywords: ['FooService'] }],
  });
  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: bare task
- Started: 09:00
- Note [09:15]: changed FooService.handleX
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );
  await topics.updateTopicsForSession({
    dateStr: '2026-04-27',
    sessionNumber: 1,
  });

  const compPath = join(vault, 'Components', 'fooservice.md');
  assert.ok(existsSync(compPath));
  const content = readFileSync(compPath, 'utf8');
  assert.match(content, /^# fooservice/m);
  assert.match(content, /changed FooService\.handleX/);
});

test('rebuildTicketPage scans every daily file and orders sections oldest-first', async () => {
  writeDaily(
    '2026-04-25',
    `## Session 1 — Task: LPD-400 — old work
- Started: 09:00
- Note [09:15]: day1 note
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );
  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: LPD-400 — more
- Started: 09:00
- Note [09:15]: day2 note
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );

  const result = await topics.rebuildTicketPage('LPD-400');
  assert.equal(result.sectionCount, 2);

  const content = readFileSync(result.filePath, 'utf8');
  assert.match(content, /day1 note/);
  assert.match(content, /day2 note/);
  assert.ok(
    content.indexOf('day1 note') < content.indexOf('day2 note'),
    'oldest section comes first',
  );
});

test('rebuildTicketPage is idempotent — re-running yields identical content', async () => {
  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: LPD-500 — x
- Started: 09:00
- Note [09:15]: only note
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );
  const r1 = await topics.rebuildTicketPage('LPD-500');
  const c1 = readFileSync(r1.filePath, 'utf8');
  const r2 = await topics.rebuildTicketPage('LPD-500');
  const c2 = readFileSync(r2.filePath, 'utf8');
  assert.equal(c1, c2);
});

test('rebuildComponentPage uses configured keywords across all dates', async () => {
  await config.writeVaultConfig({
    components: [{ slug: 'auth', keywords: ['LoginAction', 'AuthVerifier'] }],
  });
  writeDaily(
    '2026-04-25',
    `## Session 1 — Task: misc
- Started: 09:00
- Note [09:15]: tweaked LoginAction logic
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );
  writeDaily(
    '2026-04-27',
    `## Session 1 — Task: misc
- Started: 09:00
- Note [09:15]: AuthVerifier behavior change
- Ended: 09:30
- Duration: 30 min
- Completed: ✅
`,
  );

  const result = await topics.rebuildComponentPage('auth');
  assert.equal(result.sectionCount, 2);
  const content = readFileSync(result.filePath, 'utf8');
  assert.match(content, /tweaked LoginAction logic/);
  assert.match(content, /AuthVerifier behavior change/);
});

test('rebuildComponentPage rejects an unknown slug', async () => {
  await config.writeVaultConfig({ components: [] });
  await assert.rejects(
    () => topics.rebuildComponentPage('nonexistent'),
    /component "nonexistent" not found/,
  );
});

test('reaped sessions can be folded into ticket pages by re-using updateTopicsForSession', async () => {
  // Simulate a session that was orphaned (still has sentinel) then reaped by close-orphans:
  // close-orphans replaces the sentinel with closing meta; we then call updateTopicsForSession
  // with just {dateStr, sessionNumber} — no slot/state object — and expect the ticket page to land.
  const logger = await import('../src/core/logger.js');
  const dateStr = '2026-04-28';
  await logger.openSessionBlockAtomic({
    task: 'GPC plumbing',
    ticketId: 'LPD-86317',
    dateStr,
    startedAt: new Date(`${dateStr}T11:49:00`),
  });
  const noteFile = join(vault, 'Daily', `${dateStr}.md`);
  let raw = readFileSync(noteFile, 'utf8');
  raw = raw.replace(
    '<!-- session-1-open -->',
    [
      '- Note [13:51]: LPD-86317 implemented: suppressThirdPartyCookies JS function, integration test, playwright test.',
      '- Note [15:54]: LPD-86317 PR #2800 opened (draft) against liferay-appsec.',
      '<!-- session-1-open -->',
    ].join('\n'),
  );
  writeFileSync(noteFile, raw, 'utf8');

  const closed = await logger.closeOrphanedSentinels({ dateStr });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].sessionNumber, 1);

  await topics.updateTopicsForSession({ dateStr, sessionNumber: 1 });
  const ticketPath = paths.getTicketFilePath('LPD-86317');
  assert.ok(existsSync(ticketPath), 'ticket page created');
  const ticketContent = readFileSync(ticketPath, 'utf8');
  assert.match(ticketContent, /## 2026-04-28 — Session 1/);
  assert.match(ticketContent, /PR #2800 opened/);
});
