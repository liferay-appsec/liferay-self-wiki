# Codebase Structure

**Analysis Date:** 2026-05-07

## Directory Layout

```text
liferay-self-wiki/
├── CLAUDE.md                       # Project conventions for Claude (architectural rules)
├── README.md                       # User-facing docs (install, hooks table, daily commands)
├── LICENSE                         # MIT
├── package.json                    # ESM, Node 20+, `bin: self-wiki → src/cli.js`
├── package-lock.json
├── .gitignore
├── .claude/
│   └── settings.local.json         # Project-local Claude settings (not source)
├── .planning/
│   └── codebase/                   # Analysis docs (this file lives here)
├── src/
│   ├── cli.js                      # Commander entry; headless escape hatch on `SELF_WIKI_HEADLESS=1`
│   ├── commands/                   # User-facing + hook-callable subcommands
│   │   ├── init.js                 # Scaffold vault, install skill, propose hooks + permissions
│   │   ├── session.js              # open / close (soft|hard) / switch — hook entrypoints
│   │   ├── note.js                 # Append a note line to the active session block
│   │   ├── nudge.js                # Zero-note primer + second-chance closing-summary nudge
│   │   ├── status.js               # Single or multi-slot status (with --json)
│   │   ├── update-topics.js        # Fold one closed session into Tickets/ and Components/
│   │   ├── rebuild.js              # Rebuild a topic page (or all of them) from daily corpus
│   │   ├── report.js               # Weekly synthesis: deterministic metrics + claude -p prose
│   │   ├── close-orphans.js        # Reap dangling `<!-- session-N-open -->` sentinels
│   │   └── config.js               # config show / vault / jira / component
│   ├── core/                       # Domain modules — used by commands, never by other cores recursively
│   │   ├── state.js                # Per-session JSON slots in ~/.local/share/self-wiki/sessions/
│   │   ├── config.js               # User + vault config layers; applyUserConfig, ensureVaultConfigured
│   │   ├── detect.js               # Task detection: branch → gh PR → JIRA → repo basename
│   │   ├── logger.js               # Daily-file mutations through sentinel-comment protocol
│   │   ├── topics.js               # Append-or-merge dated sections; full rebuild
│   │   ├── claude.js               # Spawn `claude -p` with SELF_WIKI_HEADLESS=1
│   │   ├── lock.js                 # proper-lockfile wrapper
│   │   ├── stop-detector.js        # Inspect transcript JSONL for closing-summary tells
│   │   ├── closing-tells.js        # Regex catalogue of wrap-up phrases
│   │   └── error-log.js            # Best-effort JSONL append to close-errors.log
│   ├── utils/                      # Pure helpers (no domain logic)
│   │   ├── paths.js                # XDG paths + vault-relative paths; mutable activeVaultPath
│   │   ├── format.js               # HH:MM, ISO date, ISO week, prior-week, durations
│   │   ├── log-parser.js           # parseDailyFile → {sessions, breaks}
│   │   ├── hook-input.js           # Read JSON-on-stdin from Claude Code hook payload (timeout)
│   │   └── regex.js                # escapeRegex
│   └── templates/                  # Install-time payloads (not loaded at runtime, except weekly-report.md)
│       ├── hooks.json              # Hook entries merged into ~/.claude/settings.json
│       ├── permissions.json        # Bash(self-wiki …) allow rules
│       ├── skill/
│       │   └── SKILL.md            # Installed to ~/.claude/skills/wiki/SKILL.md
│       ├── prompts/
│       │   └── weekly-report.md    # Read at runtime by `self-wiki report`
│       └── vault/
│           └── .self-wiki/
│               └── config.json     # Vault-config seed (ticketRegex, components, softCloseMinutes)
└── test/                           # node --test, one file per src module
    ├── config.test.js
    ├── format.test.js
    ├── log-parser.test.js
    ├── logger.test.js
    ├── nudge.test.js
    ├── paths.test.js
    ├── session.test.js
    ├── state.test.js
    ├── stop-detector.test.js
    └── topics.test.js
```

## Directory Purposes

**`src/`:**
- Purpose: All shipped JS lives here.
- Contains: CLI entry, commands, core domain, utils, install templates.
- Key files: `src/cli.js`

**`src/commands/`:**
- Purpose: One async function per `self-wiki <verb>`.
- Contains: Orchestration only — read state, call core, write to disk, print user-facing output.
- Convention: Every command starts with `await applyUserConfig(); ensureVaultConfigured();` (omit the second when the command should also work pre-init, e.g. `config vault`, `nudge`, parts of `status`).
- Key files: `src/commands/session.js` (hook entrypoints), `src/commands/note.js` (skill entrypoint), `src/commands/report.js` (weekly synthesis).

**`src/core/`:**
- Purpose: Domain logic. The "what self-wiki actually does."
- Contains: State persistence, daily-log mutation, topic-page generation, task detection, lockfile wrapper, transcript inspection, headless model spawn.
- Convention: A core module owns its filesystem region. `core/logger.js` owns daily files. `core/topics.js` owns topic pages. `core/state.js` owns session JSON slots. Don't cross those boundaries.
- Key files: `src/core/logger.js` (sentinel-comment protocol), `src/core/topics.js` (append-or-merge), `src/core/state.js` (per-session slots).

**`src/utils/`:**
- Purpose: Pure helpers with no domain knowledge.
- Contains: Path resolution (XDG + vault-relative), date/time formatting, daily-file parsing, hook-stdin reader, regex helpers.
- Convention: Utils may not import from `src/core/` or `src/commands/`. They're leaves of the dependency graph.
- Key files: `src/utils/log-parser.js` (the canonical parser), `src/utils/paths.js` (only place paths are constructed), `src/utils/format.js` (HH:MM, ISO week math).

**`src/templates/`:**
- Purpose: Files copied or read at install / report time. Not loaded by the runtime CLI.
- Contains: skill markdown, hooks JSON, permissions JSON, weekly-report prompt, vault-config seed.
- Convention: When `init` evolves, the JSON templates here are the source of truth. `src/commands/init.js` does idempotent merges into `~/.claude/settings.json` from these.
- Key files: `src/templates/hooks.json`, `src/templates/permissions.json`, `src/templates/skill/SKILL.md`, `src/templates/prompts/weekly-report.md`.

**`test/`:**
- Purpose: Node's built-in `node --test` runner; one test file per source module under test.
- Contains: 10 test files (~1939 lines total) covering config, format, log-parser, logger, nudge, paths, session, state, stop-detector, topics.
- Convention: `npm test` runs `node --test test/*.test.js`. Tests use `XDG_DATA_HOME` / `XDG_CONFIG_HOME` overrides + temp dirs to isolate state.

**`.planning/`:**
- Purpose: Workspace for codebase analysis docs (this directory).
- Contains: `codebase/ARCHITECTURE.md`, `codebase/STRUCTURE.md`, etc.
- Generated: Yes, by codebase-mapping agents.
- Committed: No — typically gitignored or excluded from packaging.

**`.claude/`:**
- Purpose: Project-local Claude Code settings (overrides for this repo).
- Contains: `settings.local.json` only.
- Generated: Hand-edited.

## Key File Locations

**Entry Points:**
- `src/cli.js` — `self-wiki` binary; Commander dispatch; headless guard at line 8.
- `src/templates/hooks.json` — Hook entrypoints into the CLI from Claude Code (machine-only callers).
- `src/templates/skill/SKILL.md` — Model-side primer; allow-listed tool calls only.

**Configuration:**
- `~/.config/self-wiki/config.json` — User config: `vaultPath`, `jira: { enabled, baseUrl, tokenEnvVar }` (read by `src/core/config.js#readUserConfig`).
- `<vault>/.self-wiki/config.json` — Vault config: `ticketRegex`, `branchTicketRegex`, `components`, `softCloseMinutes` (read by `src/core/config.js#readVaultConfig`; defaults in `VAULT_DEFAULTS` in the same file).
- `~/.claude/settings.json` — Claude Code settings; hooks + permissions merged here by `src/commands/init.js`.

**Core Logic:**
- Session lifecycle: `src/commands/session.js` (orchestration) + `src/core/state.js` (slot store) + `src/core/logger.js` (daily-file mutations).
- Notes: `src/commands/note.js` → `src/core/logger.js#appendNote`.
- Topic pages: `src/core/topics.js` (only sanctioned writer).
- Weekly report: `src/commands/report.js` + `src/core/claude.js` + `src/templates/prompts/weekly-report.md`.
- Task detection: `src/core/detect.js`.

**State / Data:**
- Per-session JSON slots: `~/.local/share/self-wiki/sessions/<sanitized-id>.json` (managed by `src/core/state.js`).
- Legacy single-state file: `~/.local/share/self-wiki/state.json` (auto-migrated by `migrateLegacyState`).
- Daily logs: `<vault>/Daily/<YYYY-MM-DD>.md` (source of truth).
- Topic pages: `<vault>/Tickets/<TICKET>.md`, `<vault>/Components/<slug>.md` (derivable, rebuildable).
- Reports: `<vault>/Reports/<YYYY-Www>.md`.
- Error log: `~/.local/state/self-wiki/close-errors.log` (`src/core/error-log.js`).

**Testing:**
- `test/*.test.js` — Node's built-in test runner; co-located by source module name.
- `package.json#scripts.test` — `node --test test/*.test.js`.

## Naming Conventions

**Files:**
- JS source: lowercase with hyphens, `.js` extension. `log-parser.js`, `close-orphans.js`, `stop-detector.js`, `closing-tells.js`, `error-log.js`, `update-topics.js`.
- Markdown: UPPERCASE for top-level project docs (`README.md`, `CLAUDE.md`, `LICENSE`); lowercase-hyphen for templates (`weekly-report.md`).
- Tests: `<module>.test.js` mirroring the source filename.

**Directories:**
- All lowercase. Single noun where possible (`commands`, `core`, `utils`, `templates`, `test`). `commands/` and `core/` deliberately differ — `commands` describes the CLI surface, `core` describes domain logic.

**Functions:**
- camelCase, verb-first. `openSessionBlockAtomic`, `appendNote`, `closeOrphanedSentinels`, `parseDailyFile`, `detectTask`, `withLock`, `claudeHeadless`.
- Boolean predicates: `isAlreadyClosed`, `isRealUserPrompt`, `looksLikeClosingSummary`, `hasGh`, `hasClaudeCli`.
- Try-style soft-fail helpers prefixed `try`: `tryGitBranch`, `tryGhPrView`, `tryJiraTitle`, `tryGetVaultPath`.

**Constants:**
- SCREAMING_SNAKE for module-scoped: `USER_DEFAULTS`, `VAULT_DEFAULTS`, `LOCK_OPTS`, `TEMPLATES`, `SKILL_DEST`, `REAPER_AGE_MS`, `PHRASES`, `BULLET_LIST`, `ACTIVITY_LINE_RE`.

**Markdown sentinels / markers (in daily files):**
- Open sentinel: `<!-- session-N-open -->` (single source: `src/core/logger.js#sentinel`).
- Section markers in topic pages: `## <YYYY-MM-DD> — Session N`.
- Day header: `# <YYYY-MM-DD>`.
- Session header: `## Session N — Task: <label>`.
- Note line: `- Note [HH:MM]: <text>`.
- Switch line: `- Switched: HH:MM → <newTask>`.
- Activity stamp: `- Last activity: HH:MM`.

## Where to Add New Code

**A new `self-wiki <verb>` subcommand:**
- Implementation: `src/commands/<verb>.js` (or `<verb>.js` with hyphens), exporting an async function.
- Wire it: import + `program.command(...)` in `src/cli.js`.
- Boilerplate: top of the function, `await applyUserConfig(); ensureVaultConfigured();` (omit the second when the command should work pre-init).
- Allow-list (if the skill or model should invoke it): add `Bash(self-wiki <verb> *)` to `src/templates/permissions.json`.
- Test: `test/<verb>.test.js`.
- Docs: README's command table if user-facing; or the hook table if hook-callable.

**A new hook:**
- Hook entry: edit `src/templates/hooks.json`. `init`'s `mergeHooks` is idempotent — re-running `init` upgrades existing self-wiki hook entries in place without duplicating.
- The verb the hook calls: should live in `src/commands/` (typically a hook-only command like `session.js`'s subcommands).
- Document: README's hook table.
- Permissions: add `Bash(self-wiki <verb> *)` to `src/templates/permissions.json` if the command should also be auto-allowed when invoked manually by the model/skill.

**A new domain capability (e.g. break tracking, cross-day stats):**
- Module: `src/core/<area>.js` (one module per concern). Owns its filesystem region.
- Exposed surface: small set of async exports; hide regex/format details.
- Use `withLock` from `src/core/lock.js` for any write to a shared markdown file.
- Use `parseDailyFile` from `src/utils/log-parser.js` to read daily logs — never re-implement the parser.

**A new format / parser tweak:**
- Format helpers: `src/utils/format.js`.
- Daily-log parser: `src/utils/log-parser.js#parseSessions`. Extend the returned `session` shape carefully — `topics.js` and `report.js` rely on it.

**A new utility:**
- Pure helper, no domain dependencies → `src/utils/<name>.js`.
- Has filesystem or domain knowledge → `src/core/<name>.js` instead.

**A new template / install-time payload:**
- Asset: `src/templates/<area>/<file>`.
- Install logic: extend `src/commands/init.js` (mirror the `proposeHooks` / `proposePermissions` shape — read template, diff against current settings, prompt, merge idempotently).

**A new test:**
- Location: `test/<module>.test.js` matching the source filename.
- Run with `npm test` (which runs `node --test test/*.test.js`).
- Use temp `XDG_DATA_HOME` / `XDG_CONFIG_HOME` to isolate state slots, and a temp vault directory for daily-file tests.

## Special Directories

**`node_modules/`:**
- Purpose: Installed deps (`chalk`, `commander`, `proper-lockfile`).
- Generated: Yes, by `npm install`.
- Committed: No (gitignored).

**`.planning/codebase/`:**
- Purpose: Codebase-mapping analysis output (the file you are reading).
- Generated: Yes, by codebase-mapping agents.
- Committed: Project-dependent; typically excluded from npm `files` (which only lists `src`, `README.md`, `CLAUDE.md`).

**`src/templates/`:**
- Purpose: Install-time payloads (not Node modules).
- Generated: No, hand-authored.
- Committed: Yes.
- Note: `src/templates/prompts/weekly-report.md` is read at runtime (not just install-time) by `src/commands/report.js`.

## File-Path Quick Reference

| Need to… | File |
|----------|------|
| Add a CLI flag | `src/cli.js` |
| Change session lifecycle | `src/commands/session.js` |
| Mutate daily file | `src/core/logger.js` (always under `withLock`) |
| Parse daily file | `src/utils/log-parser.js` |
| Resolve vault paths | `src/utils/paths.js` |
| Change task detection | `src/core/detect.js` |
| Change weekly synthesis | `src/templates/prompts/weekly-report.md` (prompt) and `src/commands/report.js` (metrics) |
| Add a wrap-up phrase | `src/core/closing-tells.js` (regex) AND `src/templates/skill/SKILL.md` (model-facing prose) AND the primer in `src/commands/nudge.js` |
| Add a hook | `src/templates/hooks.json` (and run `init` idempotently to install) |
| Add an allow-listed Bash rule | `src/templates/permissions.json` |
| Inspect Claude transcript | `src/core/stop-detector.js` |
| Spawn `claude -p` | `src/core/claude.js` |
| Lock a file | `src/core/lock.js` |
| Log a hook failure | `src/core/error-log.js` |

---

*Structure analysis: 2026-05-07*
