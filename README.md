# self-wiki

A self-writing personal wiki for engineers. Just run `claude` inside a repo — your work is captured into daily logs, topic pages, and weekly reports automatically. Zero per-session commands.

The model: Claude Code hooks frame sessions; a skill instructs Claude to drop terse decision/outcome notes during work; a CLI synthesizes weekly reports and rebuilds topic pages on demand.

## Install

Self-wiki is distributed as a clone-and-link Node CLI (no npm registry publish). Requires Node 20+.

Pick any directory you want as your vault — an existing Obsidian vault, a new folder, anywhere on disk. Self-wiki creates the subfolders it needs and otherwise leaves the directory alone.

```sh
git clone <this-repo-url> self-wiki
cd self-wiki
npm install
npm install -g .
self-wiki init /path/to/your/vault
```

Examples: `~/notes`, `~/Documents/work-vault`, `/data/obsidian/personal`. Re-running `init` later with a different path repoints to the new vault; the old one stays untouched.

`init` does five things:

1. Scaffolds the vault layout (`Daily/`, `Reports/`, `Tickets/`, `Components/`, `.self-wiki/config.json`).
2. Installs the `wiki` skill to `~/.claude/skills/wiki/SKILL.md`.
3. Proposes a hooks diff for `~/.claude/settings.json` (review before applying).
4. Proposes `permissions.allow` additions for `~/.claude/settings.json` so Claude Code can run `self-wiki note` / `status` / `session switch` without the auto-mode classifier blocking them when the `wiki` skill isn't loaded.
5. Records the vault path in `~/.config/self-wiki/config.json`.

## What you get

Inside the vault directory you chose, `init` creates:

```
<your-vault>/
  Daily/
    2026-04-27.md       ← session log, source of truth
  Reports/
    2026-W17.md         ← weekly synthesis (run `self-wiki report --week`)
  Tickets/
    LPD-12345.md        ← grows across sessions
  Components/
    auth-provider.md    ← cross-ticket recurring areas
  .self-wiki/
    config.json         ← ticket regex, components, soft-close window
```

## How sessions get framed

| Hook              | Command                              | What it does                                           |
| ----------------- | ------------------------------------ | ------------------------------------------------------ |
| `SessionStart`    | `self-wiki session open`             | Detects task from branch/PR, opens a session block.    |
| `Stop`            | `self-wiki session close --soft`     | Soft-close; reopens if a new prompt arrives soon. Stamps a `- Last activity: HH:MM` line on the session block so a reaper has a real end-time to use if `SessionEnd` never fires. |
| `SessionEnd`      | `self-wiki session close --hard`     | Final close, folds notes into topic pages. Idempotent + self-healing — tolerates duplicate or missing sentinels. |
| `UserPromptSubmit`| `self-wiki session switch --silent`  | Updates the session if the branch changed mid-session. |
| `UserPromptSubmit`| `self-wiki nudge`                    | Once per session, on the first prompt with zero notes, primes the model with the noting contract so it reaches for `self-wiki note` when an outcome lands. |

Task detection priority: current branch (`LPD-12345-foo` → `LPD-12345`) → `gh pr view` title → bare repo name.

## Optional integrations

Both are off by default. Self-wiki works fine without them.

### `gh` CLI

If `gh` is on your PATH and authenticated, `session open` enriches the detected task with the open PR's title.

```sh
gh auth login
```

### JIRA REST (ticket-title enrichment)

```sh
self-wiki config jira
# JIRA base URL: https://liferay.atlassian.net
# Env var holding the API token: JIRA_TOKEN
```

Then export the token in your shell — pulling it from your secrets manager of choice rather than hardcoding it. For example:

```sh
# plain export (least secure — token visible in shell history)
export JIRA_TOKEN="<your-token>"

# from a secrets manager (1Password, pass, Bitwarden, gnome-keyring, etc.)
export JIRA_TOKEN="$(your-secrets-cli read <your-vault-item>)"
```

Self-wiki only reads `$JIRA_TOKEN` (or whatever env var you configured); how it gets there is up to you.

Disable later with `self-wiki config jira --disable`.

## Daily commands

You normally don't run any of these — hooks and the skill handle them.

```sh
self-wiki status                          # is a session active?
self-wiki status --json                   # machine-readable
self-wiki note "<text>"                   # append a note (the skill does this)
self-wiki session switch -t LPD-22222     # manual task switch
self-wiki close-orphans                   # close any session blocks left dangling (today)
self-wiki close-orphans --all             # …or sweep every Daily/<date>.md
```

Claude Code's `SessionEnd` hook is best-effort — when a terminal is killed or closed without a graceful exit it never fires, leaving a `<!-- session-N-open -->` sentinel in the daily file. `Stop` runs every turn and stamps a `Last activity:` line, so even when `SessionEnd` is missed, `close-orphans` can finalize each block with a real end-time and an `Interrupted: ⚠️` marker. The reaper inside `session open` does the same automatically once a slot is older than 6h.

## Weekly reports

```sh
self-wiki report                          # current ISO week
self-wiki report --week 2026-W17          # specific week
self-wiki report --week 2026-W17 --dry-run  # print the synthesis prompt only
```

The deterministic time table and metrics are computed in code; the prose is synthesized by Claude (`claude -p`). The synthesis prompt lives at `src/templates/prompts/weekly-report.md` — edit it to taste.

## Topic pages

Topic pages auto-update at session close. To rebuild from scratch:

```sh
self-wiki rebuild-topics --topic LPD-12345
self-wiki rebuild-topics --all-tickets
self-wiki rebuild-topics --all-components
```

To register a recurring component:

```sh
self-wiki config component auth-provider --keywords "AuthProvider,auth provider"
```

Notes mentioning any keyword are then routed to `Components/auth-provider.md`.

## Configuration

| Path                                       | Purpose                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `~/.config/self-wiki/config.json`          | User-level: vault path, JIRA settings.                        |
| `~/.local/share/self-wiki/sessions/*.json` | One slot per active Claude session (managed by hooks).        |
| `<your-vault>/.self-wiki/config.json`      | Vault-level: ticket regex, components, soft-close window.     |

Customize the ticket regex if your project uses different prefixes.

## Parallel Claude Code sessions

Multiple Claude Code instances can run on the same machine simultaneously (e.g. one per repo). v0.1.1 keys session state by Claude's own session id (`$CLAUDE_SESSION_ID`), so each instance gets its own session block in the same daily file with no cross-contamination. Daily-file and topic-page writes are guarded by per-file locks (`proper-lockfile`), so concurrent `self-wiki note` calls are safe.

`self-wiki status` lists all active sessions when more than one is open. `self-wiki note "<text>"` resolves to the right session via `$CLAUDE_SESSION_ID` (set automatically inside Claude Code), and falls back to the unique active session matching the current working directory when the env var is unset. Pass `--claude-session-id <id>` only when two terminals share the same cwd.

## Upgrading

When a new version lands, pull, re-link, and re-run `init`:

```sh
cd /path/to/your/self-wiki/checkout
git pull
npm install
npm install -g .
self-wiki init /path/to/your/vault
```

The CLI itself updates as soon as you re-link. The skill file at `~/.claude/skills/wiki/SKILL.md`, the hook entries, and the `permissions.allow` entries in `~/.claude/settings.json` are user-managed copies, so `init` refreshes them: it overwrites the skill (after asking), replaces existing `self-wiki` hook entries in place — no duplication, no double-firing — and adds any missing `Bash(self-wiki …)` allow rules without touching unrelated permissions. Both diffs (hooks + permissions) are shown before `settings.json` is mutated; review before confirming. Third-party hooks/permissions are left untouched. The vault itself is never clobbered on re-run.

Re-running `init` after upgrading is a no-op when nothing changed, but it picks up new `Bash(self-wiki …)` permission rules (e.g. `close-orphans`) and refreshes the skill primer when the closing-summary phrase list grows. Daily logs, topic pages, and weekly reports are never touched.
