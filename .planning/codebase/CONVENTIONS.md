# Coding Conventions

**Analysis Date:** 2026-05-07

## Module System

- **ESM only.** `package.json` declares `"type": "module"`. Every `import` uses an explicit `.js` extension on relative specifiers (`from '../core/state.js'`, never `'../core/state'`).
- **No CommonJS.** No `require`, no `module.exports` anywhere in `src/`.
- **Node 20+** (`"engines": { "node": ">=20.0.0" }` in `package.json`). Code freely uses `node:fs/promises`, top-level `fetch`, and `node:test`.
- Node built-ins are imported by **bare specifier** (`from 'fs/promises'`, `from 'path'`, `from 'os'`, `from 'child_process'`), not `node:` prefix — except in tests, where `node:test` and `node:assert/strict` are used. Stay consistent with each surrounding file.

## Naming Patterns

**Files:**
- All source files are `lower-kebab-case.js`: `src/commands/close-orphans.js`, `src/core/error-log.js`, `src/core/closing-tells.js`, `src/utils/log-parser.js`, `src/utils/hook-input.js`.
- Test files mirror the source name with a `.test.js` suffix and live flat under `test/` — `src/core/logger.js` ↔ `test/logger.test.js`, `src/utils/format.js` ↔ `test/format.test.js`.

**Functions:**
- `camelCase` for everything: `openSessionBlockAtomic`, `closeOrphanedSentinels`, `applyUserConfig`, `ensureVaultConfigured`, `tryGetVaultPath`, `formatHHMM`.
- Common verb prefixes carry semantic load:
  - `read*` / `write*` for config + state I/O round-trips (`readUserConfig` / `writeUserConfig` in `src/core/config.js`).
  - `try*` for soft-dependency probes that return `null` on failure (`tryGitBranch`, `tryGhPrView`, `tryJiraTitle` in `src/core/detect.js`; `tryGetVaultPath` in `src/utils/paths.js`).
  - `ensure*` for idempotent setup (`ensureVaultDirs`, `ensureParentDir`, `ensureSessionsDir`, `ensureVaultConfigured`).
  - `has*` for boolean probes (`hasGh`, `hasClaudeCli`).
  - `get*` for pure path/value getters (`getDailyFilePath`, `getVaultPath`).
- Each user-facing subcommand exports a single async function named `<verb>Command` (e.g. `noteCommand`, `statusCommand`, `reportCommand`, `closeOrphansCommand`). The exception is `session.js`, which exports three peer functions (`sessionOpen`, `sessionClose`, `sessionSwitch`) because the `session` Commander group has three subcommands.

**Variables:**
- `camelCase` locals (`claudeSessionId`, `vaultCfg`, `dateStr`, `sessionNumber`).
- Constants are `SCREAMING_SNAKE_CASE` only when they are real module-level invariants: `REAPER_AGE_MS`, `LOCK_OPTS`, `USER_DEFAULTS`, `VAULT_DEFAULTS`, `SKILL_DEST`, `TEMPLATES`, `PROMPT_PATH`, `CLOSING_TELL_PATTERNS`, `ACTIVITY_LINE_RE`, `PHRASES`, `BULLET_LIST`. Module-private, often imported at top-of-file.
- Regex constants are inline anonymous most of the time (`new RegExp(cfg.ticketRegex, 'g')` inside the function), but hoisted to module scope when reused (`ACTIVITY_LINE_RE` at top of `src/core/logger.js`).

**Date/time identifiers:**
- `dateStr` always means an ISO `YYYY-MM-DD` day string.
- `weekStr` always means an ISO `YYYY-Www` week string.
- `claudeSessionId` (camelCase) is the Claude Code session UUID, used as the slot key in `~/.local/share/self-wiki/sessions/<id>.json`.
- `sessionNumber` is the integer index of a session within a day's file (1-based).

## Function Declaration Style

- **Always `function`, never arrow at top level.** Every exported function uses `export function name()` or `export async function name()`. Search of `src/`: arrow functions appear only as inline callbacks (`map`, `filter`, `replace(re, () => …)`, event listeners, `Promise` executors).

  ```js
  // src/core/state.js
  export async function readSession(claudeSessionId) {
    try {
      const raw = await readFile(getSessionFilePath(claudeSessionId), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  ```

- **Default parameters carry the contract.** Every command takes `opts = {}` so it works with no arguments: `export async function noteCommand(text, opts = {}) { ... }`. Pure utilities default to `new Date()` for a `date` arg: `export function formatHHMM(date = new Date()) { ... }`.
- **Helpers are private and below the export.** Files put the exported API at the top, then helpers (`function findBlock`, `function isAlreadyClosed`, `function composeClosedBlock`) at the bottom. No barrel files; no re-exports.

## Code Style

**Formatting:**
- No `.prettierrc`, `.eslintrc`, `eslint.config.*`, `biome.json`, or `.editorconfig` in the repo root. The only dotfiles are `.gitignore`, `.git/`, `.claude/`, `.planning/`. Style is enforced by hand and by code review.
- Observed conventions across `src/`: 2-space indent, single quotes for strings, semicolons terminating every statement, trailing commas on multi-line object/array literals, max line length around 100 chars but commonly exceeded for log strings (see `src/commands/nudge.js:53–64`).
- Template literals are the default for any string with interpolation. String concatenation with `+` shows up only when joining multi-segment user-facing prose:

  ```js
  // src/commands/nudge.js
  process.stdout.write(
    `[self-wiki] Active session ${slot.sessionNumber} — ${label}. ` +
    `Drop a \`self-wiki note "<text>"\` liberally — ` +
    ...
  );
  ```

**Linting:** None configured. There is no `lint` script in `package.json`.

## Import Organization

The de-facto order in every command file is:

1. Node built-ins, bare specifier — `'fs/promises'`, `'path'`, `'os'`, `'url'`, `'child_process'`, `'util'`, `'process'`, `'readline/promises'`.
2. Third-party packages — `'commander'`, `'chalk'`, `'proper-lockfile'`.
3. Project modules in dependency order: `core/` first (state, config, logger, detect), then `utils/` (paths, format, log-parser, hook-input).

Example header from `src/commands/session.js`:

```js
import {
  readSession,
  writeSession,
  clearSession,
  listActiveSessions,
  migrateLegacyState,
} from '../core/state.js';
import { readVaultConfig, ensureVaultConfigured, applyUserConfig } from '../core/config.js';
import { detectTask } from '../core/detect.js';
import { ... } from '../core/logger.js';
import { todayISO, formatHHMM, diffMinutes } from '../utils/format.js';
import { ensureVaultDirs } from '../utils/paths.js';
import { readHookInput, readHookSessionId } from '../utils/hook-input.js';
import { logCloseError } from '../core/error-log.js';
import { inspectTranscript } from '../core/stop-detector.js';
import { appendFile } from 'node:fs/promises';
```

- **No path aliases.** All imports are relative (`../core/...`, `../utils/...`).
- **Multi-import objects are sometimes formatted across multiple lines** when there are 3+ named imports from the same module. Single imports stay on one line.
- **Dynamic `import()` is used only to break a circular dependency** between session/topics: `const { updateTopicsForSession } = await import('../core/topics.js');` (see `src/commands/session.js:203`, `:333`). Treat lazy imports as a smell unless they break a cycle or skip optional work.

## Command Lifecycle Pattern

**Every user-facing subcommand begins with the same prelude** (this is enforced by `CLAUDE.md`):

```js
// src/commands/note.js
export async function noteCommand(text, opts = {}) {
  await applyUserConfig();          // load ~/.config/self-wiki/config.json, set vault path
  ensureVaultConfigured();          // exit(2) with a help message if no vault
  await migrateLegacyState();       // one-shot upgrade from pre-v0.1.1 state.json layout
  // ...command body
}
```

- `applyUserConfig` is **always awaited and runs first.** It reads the user config and calls `setVaultPath` so vault-relative path helpers work.
- `ensureVaultConfigured` is **omitted only for commands that must work pre-init**: `init` itself (it's the bootstrap) and `config vault` (set the path before it exists). `nudge` calls it inside a try/catch and silently returns if the vault is not yet configured — this is intentional because `nudge` runs as a hook on every prompt and must never fail loudly.
- `migrateLegacyState` is called only by commands that touch session state (`note`, `nudge`, `close-orphans`, `session.*`, `status`).

## Error Handling

The codebase has **three sharply distinct error postures**, picked deliberately per call site:

### 1. Soft dependencies fail silently (`try { … } catch {}` with no binding)

Used wherever a missing external tool, missing file, or parse failure should degrade rather than fail. The catch binding is omitted so linters don't flag an unused variable.

```js
// src/core/detect.js
async function tryGitBranch(cwd) {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    const branch = stdout.trim();
    return branch === 'HEAD' ? null : branch;
  } catch {
    return null;
  }
}
```

```js
// src/core/state.js — read-or-null
export async function readSession(claudeSessionId) {
  try {
    const raw = await readFile(getSessionFilePath(claudeSessionId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

This is the dominant pattern. Apply it to: `gh` probes, JIRA REST calls, optional config reads, optional file reads, transcript inspection, anything tagged "soft dependency" by `CLAUDE.md`.

### 2. Best-effort warnings (`catch (err)` → `process.stderr.write('warn: …')`)

When a step is non-fatal but the user should hear about it. The error is logged to stderr and execution continues.

```js
// src/commands/session.js
try {
  const { updateTopicsForSession } = await import('../core/topics.js');
  await updateTopicsForSession(state);
} catch (err) {
  process.stderr.write(`warn: topic update failed: ${err.message}\n`);
}
```

Always `warn:` lowercase prefix. Always include `${err.message}`. Never throw upward.

### 3. Fatal errors (`process.stderr.write('error: …')` + `process.exit(N)`)

Reserved for genuinely unrecoverable preconditions. Exit codes carry meaning:

- `process.exit(1)` — operational failure (e.g. no daily logs found for the requested week, `src/commands/report.js:44`; no active session in `note`, `src/commands/note.js:13`).
- `process.exit(2)` — configuration failure (no vault configured, `src/core/config.js:71`; missing required CLI flag, `src/commands/rebuild.js:28`; missing `claude` CLI on PATH, `src/commands/report.js:58`; missing session id, `src/commands/session.js:37`).

Always lowercase `error:` prefix. The top-level handler in `src/cli.js:127` catches anything bubbling out of Commander and prints `error: ${err.message}` then exits 1.

### 4. Persistent error logging (`logCloseError`)

For session-close failures specifically — where the operation must continue silently (it's a hook, not a user command) but the failure must be diagnosable. `src/core/error-log.js` writes one JSON line per failure to `~/.local/state/self-wiki/close-errors.log`. The wrapper itself is wrapped in try/catch so error-logging never masks the original failure:

```js
// src/core/error-log.js
export async function logCloseError(record) {
  try {
    await mkdir(dirname(errorLogPath), { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n';
    await appendFile(errorLogPath, line, 'utf8');
  } catch {
    // never let error-logging mask the original failure
  }
}
```

## Console Output

- **Always `process.stdout.write` / `process.stderr.write`. Never `console.log`/`console.error`** anywhere in `src/`. Grep confirms zero `console.*` calls in source.
- Always end with explicit `'\n'` because `process.stdout.write` does not auto-newline.
- **stderr** carries `error: …`, `warn: …`, and hook diagnostics. **stdout** carries the actual command output (status lines, JSON, written paths).
- `--silent` flags on session commands gate `if (!opts.silent) process.stdout.write(...)` blocks. Hook entrypoints are typically called with `--silent`.
- `--json` flags on `status` use `JSON.stringify(value, null, 2) + '\n'` (pretty, two-space indent).
- `chalk` is used for colored output **only in `src/commands/init.js`** (the interactive scaffolder). Other commands stay monochrome so their output is grep-friendly in scripts and hook logs.

## Comments

**JSDoc:** Not used. There is no `/** ... */` doc comment anywhere in `src/`.

**Inline `//` comments:** Used sparingly, but always for **why-not-what**. Three flavors observed:

1. **File-header context blocks** explaining the module's role:
   ```js
   // src/utils/hook-input.js
   // Claude Code passes hook payload as JSON on stdin (e.g. {"session_id":"...", ...}).
   // This helper reads stdin (when not a TTY) and returns the parsed object, or null.
   // A short timeout protects against the rare case where stdin is piped but never closed.
   ```

2. **Cross-file invariants** flagged at the call site:
   ```js
   // src/core/closing-tells.js
   // Keep this list in sync with the prose form in src/templates/skill/SKILL.md
   // and src/commands/nudge.js. The regex form here drives the second-chance
   // detector; the prose forms there steer the model's primary instinct.
   ```

3. **Defensive-programming rationale** (this is the most common):
   ```js
   // src/core/state.js
   } catch {
     // ignore unreadable / corrupt slot
   }
   ```
   ```js
   // src/core/lock.js
   } catch {
     // already released or stale-cleaned; not fatal
   }
   ```

Comments inside the file body explain a non-obvious branch or a known footgun (`function-form callback avoids $N substitution` in `src/core/logger.js:71`; `Computed entirely in UTC to avoid the local-tz bug` in `src/utils/format.js:33–34`). Don't comment what code already says — comment surprises.

## State Shape

The single source of truth for session state is the slot object documented in the comment block at the top of `src/core/state.js`:

```js
// Slot shape: { status, dateStr, sessionNumber, task, ticketId, branch, cwd,
//   repo, prNumber, claudeSessionId, startedAt, closedAt, nudgedAt?,
//   pendingNudge?, lastBlockedTurnId? }
```

When extending the slot:
- Add the field both in the comment and in code that constructs new slots (search for object literals in `src/commands/session.js:63–76`).
- Always treat new fields as **optional** (`?`) and read with `slot.foo ?? null` so older slot files round-trip cleanly.

## Module Design

- **Named exports only.** No `export default` is used in `src/`.
- **No barrel files.** No `index.js` re-exports. Imports always reach the concrete file (`from '../core/state.js'`).
- **One concern per file.** `state.js` does session slot I/O; `config.js` does config I/O; `logger.js` does daily-file mutation; `topics.js` does topic-page mutation; `detect.js` does task detection. They never reach into each other's storage.
- **Layering:** `commands/` depends on `core/` and `utils/`. `core/` depends on `utils/` and other `core/`. `utils/` depends on nothing inside the project (only Node built-ins). Don't break this — it's why dynamic `import()` is needed for the one cycle (`session.js` ↔ `topics.js`).

## Concurrency & File Mutation

All daily-file and topic-page writes go through `withLock(filePath, fn)` from `src/core/lock.js`, which uses `proper-lockfile`. This is mandatory for any function that does read-modify-write on a markdown file:

```js
// src/core/logger.js
export async function appendNote({ sessionNumber, dateStr, message, at }) {
  const file = getDailyFilePath(dateStr);
  await withLock(file, async () => {
    const raw = await readFile(file, 'utf8');
    const tag = sentinel(sessionNumber);
    if (!raw.includes(tag)) {
      throw new Error(`No open session ${sessionNumber} found in ${dateStr}`);
    }
    const line = `- Note [${formatHHMM(at ?? new Date())}]: ${message}\n${tag}`;
    await writeFile(file, raw.replace(tag, () => line), 'utf8');
  });
}
```

When you add a new mutator: lock the file, do all reads + the single write inside the closure, never call another locking function from inside the closure on the same path.

## Sentinel-Comment Pattern

Daily files use a markdown comment marker to identify the open session block:

```text
## Session 1 — Task: LPD-12345 — Fix something
- Started: 09:00
- Note [09:15]: looked at the bug
<!-- session-1-open -->
```

The sentinel is `<!-- session-${sessionNumber}-open -->`, generated by `sentinel(n)` in `src/core/logger.js:6`. It is the **only stable insertion point** for note/switch/activity lines (they're inserted just above the sentinel via `raw.replace(tag, () => '<line>\n' + tag)`). Closing the session replaces the sentinel with the `Ended/Duration/Completed` lines.

**Always use the function-form `String.replace` callback** (`replace(tag, () => line)`) so a `$1`, `$&`, etc. literal in user-supplied note text never triggers regex backreference substitution — see comment in `src/core/logger.js:71`.

## Regex Conventions

- Ticket regex is **configurable**, never hard-coded. It lives in vault config (`src/core/config.js:VAULT_DEFAULTS`) as `ticketRegex` (`\b(LPD|LPP|LPS|LRELEASE)-\d+\b`) and `branchTicketRegex`. Always read from `cfg.ticketRegex` / `cfg.branchTicketRegex`, never inline the literal.
- For escaping user-provided strings before use in `RegExp`, always go through `escapeRegex` from `src/utils/regex.js`.
- Multi-line markdown patterns use the `/m` flag and anchor on `^` / `$` (see `findBlock` in `src/core/logger.js:163`).

## Path Conventions

Always go through `src/utils/paths.js`. Don't compose vault-relative paths inline. The module owns:

- XDG-aware data, config, and state directories (`XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME` are honored — see `src/utils/paths.js:5–6` and `src/core/error-log.js:5`).
- Vault-relative helpers: `getDailyFilePath`, `getReportFilePath`, `getTicketFilePath`, `getComponentFilePath`, `getVaultConfigFilePath`.
- A module-level `activeVaultPath` set via `setVaultPath()` from `applyUserConfig()`. Calling `getVaultPath()` before the path is set throws; use `tryGetVaultPath()` if you want a nullable probe.

`getSessionFilePath(id)` sanitizes the id with `.replace(/[^A-Za-z0-9._-]/g, '_')` before joining — never trust an id to be filesystem-safe.

---

*Convention analysis: 2026-05-07*
