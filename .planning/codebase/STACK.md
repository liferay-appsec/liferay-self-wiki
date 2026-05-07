# Technology Stack

**Analysis Date:** 2026-05-07

## Languages

**Primary:**
- JavaScript (ESM, Node-flavoured) — every source file under `src/` and `test/` is ES module JavaScript. There is no TypeScript, Babel, or transpilation step; files are run directly by Node.

**Secondary:**
- Markdown — used for both the user-facing README and as a *runtime artifact format*. Daily logs (`Daily/<date>.md`), topic pages (`Tickets/<id>.md`, `Components/<slug>.md`), weekly reports (`Reports/<week>.md`), the installed skill (`src/templates/skill/SKILL.md`), and the synthesis prompt (`src/templates/prompts/weekly-report.md`) are all hand-edited or programmatically-edited markdown.
- JSON — config layers (`src/templates/vault/.self-wiki/config.json`), Claude Code hook/permission templates (`src/templates/hooks.json`, `src/templates/permissions.json`), persisted session state (`~/.local/share/self-wiki/sessions/<id>.json`), and the structured close-error log (`~/.local/state/self-wiki/close-errors.log`, JSON-lines).

## Runtime

**Environment:**
- Node.js >= 20.0.0 (declared in `package.json` `engines.node`).
- ESM only — `package.json` sets `"type": "module"`. All imports use ESM syntax (`import { … } from '…'`) and bare specifiers like `'fs/promises'` (and one explicit `'node:fs/promises'` in `src/commands/session.js`).
- Global `fetch` is used directly in `src/core/detect.js` (line 76) for the JIRA REST call — relies on Node 20's built-in undici-based fetch, no `node-fetch` dependency.

**Package Manager:**
- npm — `package-lock.json` (lockfileVersion 3) is committed; no `pnpm-lock.yaml` or `yarn.lock`.
- Distribution model is **clone + `npm install -g .`**, not a registry publish. The README spells this out explicitly (`git clone … && npm install -g .`).
- Lockfile: present (`package-lock.json`).

## Frameworks

**Core:**
- `commander` ^14.0.0 — single CLI framework. Wired in `src/cli.js` (the `#!/usr/bin/env node` shebang is the entrypoint declared by `package.json` `bin.self-wiki`). Subcommands live in `src/commands/*.js` and are registered via `program.command(…).action(handler)`. Sub-sub-commands (e.g. `session open`, `session close`, `config show`) use the nested `program.command('session').command('open')` pattern. Example from `src/cli.js:39-69`:

```js
const session = program
  .command('session')
  .description('Session lifecycle (called by Claude Code hooks; not normally invoked manually).');

session
  .command('open')
  .option('--cwd <path>', 'override working directory used for task detection')
  .option('--claude-session-id <id>', 'Claude session id from hook payload')
  .action(sessionOpen);
```

- `chalk` ^5.3.0 — terminal colouring, used **only** in interactive paths: `src/commands/init.js` (init banner, hook diff colouring) and `src/commands/status.js`. Hook-driven commands don't colour their output.

**Testing:**
- `node --test` — Node's built-in test runner. The `test` npm script is literally `node --test test/*.test.js` (`package.json:20`). No Jest, no Vitest, no Mocha. Tests use `import { test, describe } from 'node:test'` and `import assert from 'node:assert/strict'`.

**Build/Dev:**
- None. There is no bundler (no webpack/rollup/esbuild), no transpiler, no source map step, no lint config (`.eslintrc*` absent), no Prettier config. The CLI is run directly from `src/cli.js`.

## Key Dependencies

**Critical (production):**
- `commander` ^14.0.0 — CLI argv parsing. See `src/cli.js`.
- `chalk` ^5.3.0 — TTY colouring for `init` and `status`. ESM-only since v5; this is fine because the project is ESM throughout.
- `proper-lockfile` ^4.1.2 — the *only* concurrency primitive. Wraps every mutating write to a daily file or topic page. Defined once in `src/core/lock.js` and called from `src/core/logger.js` and `src/core/topics.js`. Configuration:

```js
// src/core/lock.js
const LOCK_OPTS = {
  retries: { retries: 50, factor: 1.2, minTimeout: 10, maxTimeout: 200 },
  stale: 30_000,
  realpath: false,
};
```

**Infrastructure (Node built-ins, no install):**
- `fs/promises` — all file I/O (`readFile`, `writeFile`, `appendFile`, `mkdir`, `unlink`, `readdir`, `rename`, `access`, `copyFile`).
- `child_process` — `spawn` for `claude -p` (in `src/core/claude.js`) and `execFile` for `git` / `gh` (in `src/core/detect.js`).
- `path`, `os` (`homedir`), `url` (`fileURLToPath`), `util` (`promisify`), `readline/promises` (interactive `init`/`config jira` prompts).

## Configuration

**Environment variables (consumed):**
- `XDG_DATA_HOME` — overrides `~/.local/share` for state (`src/utils/paths.js:5`). Falls back to `~/.local/share`.
- `XDG_CONFIG_HOME` — overrides `~/.config` for user config (`src/utils/paths.js:6`). Falls back to `~/.config`.
- `XDG_STATE_HOME` — overrides `~/.local/state` for the close-error log (`src/core/error-log.js:5`).
- `CLAUDE_SESSION_ID` — when set by Claude Code's SessionStart hook, used as the primary session-slot key. See `src/commands/session.js:260`.
- `CLAUDE_ENV_FILE` — Claude Code's per-hook env-export file. `sessionOpen` appends `export CLAUDE_SESSION_ID=…` to it so subsequent hooks in the same Claude session inherit the id (`src/commands/session.js:83-92`).
- `CLAUDE_PROJECT_DIR` — passed as `--cwd` by the SessionStart hook in `src/templates/hooks.json`.
- `SELF_WIKI_HEADLESS` — set to `1` on the `claude -p` child env in `src/core/claude.js:9`. The `cli.js` entry checks it first and `process.exit(0)`s immediately, preventing the inner Claude from re-entering self-wiki via inherited hooks/skill.
- `JIRA_TOKEN` (or whatever `userConfig.jira.tokenEnvVar` is set to) — bearer token for the optional JIRA REST call in `src/core/detect.js:73`.

**Environment variables (set):**
- `SELF_WIKI_HEADLESS=1` is forced on `claude -p` children.
- `CLAUDE_SESSION_ID` is appended to `$CLAUDE_ENV_FILE` after a successful `session open`.

**Config files:**
- `~/.config/self-wiki/config.json` — user layer. Schema in `src/core/config.js:11-14`:

```js
const USER_DEFAULTS = {
  vaultPath: null,
  jira: { enabled: false, baseUrl: null, tokenEnvVar: null },
};
```

- `<vault>/.self-wiki/config.json` — vault layer. Schema in `src/core/config.js:16-21`:

```js
const VAULT_DEFAULTS = {
  ticketRegex: '\\b(LPD|LPP|LPS|LRELEASE)-\\d+\\b',
  branchTicketRegex: '(?:^|[/_-])((?:LPD|LPP|LPS|LRELEASE)-\\d+)(?:[/_-]|$)',
  components: [],
  softCloseMinutes: 5,
};
```

- `~/.claude/settings.json` — Claude Code's hook + permission registry. `init` *merges* into it (see `src/commands/init.js:118-143` for `mergeHooks`); never clobbers third-party entries.

**State files (managed, not user-edited):**
- `~/.local/share/self-wiki/sessions/<safe-claude-session-id>.json` — one slot per active Claude Code session. Shape documented at `src/core/state.js:10-15`.
- `~/.local/share/self-wiki/state.json` — legacy single-slot file; migrated by `migrateLegacyState()` in `src/core/state.js:60` and then removed.
- `~/.local/state/self-wiki/close-errors.log` — JSON-lines structured error log appended by `src/core/error-log.js`.

## Platform Requirements

**Development:**
- Node 20+, npm.
- Optional but useful: `git` on `PATH` (the only way `detectTask` learns the branch — `src/core/detect.js:44`), `gh` (`src/core/detect.js:53-67`), `claude` CLI (`src/core/claude.js:25`).
- POSIX-y filesystem layout assumed (XDG paths, `~/.claude/settings.json`). No Windows-specific code paths.

**Production:**
- This is a personal, local-only CLI. There is no server, no container, no deploy target. "Production" is the user's workstation.
- The CLI installs into Claude Code's user-scope hooks at `~/.claude/settings.json` and skill directory at `~/.claude/skills/wiki/SKILL.md` — both are user-managed copies refreshed by `self-wiki init`.

## Testing

**Test runner invocation:**
```bash
npm test                           # node --test test/*.test.js
node --test test/session.test.js   # single file
```

**Test files present (`test/`):**
- `config.test.js`, `format.test.js`, `logger.test.js`, `log-parser.test.js`, `nudge.test.js`, `paths.test.js`, `session.test.js`, `state.test.js`, `stop-detector.test.js`, `topics.test.js`.
- No coverage tool wired in. No CI config (no `.github/workflows/`, no `.gitlab-ci.yml`).

---

*Stack analysis: 2026-05-07*
