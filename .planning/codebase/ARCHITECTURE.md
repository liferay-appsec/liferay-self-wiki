<!-- refreshed: 2026-05-07 -->
# Architecture

**Analysis Date:** 2026-05-07

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    Claude Code (host process)                         │
│                                                                       │
│   SessionStart   UserPromptSubmit   Stop            SessionEnd        │
│        │               │             │                  │             │
│        ▼               ▼             ▼                  ▼             │
└────────┼───────────────┼─────────────┼──────────────────┼─────────────┘
         │               │             │                  │
         │ (hook fork → exec self-wiki, JSON on stdin)    │
         ▼               ▼             ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  CLI entry  `src/cli.js` (Commander)                  │
│  session open  │ session switch │ session close --soft │ close --hard │
│        nudge   │      note      │           status     │   etc.       │
└────────┬───────────────┬─────────────┬──────────────────┬─────────────┘
         │               │             │                  │
         ▼               ▼             ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Command layer  `src/commands/*.js`              │
│  (orchestrates: read state → call core → write daily/topic/state)     │
└────────┬───────────────────────────────────────────────────┬─────────┘
         │                                                   │
         ▼                                                   ▼
┌────────────────────────────────┐         ┌───────────────────────────┐
│  Core domain  `src/core/*.js`  │         │   Utils  `src/utils/*.js` │
│  state · logger · topics ·     │  uses   │   paths · format ·        │
│  config · detect · lock ·      │ ──────► │   log-parser · hook-input │
│  stop-detector · closing-tells │         │   regex                   │
└────────┬───────────────────────┘         └───────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            Persistence                                │
│                                                                       │
│  Per-session state JSON:                                              │
│    `~/.local/share/self-wiki/sessions/<claude-session-id>.json`       │
│                                                                       │
│  Daily logs (source of truth, sentinel-marked):                       │
│    `<vault>/Daily/<YYYY-MM-DD>.md`                                    │
│                                                                       │
│  Derivable artifacts (rebuildable):                                   │
│    `<vault>/Tickets/<TICKET>.md`   (per-ticket)                       │
│    `<vault>/Components/<slug>.md`  (per-component)                    │
│    `<vault>/Reports/<YYYY-Www>.md` (weekly synthesis)                 │
│                                                                       │
│  External (optional, soft-fail):                                      │
│    `git`  ·  `gh pr view`  ·  JIRA REST  ·  `claude -p`               │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI entry | Commander wiring + headless escape hatch (`SELF_WIKI_HEADLESS=1` short-circuit) | `src/cli.js` |
| Session command | Open/close/switch lifecycle; reaper for stale slots; soft/hard close split | `src/commands/session.js` |
| Note command | Append a `- Note [HH:MM]:` line to the active session's open block | `src/commands/note.js` |
| Status command | Print active session(s) (single line or multi-slot list); JSON mode | `src/commands/status.js` |
| Nudge command | One-shot zero-note primer; second-chance reminder for queued `pendingNudge` | `src/commands/nudge.js` |
| Report command | Weekly synthesis: deterministic metrics + `claude -p` prose | `src/commands/report.js` |
| Update-topics | Fold one closed session into Tickets/Components pages | `src/commands/update-topics.js` |
| Rebuild command | Rebuild a topic page (or all of them) from scratch by scanning daily logs | `src/commands/rebuild.js` |
| Close-orphans | Reaper for dangling `<!-- session-N-open -->` sentinels | `src/commands/close-orphans.js` |
| Init command | Scaffold vault, install skill, propose hooks + permissions diff | `src/commands/init.js` |
| Config command | View/edit user + vault config, JIRA wiring, component registration | `src/commands/config.js` |
| State store | Per-session JSON slots (one file per `claudeSessionId`); legacy migration | `src/core/state.js` |
| Logger | Daily-file mutations: open/close blocks, append note/switch, mark activity, reap orphans | `src/core/logger.js` |
| Topics | Append-or-merge dated section into topic pages; full-rebuild rendering | `src/core/topics.js` |
| Config core | User/vault config defaults + read/write; `applyUserConfig`, `ensureVaultConfigured` gates | `src/core/config.js` |
| Detect | Task detection chain: branch regex → `gh pr view` → JIRA REST → repo basename | `src/core/detect.js` |
| Lock | `proper-lockfile` wrapper for daily-file and topic-page writes | `src/core/lock.js` |
| Stop-detector | Inspect Claude Code transcript JSONL to detect closing-summary tells with no `self-wiki note` | `src/core/stop-detector.js` |
| Closing-tells | Regex catalogue of wrap-up phrases (kept in sync with skill prose + nudge) | `src/core/closing-tells.js` |
| Claude client | Spawn `claude -p`, set `SELF_WIKI_HEADLESS=1` on child env | `src/core/claude.js` |
| Error log | Best-effort JSONL append to `~/.local/state/self-wiki/close-errors.log` | `src/core/error-log.js` |
| Paths | XDG paths + vault-relative paths; mutable `activeVaultPath` set via `applyUserConfig` | `src/utils/paths.js` |
| Format | HH:MM, ISO date, ISO week, prior-week, duration | `src/utils/format.js` |
| Log-parser | `parseDailyFile` returning `{sessions:[{notes,switches,...}], breaks}` | `src/utils/log-parser.js` |
| Hook-input | Read JSON-on-stdin from Claude Code hook payload (with timeout) | `src/utils/hook-input.js` |
| Regex | `escapeRegex` shared helper | `src/utils/regex.js` |

## Pattern Overview

**Overall:** Layered hexagonal-ish CLI. The hook integration is the autonomy boundary; everything inside is a plain Commander app with a clear command → core → persistence stack and side files for parsing/format utilities.

**Key Characteristics:**
- **Hook-driven session lifecycle.** Session open/close/switch are exclusively hook entrypoints, not user commands. The skill (model-side) only calls `note`, `status`, and (rarely) `session switch`.
- **Daily logs are the source of truth.** Every other artifact (topic pages, weekly reports) is derivable from `Daily/<date>.md` files and rebuildable via `self-wiki rebuild-topics` or `self-wiki report`.
- **Deterministic data, model prose.** Counts, durations, PR refs, force-push counts are computed in code (`src/commands/report.js#buildMetrics`, `src/utils/log-parser.js`). Prose synthesis goes through `claude -p` (`src/core/claude.js`). Numbers are never asked of the model.
- **Soft dependencies degrade silently.** `git`, `gh`, JIRA REST, even `claude` itself fall back to next-best signals (`src/core/detect.js`, `src/core/claude.js#hasClaudeCli`). External-API failure never blocks a session-open.
- **Per-file write locks.** Concurrent Claude Code instances are first-class; daily files and topic pages are guarded by `proper-lockfile` via `src/core/lock.js`.
- **Idempotent, self-healing markdown mutations.** The sentinel-comment protocol in `src/core/logger.js` tolerates duplicate sentinels, missing sentinels, and double-close calls.
- **Stateless except for session slots.** State is the union of JSON slot files in `~/.local/share/self-wiki/sessions/` plus the markdown vault. No daemon, no PID liveness checks.

## Layers

**CLI layer:**
- Purpose: argument parsing, subcommand dispatch, headless escape hatch
- Location: `src/cli.js`
- Contains: Commander wiring, top-level `SELF_WIKI_HEADLESS` early-exit
- Depends on: command layer
- Used by: shell (user, hooks, skill)

**Command layer:**
- Purpose: orchestration of a single subcommand end-to-end
- Location: `src/commands/`
- Contains: one async function per subcommand, all starting with `await applyUserConfig(); ensureVaultConfigured();` (with a few exceptions like `config vault` and `nudge` that need to work pre-init)
- Depends on: core, utils
- Used by: CLI layer

**Core (domain) layer:**
- Purpose: business logic for sessions, daily logs, topic pages, task detection, headless model spawn
- Location: `src/core/`
- Contains: pure-ish modules (`state`, `logger`, `topics`, `config`, `detect`, `claude`, `lock`, `stop-detector`, `closing-tells`, `error-log`)
- Depends on: utils, filesystem, optional external CLIs (`git`, `gh`, `claude`)
- Used by: command layer

**Utils layer:**
- Purpose: pure helpers (paths, format, parsing, hook stdin, regex escape)
- Location: `src/utils/`
- Contains: `paths.js` (XDG + vault-relative paths, mutable `activeVaultPath`), `format.js`, `log-parser.js`, `hook-input.js`, `regex.js`
- Depends on: nothing in this repo (or only filesystem)
- Used by: core, commands

**Templates layer:**
- Purpose: install-time payload, not loaded at runtime by any command except `init`
- Location: `src/templates/`
- Contains: `skill/SKILL.md` (model primer), `hooks.json` (hook entries), `permissions.json` (allow rules), `prompts/weekly-report.md` (synthesis prompt), `vault/.self-wiki/config.json` (vault config seed)
- Depends on: nothing
- Used by: `src/commands/init.js`, `src/commands/report.js` (reads `prompts/weekly-report.md` at runtime)

## Data Flow

### Session lifecycle (the autonomy chain)

This is the canonical path. Each Claude Code event fires a hook, which forks `self-wiki <subcommand>` with the hook payload (JSON) on stdin.

1. **`SessionStart` event** — Claude Code spawns `self-wiki session open --cwd "$CLAUDE_PROJECT_DIR"` (`src/templates/hooks.json:6`).
2. CLI dispatches to `sessionOpen` (`src/commands/session.js:26`) which:
   - Resolves the Claude session id from `--claude-session-id`, `$CLAUDE_SESSION_ID`, or hook stdin (`resolveSessionId`).
   - Reaps any state slot older than 6h and closes orphan sentinels for those days (`reapStaleSlots`).
   - If a soft-closed slot exists for the same id within `softCloseMinutes`, reopens it; otherwise interrupts any prior open slot for the same id.
   - Calls `detectTask` (`src/core/detect.js:8`) — branch (`git rev-parse`) → `gh pr view` → JIRA REST → repo basename.
   - Calls `openSessionBlockAtomic` (`src/core/logger.js:9`) which under a `proper-lockfile` lock counts existing sessions in `Daily/<date>.md`, appends a header + `- Started: HH:MM` + sentinel, and returns the new `sessionNumber`.
   - Writes the slot to `~/.local/share/self-wiki/sessions/<id>.json` and exports `CLAUDE_SESSION_ID` to the hook env file (`exportSessionIdToHookEnv`).
3. **`UserPromptSubmit` event** — fires every prompt; runs two hooks in order:
   - `self-wiki session switch --silent` (`src/commands/session.js:215`): re-detects task; if branch changed, appends `- Switched: HH:MM → newTask` (`src/core/logger.js#appendSwitch`).
   - `self-wiki nudge` (`src/commands/nudge.js`): if a `pendingNudge` is queued, prints the second-chance reminder and clears it. Otherwise, on the first prompt with zero notes, primes the model with the noting contract once and stamps `nudgedAt`.
4. **Session work happens** — the skill (`src/templates/skill/SKILL.md`) instructs Claude to call `self-wiki note "<text>"` whenever an outcome lands. Each call goes through `noteCommand` → `appendNote` (`src/core/logger.js:61`), which under a lock replaces the first occurrence of the sentinel with `- Note [HH:MM]: <text>\n<sentinel>`.
5. **`Stop` event** (every assistant turn) — Claude Code spawns `self-wiki session close --soft --silent --block-on-tell` (`src/templates/hooks.json:13`).
   - `sessionClose` reads the hook payload's `transcript_path` and calls `inspectTranscript` (`src/core/stop-detector.js:10`) which walks back to the most recent user→assistant turn and detects a closing-summary tell (`src/core/closing-tells.js`) AND whether any `self-wiki note` Bash call ran during that turn.
   - Marks state `soft-closed`, stamps `- Last activity: HH:MM` via `markActivity` (`src/core/logger.js:88`).
   - If a tell was detected with no note added, queues `pendingNudge` and (when `--block-on-tell` AND the leaf UUID hasn't been blocked before) emits a Stop-block JSON to stdout — Claude Code re-runs the assistant with the block reason as feedback.
6. **`SessionEnd` event** (best-effort) — `self-wiki session close --hard --silent` runs:
   - Reads the slot, computes `durationMin`, calls `closeSessionBlock` (`src/core/logger.js:27`) under a lock — replaces the sentinel with `- Ended: HH:MM`, `- Duration: N min`, `- Completed: ✅` (or `Interrupted: ⚠️`).
   - Calls `updateTopicsForSession` (`src/core/topics.js:12`): parses today's daily file, collects ticket IDs (from `session.ticketId` and any `LPD-*` mentions in notes/switches via `vaultConfig.ticketRegex`) and component slugs (keyword-matched against notes/switches), and for each, calls `appendDatedSection` to upsert a `## <date> — Session N` section in `Tickets/<id>.md` or `Components/<slug>.md`.
   - Deletes the state slot.

### Reaper / orphan-cleanup path

`SessionEnd` is best-effort (terminal kills skip it). Two reapers cover the gap:

1. `sessionOpen` calls `reapStaleSlots` (`src/commands/session.js:309`) on every start — any slot >6h old gets `closeSessionBlock` with status `interrupted`, then `closeOrphanedSentinels` (`src/core/logger.js:114`) sweeps any leftover `<!-- session-N-open -->` markers in that day's file, computing end-time from the last `Last activity:` / `Note [HH:MM]:` / `Switched:` line.
2. `self-wiki close-orphans` (`src/commands/close-orphans.js`) is the explicit user-callable reaper, with `--all` to scan every daily file. Reaped sessions are folded into topic pages unless `--skip-topics` is passed.

### Weekly report path

1. `self-wiki report --week 2026-W17` invokes `reportCommand` (`src/commands/report.js:20`).
2. For each date in `datesInWeek(week)` (`src/utils/format.js#datesInWeek`), reads the daily file raw and parses it via `parseDailyFile`.
3. `buildMetrics` deterministically computes: total sessions, status breakdown, tickets touched, PR refs (regex over note text), force-push count.
4. `loadPriorReport` reads last week's `Reports/<prior-week>.md` if present.
5. `buildPrompt` concatenates: `src/templates/prompts/weekly-report.md` + WEEK + SOURCES_LINE + METRICS + DAILIES (raw) + PRIOR_REPORT.
6. `claudeHeadless` (`src/core/claude.js:3`) spawns `claude -p` with `SELF_WIKI_HEADLESS=1` set on the child env (so the child Claude's own hooks short-circuit at `src/cli.js:8` instead of recursing).
7. Writes the model output to `Reports/<week>.md`.

### Topic-page rebuild path

`self-wiki rebuild-topics --topic LPD-12345` calls `rebuildTicketPage` (`src/core/topics.js:41`), which iterates every date returned by `listDailyDates`, parses each, filters sessions whose `collectTicketsFromSession` set contains the target ID, renders one `## <date> — Session N` block per match via `renderSessionBody`, and writes the full topic file under a lock. This is the recovery contract: any topic page can be reconstructed from daily logs alone.

**State Management:**
- Per-session JSON file at `~/.local/share/self-wiki/sessions/<sanitized-claude-session-id>.json`. Schema: `{ status, dateStr, sessionNumber, task, ticketId, branch, cwd, repo, prNumber, claudeSessionId, startedAt, closedAt, nudgedAt?, pendingNudge?, lastBlockedTurnId? }`.
- `status` is one of `open` | `soft-closed` (no `closed` — closed sessions are deleted slots).
- Vault path is set into mutable module state (`src/utils/paths.js#activeVaultPath`) by `applyUserConfig` at the top of every command. Until that runs, `getVaultPath()` throws.

## Key Abstractions

**Sentinel-comment protocol:**
- Purpose: Mark the open block in a daily file so notes/switches/activity stamps can be inserted at a known anchor.
- Examples: `<!-- session-1-open -->`, `<!-- session-2-open -->` (`src/core/logger.js:6`)
- Pattern: All open-block mutations replace `tag` → `<new-line>\n<tag>`. Close replaces the first sentinel with closing-meta and strips duplicates (`composeClosedBlock`).

**Session slot:**
- Purpose: One JSON file per active Claude Code session (keyed by `$CLAUDE_SESSION_ID`).
- Examples: `~/.local/share/self-wiki/sessions/<id>.json` (`src/core/state.js:26`)
- Pattern: Read/write/delete; `listActiveSessions` enumerates the directory. There is no in-memory registry.

**Per-file lock:**
- Purpose: Allow N parallel Claude Code instances to mutate the same daily file without corruption.
- Examples: `withLock(file, async () => { … })` (`src/core/lock.js:11`)
- Pattern: All daily-file and topic-page writes go through `withLock`. Locks have 50 retries (factor 1.2, 10–200ms) and a 30s stale timeout.

**Task detection chain:**
- Purpose: Pick the best label and ticket id for a freshly-opened session.
- Examples: `detectTask` (`src/core/detect.js:8`)
- Pattern: branch regex (vault config `branchTicketRegex`) → `gh pr view --json` → JIRA REST `/rest/api/2/issue/<id>` → repo basename. Each step swallows its own errors.

**Closing-tell detector:**
- Purpose: Catch the "Done. Tests green. PR opened." pattern at end-of-turn so the model gets a second chance to drop the note.
- Examples: `looksLikeClosingSummary` (`src/core/closing-tells.js:27`), `inspectTranscript` (`src/core/stop-detector.js:10`)
- Pattern: Walk transcript JSONL backward to the last user→assistant turn, concatenate assistant text, run regex catalogue + 3+-bullet detector, scan tool_use blocks for `\bself-wiki\s+note\b`. Two surfaces use it: a Stop-block JSON (preventative, returned via stdout) and a `pendingNudge` queued for the next `UserPromptSubmit` (reactive fallback). `lastBlockedTurnId` tracks the assistant-leaf UUID to prevent re-blocking the same turn.

**Headless guard:**
- Purpose: Prevent recursive self-wiki invocations when `claude -p` is running for synthesis.
- Examples: `src/cli.js:8`, `src/core/claude.js:9`
- Pattern: Parent sets `SELF_WIKI_HEADLESS=1` on the spawned child's env; the child CLI exits 0 immediately for any subcommand.

## Entry Points

**`self-wiki` binary:**
- Location: `src/cli.js` (declared via `package.json#bin`)
- Triggers: shell invocation, Claude Code hook fork, skill-driven Bash tool calls
- Responsibilities: header guard, Commander dispatch, top-level error formatting

**Hook entrypoints (machine-only):**
- Location: `src/templates/hooks.json` (installed into `~/.claude/settings.json` by `init`)
- Triggers: `SessionStart`, `Stop`, `SessionEnd`, `UserPromptSubmit`
- Responsibilities: open/close/switch session, queue/emit nudges. Each hook command is suffixed with `|| true` so a hook failure never poisons Claude Code.

**Skill-callable subcommands:**
- Location: allow-listed in `src/templates/permissions.json` (also reflected in `src/templates/skill/SKILL.md` `allowed-tools`)
- Triggers: model decides to drop a note/check status/offer a switch
- Allowed: `Bash(self-wiki note *)`, `Bash(self-wiki status *)`, `Bash(self-wiki session switch *)`, `Bash(self-wiki close-orphans *)`. Anything else (notably `session open|close`) is blocked by the auto-mode classifier — by design.

## Architectural Constraints

- **Threading:** single-threaded Node event loop. No worker threads. Concurrency comes from N parallel CLI processes (multiple Claude Code instances, hooks firing in parallel).
- **Global state:** `activeVaultPath` in `src/utils/paths.js` is module-level mutable; every command must call `await applyUserConfig()` first to populate it. Tests must reset it explicitly.
- **No PID liveness.** Session framing is owned by hooks, not by a foreground process. State files alone don't tell you "is the process alive" — that's intentional.
- **Best-effort hooks.** Every hook command in `src/templates/hooks.json` ends with `|| true`. Failures inside a hook must never block the assistant turn; failures are logged to `~/.local/state/self-wiki/close-errors.log` via `src/core/error-log.js`.
- **Headless recursion guard.** `claude -p` invocations from `src/core/claude.js` set `SELF_WIKI_HEADLESS=1` to prevent the child Claude (which inherits the user's hooks and may auto-load the wiki skill) from calling back into this CLI.
- **Soft-fail external CLIs.** `git`, `gh`, JIRA REST, even `claude` itself — all callers must catch and degrade silently. See `src/core/detect.js` (each `try/await…/catch` returns null) and `src/core/claude.js#hasClaudeCli`.

## Anti-Patterns

### Calling `self-wiki session open` from the skill or model

**What happens:** Skill or model invokes `self-wiki session open` directly, expecting it to behave like a user command.
**Why it's wrong:** Sessions are framed by Claude Code hooks. Open from inside the model creates a duplicate slot, races the SessionStart hook, and may write the wrong `cwd`/`branch`. The autonomy boundary is the hook.
**Do this instead:** The hook in `src/templates/hooks.json` opens it. The skill calls only `note`, `status`, and (rarely) `session switch` — exactly the verbs allow-listed in `src/templates/permissions.json`.

### Bypassing the sentinel when mutating a daily file

**What happens:** Code reads `Daily/<date>.md`, computes a new string, and overwrites the whole file outside `src/core/logger.js`.
**Why it's wrong:** The sentinel comment `<!-- session-N-open -->` is the anchor for note insertion, switch logging, and activity stamping. Hand-rolled writes lose idempotence, break the close path's ability to find the open block, and skip the `proper-lockfile` lock — corrupting concurrent writes from parallel Claude Code instances.
**Do this instead:** Every daily-file mutation goes through `src/core/logger.js` (`openSessionBlockAtomic`, `closeSessionBlock`, `appendNote`, `appendSwitch`, `markActivity`, `closeOrphanedSentinels`), all of which use `withLock` from `src/core/lock.js`.

### Writing to a topic page outside `src/core/topics.js`

**What happens:** A new command directly writes `Tickets/<id>.md` or `Components/<slug>.md`.
**Why it's wrong:** `appendDatedSection` (`src/core/topics.js:123`) has subtle invariants — idempotent re-runs (re-folding the same session must not duplicate sections), section-marker matching (`## <date> — Session N`), per-file locking, header bootstrapping for empty files, and graceful upgrade for sections that grew new notes.
**Do this instead:** Call `updateTopicsForSession` (incremental fold) or `rebuildTicketPage` / `rebuildComponentPage` (full rebuild from daily corpus). Both live in `src/core/topics.js` and are the only sanctioned topic-page writers.

### Asking the model to compute a number

**What happens:** A weekly-report-style prompt says "tell me how many PRs were touched".
**Why it's wrong:** Numbers and counts are deterministic, cheap to compute in code, and expensive (and unreliable) for the model to compute over thousands of lines of daily log. Letting the model compute them invites hallucination.
**Do this instead:** Compute the number in code (see `src/commands/report.js#buildMetrics`), pass it into the prompt as `METRICS:`, and instruct the model to preserve it verbatim (see the `## Quick metrics` rule in `src/templates/prompts/weekly-report.md`).

### Adding PID liveness to state

**What happens:** Code adds `pid` to the state slot and probes whether it's alive.
**Why it's wrong:** self-wiki has no daemon. The hook is the framing process; the CLI exits in milliseconds. A liveness check here is always working around a hook problem (a missing/misconfigured hook, or a Claude Code event that didn't fire).
**Do this instead:** Lean on the reaper (`reapStaleSlots` in `src/commands/session.js:309` and `closeOrphanedSentinels` in `src/core/logger.js:114`) plus the `Last activity:` stamp from the Stop hook. If a slot is stale, age it out; don't ask "is it alive".

### Hard-failing when an external CLI is missing

**What happens:** A code path requires `gh` or JIRA and exits with an error if they're absent.
**Why it's wrong:** Soft dependencies must degrade silently. A missing `gh` should fall through to JIRA, then to the bare repo name — never break a session-open.
**Do this instead:** Wrap external calls in `try/catch` and return null/fallback. See `src/core/detect.js#hasGh`, `tryGhPrView`, `tryJiraTitle`.

## Error Handling

**Strategy:** Best-effort with structured error logging. Hooks must never block the user; failures are appended as JSON lines to `~/.local/state/self-wiki/close-errors.log` via `src/core/error-log.js`. The `|| true` suffix on every hook command in `src/templates/hooks.json` is the last line of defense.

**Patterns:**
- Hook entrypoints: catch and log via `logCloseError({kind, …, error: err.message})`, optionally print a `warn:` line, return.
- External CLI calls: try/catch, return null on failure, let the caller pick the next signal.
- File reads (parser, topic rebuild): `ENOENT` returns an empty result, not an error.
- Top-level CLI errors: `program.parseAsync().catch(...)` in `src/cli.js:126` writes `error: <msg>` and exits 1.

## Cross-Cutting Concerns

**Logging:** Direct writes to `process.stdout.write` / `process.stderr.write`. No logger framework. `chalk` is used for human-readable `init` output only. Hook commands run with `--silent` to keep stdout clean (Claude Code doesn't show hook stdout to the user except for Stop-block JSON which is parsed structurally).

**Validation:** Defensive parsing throughout — `inspectTranscript` returns a defensive default on any error (`src/core/stop-detector.js:11`); `parseSessions` skips blocks whose header doesn't match (`src/utils/log-parser.js:38`); `migrateLegacyState` deletes corrupt state files instead of throwing (`src/core/state.js:60`). Claude session ids are sanitized to `[A-Za-z0-9._-]` before use as a filename (`src/utils/paths.js:25`).

**Authentication:** Only `tryJiraTitle` consults credentials, reading the user-configured env var name (`userConfig.jira.tokenEnvVar`, default `JIRA_TOKEN`) and sending it as a Bearer token. No credentials are written by self-wiki.

**Concurrency:** `proper-lockfile` on every daily-file and topic-page write (`src/core/lock.js`). Per-session JSON slots are unique per `claudeSessionId` so they don't contend.

---

*Architecture analysis: 2026-05-07*
