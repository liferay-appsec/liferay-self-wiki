# Testing Patterns

**Analysis Date:** 2026-05-07

## Test Framework

**Runner:** Node's built-in test runner (`node --test`). No Jest, no Vitest, no Mocha — the project has zero test dependencies.

```json
// package.json
"scripts": {
  "test": "node --test test/*.test.js"
}
```

**Imports used in every test file:**

```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
```

Note the `node:` prefix is used for test imports (and only for test imports — production code uses bare specifiers like `'fs/promises'`).

**No coverage tool** is wired in. There is no `c8`, no `nyc`, no coverage script. If you want a coverage signal, run `node --test --experimental-test-coverage test/*.test.js` ad hoc.

**Run commands:**

```bash
npm test                                       # run the full suite
node --test test/logger.test.js                # run a single file
node --test --test-name-pattern="closes" \     # filter by test name
  test/logger.test.js
```

## Suite Maturity

`CLAUDE.md` says "There is no test suite yet (v0.1)". That statement is **stale relative to current state.** As of 2026-05-07 there are **10 test files totaling ~2,250 lines** under `test/`:

| File | Lines | Covers |
|------|-------|--------|
| `test/format.test.js` | 78 | `src/utils/format.js` — pure date/time helpers |
| `test/paths.test.js` | 112 | `src/utils/paths.js` — XDG paths, vault helpers |
| `test/state.test.js` | 102 | `src/core/state.js` — slot read/write/list/migrate |
| `test/config.test.js` | 88 | `src/core/config.js` — user/vault config layering |
| `test/logger.test.js` | 437 | `src/core/logger.js` — daily-file mutations, sentinel handling |
| `test/log-parser.test.js` | 144 | `src/utils/log-parser.js` — daily-file parsing |
| `test/topics.test.js` | 332 | `src/core/topics.js` — topic-page assembly |
| `test/session.test.js` | 314 | `src/commands/session.js` — open/close/switch end-to-end |
| `test/nudge.test.js` | 154 | `src/commands/nudge.js` — first-prompt reminder |
| `test/stop-detector.test.js` | 178 | `src/core/stop-detector.js` — closing-summary tell detector |

The README still recommends manual smoke verification via `npm link` plus a sequence of CLI commands (`self-wiki init /tmp/test-vault --yes`, `session open`, `note`, `session close --hard`, `report --week --dry-run`). That manual checklist remains the source of truth for user-facing flows the automated suite doesn't yet cover (CLI argument parsing, hooks merge in `init`, end-to-end report synthesis).

## Test File Organization

**Location:** Flat under `test/`. No subdirectories, no co-location with source.

**Naming:** `<source-basename>.test.js` — `src/utils/format.js` ↔ `test/format.test.js`, `src/core/logger.js` ↔ `test/logger.test.js`, `src/commands/session.js` ↔ `test/session.test.js`.

**Structure:**

```
test/
  config.test.js
  format.test.js
  log-parser.test.js
  logger.test.js
  nudge.test.js
  paths.test.js
  session.test.js
  state.test.js
  stop-detector.test.js
  topics.test.js
```

## Test Structure

**Top-level `test('description', fn)`** — no nested `describe`. Test names are full English sentences describing the behavior.

```js
// test/logger.test.js
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
```

Test names follow a consistent shape: `<function> <observable behavior>` or `<function> <edge-case>`. Examples from the suite: `closeSessionBlock is idempotent — second close on a closed session is a no-op`; `closeOrphanedSentinels falls back to Started time when no activity recorded`; `migrateLegacyState removes corrupt legacy files`.

## Filesystem Isolation Pattern

This is the dominant fixture pattern. **Every test file that touches the filesystem follows the same five-step setup**:

```js
// test/logger.test.js (representative — every fs-touching test does this)
let tmp, vault, paths, logger;
const dateStr = '2026-04-27';
const dailyPath = () => join(vault, 'Daily', `${dateStr}.md`);

before(async () => {
  // 1. Create a unique temp dir
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-logger-'));
  // 2. Point XDG vars at it BEFORE importing modules that close over them
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  // 3. Dynamic import — paths.js captures XDG vars at module-init time
  paths = await import('../src/utils/paths.js');
  logger = await import('../src/core/logger.js');
  // 4. Build the vault subtree
  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  // 5. Activate the vault path so vault-relative helpers work
  paths.setVaultPath(vault);
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  if (existsSync(dailyPath())) unlinkSync(dailyPath());
});
```

Five things to know about this pattern:

1. **`mkdtempSync(join(tmpdir(), 'self-wiki-<file>-'))`** gives a per-suite unique prefix so parallel runs and crash residue don't collide.
2. **Set `XDG_DATA_HOME` / `XDG_CONFIG_HOME` (and `XDG_STATE_HOME` for `error-log` tests if needed) before the `import('../src/...')`** — `src/utils/paths.js` reads them at module load. Importing too early caches the wrong paths.
3. **Use dynamic `import()` inside `before()`**, not top-level static imports. Top-level static imports load before `before()` runs, missing the env override.
4. **`beforeEach` resets just the moving piece** (the daily file, the vault tree, or the sessions dir) — it doesn't tear down the temp root. Cheaper and lets tests within a suite share heavy setup.
5. **`after()` `rmSync(tmp, { recursive: true, force: true })`** — always force, never assume cleanup succeeded. There is no try/catch around it; the test runner already isolates failures.

`test/session.test.js` and `test/topics.test.js` extend this with a per-test full vault rebuild:

```js
beforeEach(() => {
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  rmSync(sessionsDir, { recursive: true, force: true });
  paths.setVaultPath(vault);
});
```

When you add a test for a new mutator, follow the existing file's pattern — don't invent a new isolation scheme.

## Assertion Style

Always `node:assert/strict`. The four assertions in heavy use are:

- `assert.equal(actual, expected)` — primitive equality.
- `assert.deepEqual(actual, expected)` — structural equality for arrays/objects.
- `assert.match(string, regex)` / `assert.doesNotMatch(string, regex)` — markdown content checks.
- `assert.rejects(asyncFn, /pattern/)` — async error checks.
- `assert.throws(fn, /pattern/)` — sync error checks.
- `assert.ok(value, 'description')` — truthiness with a custom failure message.

```js
// test/logger.test.js — exception assertion
await assert.rejects(
  () =>
    logger.appendNote({
      sessionNumber: 1,
      dateStr,
      message: 'orphan',
    }),
  /No open session 1/,
);
```

```js
// test/state.test.js — deep equality round-trip
test('writeSession + readSession round-trip', async () => {
  const obj = { status: 'open', sessionNumber: 1, claudeSessionId: 's1' };
  await state.writeSession('s1', obj);
  assert.deepEqual(await state.readSession('s1'), obj);
});
```

Markdown-shape tests assert with regexes against the file content rather than parsing it — this catches both the data and the rendering. See `test/logger.test.js:48–51` for the canonical example.

## Mocking

**Framework:** None. The codebase does not import `node:test`'s `mock` API and does not use `sinon`, `jest.mock`, or `td`.

**Strategy: real filesystem + fixture transcripts.** Tests achieve isolation by writing real files to a temp dir rather than mocking `fs`. This lines up with the "daily logs are the source of truth" architecture rule — the structure of the markdown is part of the contract being tested.

**Stdout capture pattern.** When a test needs to assert on stdout, it monkey-patches `process.stdout.write` for the duration of the call:

```js
// test/session.test.js
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
```

`test/nudge.test.js` carries a near-identical helper. When you need this in a new test file, copy it in — it's small and intentionally not extracted to a shared helper module.

**Transcript fixture pattern.** Tests for the closing-summary detector and `--block-on-tell` flow construct minimal JSONL transcripts inline:

```js
// test/session.test.js
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
```

Then a test passes the path through the actual hook payload:

```js
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
```

This is how integration-shaped tests stay hermetic: pass `hookPayload` directly so `readHookInput()` is never called.

**What is NOT mocked:** `fs`, `proper-lockfile` (real locks against real temp files), `Date.now()`/`new Date()` (tests inject explicit `Date` objects rather than freezing the clock), `git`/`gh`/`claude` (these are simply never invoked in tests because `detectTask` and `claudeHeadless` are not exercised).

**What you cannot easily test today:** `src/core/detect.js` (real `git`/`gh` subprocesses), `src/core/claude.js` (real `claude` subprocess), `src/commands/init.js` (interactive `readline` prompts and `~/.claude/settings.json` writes), `src/commands/report.js` (synthesis path). When adding tests in those areas, prefer extracting a pure helper and testing the helper rather than introducing a mocking framework.

## Fixtures and Factories

**Inline factories.** Tests build markdown fixtures with template literals inline rather than loading files from disk:

```js
// test/log-parser.test.js
function writeDaily(dateStr, body) {
  writeFileSync(join(vault, 'Daily', `${dateStr}.md`), body, 'utf8');
}

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
```

**No `__fixtures__` directory.** Fixtures live in the test file with the assertions that consume them — easier to read, easier to keep in sync, no cross-file drift.

**Date constants.** Most fixtures pin to a known weekday like `2026-04-27` (a Monday in ISO week 18) so week-related tests can assert exact `2026-W18` values. When in doubt, use that date or another in the same week.

## Test Types

**Unit Tests:** Dominant. Each file targets one source module, exercising one function per `test()` block (`format`, `paths`, `state`, `config`, `log-parser`, `closing-tells`).

**Integration Tests:** `test/logger.test.js`, `test/session.test.js`, `test/topics.test.js`, `test/nudge.test.js` exercise multi-function flows against the real filesystem — open → write notes → close, and assert on the final markdown shape. These look like unit tests structurally but cross module boundaries.

**End-to-End / CLI Tests:** None. The Commander entry (`src/cli.js`) and the `init` interactive flow are not exercised. The README's manual smoke checklist (`npm link` → `self-wiki init` → `session open` → `note` → `session close --hard` → `report --week --dry-run`) substitutes for this.

**E2E Framework:** Not used.

## Common Patterns

**Async testing:** All `test()` callbacks are `async` when the assertion involves `await`. Plain (non-async) test bodies appear only for synchronous helpers like `formatDuration`.

```js
test('formatDuration drops minutes when on the hour', () => {
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(180), '3h');
});
```

**Error testing:** Use `assert.rejects` for async, `assert.throws` for sync. Always pass a regex or predicate as the second arg — never assert that *some* error was thrown without checking which.

```js
// test/format.test.js
test('datesInWeek throws on bad format', () => {
  assert.throws(() => datesInWeek('2026-18'), /Invalid ISO week/);
  assert.throws(() => datesInWeek('not-a-week'), /Invalid ISO week/);
});

// test/logger.test.js
await assert.rejects(
  () =>
    logger.closeSessionBlock({
      sessionNumber: 99,
      dateStr,
      status: 'completed',
      durationMin: 0,
    }),
  /No session 99/,
);
```

**Idempotence testing:** Several tests assert that a function called twice produces the same output as called once. This is a load-bearing property of the logger and is explicitly tested:

```js
// test/logger.test.js
test('closeSessionBlock is idempotent — second close on a closed session is a no-op', async () => {
  // open, close, snapshot
  // close again with different args
  // assert content unchanged
  assert.equal(firstContent, secondContent);
});
```

**Self-healing testing:** When a function tolerates malformed input (e.g. duplicate sentinels from a prior bug), inject the malformed state into the file, run the function, and assert it produced the correct output:

```js
// test/logger.test.js — closeSessionBlock self-heals duplicate sentinels
const dup = raw.replace(
  '<!-- session-1-open -->',
  '<!-- session-1-open -->\n<!-- session-1-open -->',
);
writeFileSync(path, dup, 'utf8');
await logger.closeSessionBlock({ ... });
assert.doesNotMatch(content, /<!-- session-1-open -->/);
```

**Environment cleanup in `beforeEach`.** When tests rely on env vars or globals, always reset them per test:

```js
// test/nudge.test.js
beforeEach(async () => {
  delete process.env.CLAUDE_SESSION_ID;
  await state.clearSession(SESSION_ID);
  // ...rebuild fixture
});
```

## Coverage Gaps

When adding a new feature, write a test for it. Areas with real coverage:

- Date/time math — solid.
- Path resolution — solid.
- Slot I/O and migration — solid.
- Daily-file mutation (open/close/note/switch/markActivity/closeOrphanedSentinels) — solid.
- Daily-file parsing — solid.
- Topic-page rebuild and incremental fold — solid.
- Session lifecycle (open/close/switch including `--block-on-tell`) — solid.
- `nudge` command — solid.
- Closing-tell detection — solid.

Areas without automated tests (rely on the README manual checklist):

- `src/cli.js` — Commander wiring, top-level error handler, `SELF_WIKI_HEADLESS` short-circuit.
- `src/commands/init.js` — vault scaffolding, hooks merge, permissions merge, interactive `confirm()`.
- `src/commands/config.js` — `config show / vault / jira / component` subcommands.
- `src/commands/report.js` — week/dailies aggregation, prompt building, `claude -p` invocation.
- `src/commands/rebuild.js` — `rebuild-topics --topic / --all-tickets / --all-components`.
- `src/core/detect.js` — `git`/`gh`/JIRA fallback chain.
- `src/core/claude.js` — headless invocation.

When you add coverage in any of these areas, follow the existing pattern: temp dir + XDG override + dynamic import + real filesystem.

---

*Testing analysis: 2026-05-07*
