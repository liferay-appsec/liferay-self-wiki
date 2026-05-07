# External Integrations

**Analysis Date:** 2026-05-07

self-wiki is a single-user local CLI; it has **no server, no database, and no inbound network surface**. Every external integration is a soft dependency that degrades silently when missing, per the architectural rule in `CLAUDE.md` ("Soft dependencies degrade silently"). The integration surface is small and entirely outbound.

## APIs & External Services

### Claude Code (host runtime)

The whole CLI is designed to be driven by Claude Code's hook system. self-wiki doesn't *call* Claude Code — Claude Code calls self-wiki on lifecycle events.

**Hooks installed into `~/.claude/settings.json`** (source: `src/templates/hooks.json`):

| Event | Command | Purpose |
|-------|---------|---------|
| `SessionStart` | `self-wiki session open --cwd "$CLAUDE_PROJECT_DIR" 2>&1 \|\| true` | Detect task, open daily-log block. |
| `Stop` | `self-wiki session close --soft --silent --block-on-tell \|\| true` | Soft-close on each turn; emit Stop-block JSON when a closing-summary tell is detected without an accompanying note. |
| `SessionEnd` | `self-wiki session close --hard --silent 2>&1 \|\| true` | Final close, fold notes into topic pages. |
| `UserPromptSubmit` | `self-wiki session switch --silent` then `self-wiki nudge` | Re-detect task on prompt; one-shot zero-note nudge. |

**Hook payload protocol:** Claude Code passes JSON on stdin (`{"session_id": "...", "transcript_path": "..."}`). Read by `src/utils/hook-input.js:readHookInput`, which tolerates non-piped stdin by short-circuiting on `process.stdin.isTTY` and uses a 250ms timeout against ungraceful pipes.

**Stop-block protocol:** When `session close --soft --block-on-tell` decides to nudge, it emits a single JSON line on stdout (`src/commands/session.js:130-137`):

```js
blockEmission = {
  decision: 'block',
  reason: 'Your last turn looks like a wrap-up but no `self-wiki note` was logged. ...',
};
```

Loop-safety is provided by `state.lastBlockedTurnId` — the assistant leaf UUID is recorded so the same turn isn't blocked twice (`src/commands/session.js:128-133`).

**Permissions installed into `~/.claude/settings.json`** (source: `src/templates/permissions.json`):

```json
"Bash(self-wiki note *)",
"Bash(self-wiki note --claude-session-id *)",
"Bash(self-wiki status)",
"Bash(self-wiki status *)",
"Bash(self-wiki session switch)",
"Bash(self-wiki session switch *)",
"Bash(self-wiki close-orphans)",
"Bash(self-wiki close-orphans *)"
```

These exist so Claude Code's auto-mode classifier doesn't block the skill's `self-wiki note` calls when the `wiki` skill isn't loaded into context (per the rule in `CLAUDE.md`: "Adding a new `self-wiki` subcommand the skill or model is expected to invoke means: add the matching `Bash(self-wiki <verb> *)` rule").

**Skill installed:** `~/.claude/skills/wiki/SKILL.md` — sourced from `src/templates/skill/SKILL.md`. The skill's `allowed-tools` frontmatter must stay in sync with `src/templates/permissions.json`.

**Transcript inspection:** `src/core/stop-detector.js:inspectTranscript` reads the JSONL transcript file at `hookPayload.transcript_path`. It walks backward to collect the last user→assistant turn, then checks for closing-summary phrasing (via `src/core/closing-tells.js`) and whether a `self-wiki note` Bash tool_use occurred in that turn. Robust against partial/corrupt transcripts — returns a defensive default on any error so the Stop hook never fails.

### Claude CLI (`claude -p`) — outbound subprocess

**Purpose:** Prose synthesis only. Per `CLAUDE.md`: "Time tables, session counts, PR refs, and force-push counts are computed in code from parsed log structure. Prose synthesis (weekly themes, decision summaries) goes through `claude -p`."

**Where invoked:**
- `src/core/claude.js:claudeHeadless(prompt, opts)` — spawns `claude -p` with stdin-piped prompt.
- Called from `src/commands/report.js:62` (weekly report synthesis) and (optionally) `src/commands/rebuild.js` via `--with-synthesis`.

**Spawn shape (`src/core/claude.js:6-22`):**
```js
const child = spawn('claude', args, {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, SELF_WIKI_HEADLESS: '1' },
});
// ...
child.stdin.end(prompt, 'utf8');
```

**Re-entry guard:** The child Claude inherits the user's hooks and may auto-load the `wiki` skill. Both would call back into `self-wiki` and corrupt state. `src/cli.js:8-10` checks `SELF_WIKI_HEADLESS=1` and `process.exit(0)`s before commander even loads:

```js
if (process.env.SELF_WIKI_HEADLESS === '1') {
  process.exit(0);
}
```

**Availability check:** `hasClaudeCli()` in `src/core/claude.js:25` runs `claude --version` with `stdio: 'ignore'`; resolves false on `error` or non-zero exit. `report.js:56` aborts with a helpful message when missing — never silently produces nothing.

**Auth:** None at this layer; the user's `claude` CLI handles its own auth.

### GitHub CLI (`gh`) — outbound subprocess

**Purpose:** PR-title enrichment for task detection. Soft dependency.

**Where invoked:** `src/core/detect.js:53-67`.

**Shape:**
```js
async function hasGh() {
  try { await exec('gh', ['--version']); return true; } catch { return false; }
}
async function tryGhPrView(cwd) {
  try {
    const { stdout } = await exec('gh', ['pr', 'view', '--json', 'number,title,url'], { cwd });
    return JSON.parse(stdout);
  } catch { return null; }
}
```

**Auth:** Delegated to `gh auth login`. self-wiki never reads `GITHUB_TOKEN` directly.

**Failure mode:** Catches all errors, returns `null`, falls through to branch parsing or bare-repo-name fallback. Never fails `session open`.

### Git — outbound subprocess

**Purpose:** Branch detection (the primary signal for task identification).

**Where invoked:** `src/core/detect.js:43-51`.

```js
async function tryGitBranch(cwd) {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    const branch = stdout.trim();
    return branch === 'HEAD' ? null : branch;
  } catch { return null; }
}
```

**Failure mode:** Returns `null` on any error (not a git repo, detached HEAD, no `git` on `PATH`). `detectTask` then falls back to `basename(cwd)` as `repo`.

### JIRA REST API (optional)

**Purpose:** Ticket-title enrichment when both branch detection and `gh` PR title fail to provide a usable label.

**Where invoked:** `src/core/detect.js:71-80`.

**Shape (uses native Node `fetch`):**
```js
async function tryJiraTitle(ticketId, jiraCfg) {
  if (!jiraCfg.baseUrl) return null;
  const token = jiraCfg.tokenEnvVar ? process.env[jiraCfg.tokenEnvVar] : null;
  if (!token) return null;
  const url = `${jiraCfg.baseUrl.replace(/\/$/, '')}/rest/api/2/issue/${encodeURIComponent(ticketId)}?fields=summary`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.fields?.summary ?? null;
}
```

**Configuration:** Disabled by default. Enabled via `self-wiki config jira` (`src/commands/config.js:42-68`) which writes:

```json
{ "jira": { "enabled": true, "baseUrl": "https://liferay.atlassian.net", "tokenEnvVar": "JIRA_TOKEN" } }
```

**Auth:** Bearer token read from the env var named by `userConfig.jira.tokenEnvVar` (default `JIRA_TOKEN`). The CLI does **not** store the token itself — only the *name* of the env var. This is a deliberate design choice; `README.md:81-91` explicitly recommends piping the token from a secrets manager (1Password, pass, Bitwarden, gnome-keyring) at shell-init time.

**Endpoint:** `GET <baseUrl>/rest/api/2/issue/<TICKET-ID>?fields=summary`. Single field, single endpoint, single GET. No webhooks, no pagination, no write paths.

**Failure mode:** Catches in `detect.js:36` (`.catch(() => null)`). A failed JIRA call is invisible to `session open`.

## Data Storage

**Databases:**
- None. There is no SQL, no SQLite, no key-value store.

**File-based persistence:**
- **Vault markdown** (`<vault>/Daily/`, `Reports/`, `Tickets/`, `Components/`) — the source of truth. All other artifacts are derivable. Daily logs are framed by sentinel comments (`<!-- session-N-open -->`) and mutated only through `src/core/logger.js` under a `proper-lockfile` lock.
- **Session slots** at `~/.local/share/self-wiki/sessions/<safe-id>.json` (one file per active Claude Code session) — read/written via `src/core/state.js`. Filename safety: `claudeSessionId.replace(/[^A-Za-z0-9._-]/g, '_')` (`src/utils/paths.js:27`).
- **User config** at `~/.config/self-wiki/config.json`.
- **Vault config** at `<vault>/.self-wiki/config.json`.
- **Close-error log** (JSONL) at `~/.local/state/self-wiki/close-errors.log`. Append-only, never read by the CLI itself; intended for postmortem.

**Concurrency model:** `proper-lockfile` 4.x with stale=30s and ~50 retries (`src/core/lock.js`). Wraps every daily-file and topic-page mutation. Multiple parallel Claude Code sessions writing to the same `Daily/<date>.md` are safe.

**File Storage:**
- Local filesystem only. No S3, no cloud blob, no CDN. `<vault>` is whatever local path the user pointed `self-wiki init` at.

**Caching:**
- None. No in-memory cache, no Redis, no on-disk derived-data cache. The closest thing is the `activeVaultPath` module-level variable in `src/utils/paths.js:15`, which holds the current vault path for the lifetime of one CLI invocation.

## Authentication & Identity

**Auth Provider:**
- None. self-wiki has no notion of users — it's a single-user local tool. The "identity" of a session is `$CLAUDE_SESSION_ID`, treated as opaque.

**Inbound auth:** None. There is no listening port.

**Outbound auth:**
- JIRA: `Authorization: Bearer ${token}` where `token = process.env[userConfig.jira.tokenEnvVar]`. Never logged, never persisted. Only the *name* of the env var is stored.
- `gh`: delegated entirely to the user's `gh` config.
- `claude -p`: delegated entirely to the user's Claude CLI config.

## Monitoring & Observability

**Error Tracking:**
- Local-only. Close-path errors that the user shouldn't see at the terminal are appended as JSON lines to `~/.local/state/self-wiki/close-errors.log` via `src/core/error-log.js:logCloseError`. Examples of recorded `kind` values: `inspect-transcript`, `mark-activity`, `close-session`, `close-slot`, `reap-orphans`, `reap-topics`. The error logger itself is wrapped in try/catch so it never masks the original failure.
- No Sentry, no Rollbar, no remote telemetry.

**Logs:**
- User-facing: `process.stdout.write` / `process.stderr.write` (no logger framework, no `console.log`). `chalk` is used for `init` and `status` only.
- Hook-driven commands accept `--silent` to suppress stdout entirely.

**Metrics:**
- None emitted. The "metrics" the codebase computes (PR refs, force-push counts, session counts) are *report content*, not operational metrics.

## CI/CD & Deployment

**Hosting:**
- N/A — local CLI.

**CI Pipeline:**
- None. No `.github/workflows/`, no GitLab CI, no Travis, no Circle.

**Distribution:**
- `git clone … && npm install -g .`. Per the README ("clone-and-link Node CLI (no npm registry publish)"). Upgrades are `git pull && npm install && npm install -g . && self-wiki init <vault>`; `init` re-runs are idempotent and refresh the skill, hooks, and permissions.

## Webhooks & Callbacks

**Incoming:**
- None at the HTTP layer.
- Local "callbacks" are Claude Code hook invocations — see the SessionStart / Stop / SessionEnd / UserPromptSubmit table above. These are the *only* event-driven entry points; everything else is user-invoked CLI.

**Outgoing:**
- None. No webhooks fired, no events posted.

## Environment Configuration

**Required env vars (none, strictly speaking):**
- All env vars are optional or have XDG fallbacks.

**Functionally required by hook-driven flow:**
- `CLAUDE_SESSION_ID` — set by Claude Code's SessionStart hook. Without it, `resolveSessionId` falls back to `cwd` matching against active slots (`src/commands/session.js:268-272`).
- `CLAUDE_PROJECT_DIR` — passed to `--cwd` by the SessionStart hook (`src/templates/hooks.json:6`).

**Optional, by feature:**
- `JIRA_TOKEN` (or whatever `tokenEnvVar` is set to) — only consulted when JIRA integration is enabled.
- `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME` — XDG overrides; default to `~/.local/share`, `~/.config`, `~/.local/state`.

**Set by self-wiki:**
- `SELF_WIKI_HEADLESS=1` — forced on `claude -p` children to short-circuit re-entry (`src/core/claude.js:9`, gate at `src/cli.js:8`).
- Appends `export CLAUDE_SESSION_ID=<id>` to `$CLAUDE_ENV_FILE` after `session open` so subsequent hooks see the id (`src/commands/session.js:83-92`).

**Secrets location:**
- self-wiki itself stores **no secrets**. The only secret it reads is the JIRA token, and it reads it from an env var the user provisions however they like (`README.md:81-91`).

---

*Integration audit: 2026-05-07*
