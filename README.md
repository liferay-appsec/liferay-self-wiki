# self-wiki

A self-writing personal wiki for engineers. Just run `claude` inside a repo — your work is captured into daily logs, topic pages, and weekly reports automatically. Zero per-session commands.

The model: Claude Code hooks frame sessions; a skill instructs Claude to drop terse decision/outcome notes during work; a CLI synthesizes weekly reports and rebuilds topic pages on demand.

## What you get

Inside the vault directory you chose, `init` creates:

```
<your-vault>/
  Daily/YYYY-MM-DD.md          ← session log, source of truth
  Reports/YYYY-Www.md          ← weekly synthesis (run `self-wiki report --week`)
  Reports/YYYY-MM.md           ← monthly synthesis (run `self-wiki report --month`)
  Tickets/EXAMPLE-NNN.md       ← grows across sessions
  Components/<slug>.md         ← cross-ticket recurring areas
  Reviews/YYYY-cycleN.md       ← cycle self-review draft (run `self-wiki self-review`)
  .self-wiki/config.json       ← ticket regex, components, soft-close window
```

### Daily log

The daily file is the source of truth — one markdown file per day, one session block per Claude Code session, one `- Note [HH:MM]:` line per terse decision/outcome Claude drops as the work lands.

**Example output:**

```markdown
## Session 1 — Task: EXAMPLE-001 — extract OAuth provider interface
- Started: 09:00
- Note [09:18]: Re-read the four call sites that touch the legacy `oauthClient` directly. They all want the same three methods (`getAccessToken`, `refresh`, `revoke`) — the rest is private.
- Note [11:55]: PR #421 opened against main. CI green on first push.
- Ended: 12:08
- Duration: 188 min
- Completed: ✅

## Session 3 — Task: EXAMPLE-003 — weekly CI coverage signal
- Started: 15:30
- Note [15:47]: Started on a small CI workflow that posts the diff in coverage against main as a PR comment.
...
<!-- session-3-open -->
```

[→ Full example: docs/examples/daily-log.md](docs/examples/daily-log.md)

### Weekly report

Run `self-wiki report --week` and the week's daily logs collapse into themes, decisions, lessons, and carry-over — the metrics block (PR refs, force-push count) is computed in code; the prose synthesis comes from `claude -p`.

**Example output:**

```markdown
## Theme of the week

The week's centre of gravity was the OAuth provider refactor (`EXAMPLE-001`). The session-expiry race fix (`EXAMPLE-002`) was a one-day detour driven by an inbound bug.

| Ticket        | Layer           | Outcome                                                              |
| ------------- | --------------- | -------------------------------------------------------------------- |
| `EXAMPLE-001` | Auth / provider | PR #421 opened; `Provider` interface landed; four call sites next.   |
| `EXAMPLE-002` | Auth / session  | PR #422 merged; single-flight lock; regression test added.           |

## Notable architectural decisions

- **`EXAMPLE-001` — `Provider.refresh` mutates in place rather than returning a fresh client.** Caller mental model stays singleton.
...
```

[→ Full example: docs/examples/weekly-report.md](docs/examples/weekly-report.md)

### Monthly report

A themed synthesis at `Reports/<YYYY-MM>.md`, consumed by `self-wiki self-review` as the primary input for the cycle draft. See [→ Full example: docs/examples/monthly-report.md](docs/examples/monthly-report.md).

### Self-review draft

At the end of a Liferay review cycle, `self-wiki self-review` drafts the three Liferay-form-shaped sections from the in-cycle monthlies, weeklies, and topic pages — paste-ready, with every accomplishment tagged against the five Liferay values and a `## Sources` provenance footer.

**Example output:**

```markdown
## 1. What have you accomplished since your last review? What work are you proud of?

- **Designed and shipped the OAuth `Provider` interface and migrated all four legacy call sites (`EXAMPLE-001`, PRs #421, #427, #428, #431, #436)** *(source: `Reports/YYYY-04.md`, `Reports/YYYY-W14.md`, `Tickets/EXAMPLE-001.md`)* — Produce Excellence, Stay Nerdy
- **Diagnosed and fixed a cross-tab session-expiry race (`EXAMPLE-002`, PR #422), with a two-tab regression test that doubled as the repro fixture** *(source: `Reports/YYYY-04.md`, `Tickets/EXAMPLE-002.md`)* — Produce Excellence
- **Mentored a junior engineer on my team through the W15 call-site migrations, pairing on the first two and code-reviewing the rest** *(source: `Reports/YYYY-04.md`, `Reports/YYYY-W17.md`)* — Lead by Serving, Value People
...
```

[→ Full example: docs/examples/self-review.md](docs/examples/self-review.md)

## What gets logged in your vault

self-wiki only ever writes into the vault directory you chose at `init` time. Here's exactly what lands in it.

### Captured

- branch name detected from `git rev-parse --abbrev-ref HEAD`.
- ticket IDs matched by your configured `ticketRegex` (default `\b(LPD|LPP|LPS|LRELEASE)-\d+\b`, customizable in `.self-wiki/config.json`).
- the text of every `self-wiki note "<text>"` line dropped during the session — written into the daily file as `- Note [HH:MM]: <text>`.
- session start/end times, durations, and completion status (`Completed: ✅` or `Interrupted: ⚠️`).
- switch lines when you change tasks mid-session (`- Switched: HH:MM → <newTask>`).
- force-push counts (derived deterministically from `self-wiki note` lines that mention force-pushing; surfaced in the weekly and monthly metrics blocks).
- PR titles (only if `gh` is configured) — fetched by `gh pr view --json title` during `session open`; requires `gh` on PATH and authenticated.
- JIRA ticket titles (only if JIRA is configured) — fetched via the JIRA REST API during `session open`; requires `self-wiki config jira` to have run and `$JIRA_TOKEN` to be exported.

### Not captured

- file diffs, patches, or commit content — self-wiki never reads your working tree's file contents.
- your prompts to Claude — the conversation transcript is not parsed into the daily log.
- Claude's responses — not parsed into the log either.
- environment variables, shell history, or anything outside the vault directory.

Before sharing a screenshot, open the daily file and delete any note line you want to keep private — daily files are plain markdown.

**Nothing leaves your machine automatically.** self-wiki itself makes no network calls. `claude -p` is invoked only when you explicitly run a synthesis command (`self-wiki report`, `self-wiki self-review`). `gh` and JIRA are read-only, opt-in, and only invoked during `session open` to enrich the detected task. Your daily logs never leave your vault unless you copy them out.

## Install

Self-wiki is distributed as a clone-and-link Node CLI (no npm registry publish). Requires Node 20+.

Pick any directory you want as your vault — an existing Obsidian vault, a new folder, anywhere on disk. Self-wiki creates the subfolders it needs and otherwise leaves the directory alone.

```sh
git clone https://github.com/liferay-appsec/liferay-self-wiki.git self-wiki
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

Pass `--no-set-default` to skip step 5 — the vault scaffolds and the seed lands, but the user-config vault path is left alone. Useful for tmp/test vaults and acceptance harnesses where you don't want `init` to repoint the user's daily session lifecycle at a throwaway directory.

Contributors: see [CONTRIBUTING.md](CONTRIBUTING.md) for the dev flow (`npm link`) and the test bar.

## How sessions get framed

| Hook              | Command                              | What it does                                           |
| ----------------- | ------------------------------------ | ------------------------------------------------------ |
| `SessionStart`    | `self-wiki session open`             | Detects task from branch/PR, opens a session block.    |
| `Stop`            | `self-wiki session close --soft --block-on-tell` | Soft-close; reopens if a new prompt arrives soon. Stamps a `- Last activity: HH:MM` line so a reaper has a real end-time if `SessionEnd` never fires. With `--block-on-tell`, if the just-finished turn looks like a wrap-up ("PR opened", "tests green", "force-pushed", …) and no `self-wiki note` was logged, emits a Claude Code Stop-block JSON asking Claude to drop the note before yielding. Loop-safe via `lastBlockedTurnId` (the assistant leaf UUID won't be re-blocked). The reactive `pendingNudge` path remains as a fallback for older Claude Code versions. |
| `SessionEnd`      | `self-wiki session close --hard`     | Final close, folds notes into topic pages. Idempotent + self-healing — tolerates duplicate or missing sentinels. |
| `UserPromptSubmit`| `self-wiki session switch --silent`  | Updates the session if the branch changed mid-session. |
| `UserPromptSubmit`| `self-wiki nudge`                    | Once per session, on the first prompt with zero notes, primes the model with the noting contract so it reaches for `self-wiki note` when an outcome lands. |

Task detection priority: current branch (`LPD-12345-foo` → `LPD-12345`) → `gh pr view` title → bare repo name.

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

The deterministic metrics block (PR refs, force-push and test-add counts) is computed in code; the prose synthesis (themes, decisions, risks, carry-over) is produced by Claude (`claude -p`). The synthesis prompt lives at `src/templates/prompts/weekly-report.md` — edit it to taste.

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

## Troubleshooting

Run `self-wiki doctor` to diagnose your install. Each ✓/✗ is followed by a one-line remediation. Below: common symptoms keyed to specific doctor checks.

| Symptom | Doctor check | Fix |
| --- | --- | --- |
| Sessions not opening in new repos | `hooks merged in settings.json` ✗ or `i hooks:` drift line | run `self-wiki init --hooks-only` |
| No notes captured in the daily log | `vault config present` ✗ or `vault path exists on disk` ✗ | run `self-wiki init <vault>` |
| Approval prompts during `claude` turns | `permissions merged in settings.json` ✗ or `i permissions:` drift line | run `self-wiki init --permissions-only` |

## License

Apache 2.0. See [LICENSE](LICENSE) for the license text and [NOTICE](NOTICE) for copyright attribution.
