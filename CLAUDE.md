# self-wiki — project conventions

Node 20+, ESM, Commander. Builds on patterns from `~/dev/tools/time-tracker` (pomo). Read the README for user-facing docs.

## What this tool does

A CLI (`self-wiki`) plus a Claude Code skill plus a set of Claude Code hooks. The hooks open/close session blocks in a daily markdown file inside the user's Obsidian vault; the skill instructs Claude to drop terse decision-notes during the session; the CLI synthesizes weekly reports and rebuilds per-ticket / per-component topic pages.

## Architectural rules

- **The autonomy boundary is the hook.** Session lifecycle (open/close/switch) is owned by Claude Code hooks. The skill never opens or closes a session itself. The CLI's `session open|close|switch` are designed to be hook entrypoints, not user commands.
- **Daily logs are the source of truth.** Topic pages and weekly reports are derivable from them. If we ever lose a topic page, `self-wiki rebuild-topics` rebuilds it. Never write to a topic page in a way that can't be reproduced from daily logs.
- **Deterministic vs. model.** Time tables, session counts, PR refs, and force-push counts are computed in code from parsed log structure. Prose synthesis (weekly themes, decision summaries) goes through `claude -p`. Don't ever ask the model to compute a number — give it the number.
- **Soft dependencies degrade silently.** `gh`, JIRA — if they're missing or fail, fall back to the next signal (branch parsing, bare repo name) and continue. Never fail a session-open because of an external API.
- **No `obsidian-cli`.** Direct `.md` writes only. Wikilinks (`[[…]]`) work in raw markdown.

## Repo layout

```
src/
  cli.js                       commander entry; subcommands wire to commands/
  commands/                    user-facing + hook-callable subcommands
    init.js                    scaffold vault + install skill + propose hooks
    session.js                 open / close / switch (hook entrypoints)
    note.js                    append note to active session block
    nudge.js                   one-shot primer on first prompt of an active session with zero notes (UserPromptSubmit hook)
    status.js                  read state for the skill
    report.js                  weekly synthesis via claude -p
    update-topics.js           fold last session into topic pages (called by SessionEnd)
    rebuild.js                 rebuild a topic page from daily corpus
    config.js                  user/vault config get/set
  core/
    state.js                   ~/.local/share/self-wiki/state.json (no pid liveness)
    config.js                  user + vault config layers, applyUserConfig at startup
    detect.js                  task detection: branch regex → gh PR → JIRA
    logger.js                  daily-file append/close (sentinel-comment based)
    topics.js                  incremental + rebuild for topic pages
    claude.js                  spawn `claude -p`
  utils/
    paths.js                   XDG paths + vault-relative paths
    format.js                  HH:MM, ISO date, ISO week, duration formatting
    log-parser.js              parse Daily/*.md into structured sessions
  templates/
    skill/SKILL.md             installed to ~/.claude/skills/wiki/SKILL.md
    hooks.json                 merged into ~/.claude/settings.json
    prompts/weekly-report.md   versioned synthesis prompt (iterable)
    vault/.self-wiki/config.json  seed vault config
```

## Patterns to follow when adding code

- **A new subcommand** lives in `src/commands/<name>.js`, exports an async function, is wired in `src/cli.js`. Top of every command: `await applyUserConfig(); ensureVaultConfigured();` (omit the second when the command should also work pre-init, like `config vault`).
- **Reading state** is `await readState()`. State has `{ status, dateStr, sessionNumber, task, ticketId, branch, cwd, repo, prNumber, claudeSessionId, startedAt, closedAt, nudgedAt? }`. There's no pid liveness — sessions are framed entirely by hooks. `nudgedAt` is set once by `self-wiki nudge` (on the first UserPromptSubmit of a session with zero notes) and exists only to gate one-shot reminders.
- **Daily-file mutations** go through `src/core/logger.js`. The sentinel comment `<!-- session-N-open -->` marks the open block; close functions replace it with end/duration/status lines. Never bypass the sentinel.
- **Parsing** goes through `src/utils/log-parser.js`. Extend `parseSessions` carefully — it returns the shape `topics.js` and `report.js` rely on.
- **Adding a hook** means: edit `src/templates/hooks.json` AND document the diff in the README's hook table. `init` merges idempotently — running it twice doesn't duplicate hooks.

## What NOT to do

- **Don't add `pid` liveness checks** to state. Pomo needs them because pomo has a foreground stopwatch process; self-wiki has no daemon. If you find yourself wanting one, you're working around a hook problem.
- **Don't write to topic pages outside `src/core/topics.js`.** The append-or-merge logic for dated sections has subtle invariants (idempotent re-runs, section markers).
- **Don't invent content in the weekly-report prompt.** The synthesis is constrained to evidence in the daily logs. If you change the prompt, preserve the "no invention" rule.
- **Never call `self-wiki session open` from inside the skill.** That's a hook's job. The skill calls `note`, `status`, and `session switch` only.

## Testing locally

There is no test suite yet (v0.1). Verify by:

1. `npm link` in this directory.
2. `self-wiki init /tmp/test-vault --yes` — vault scaffolds, skill installs, hooks merge.
3. `self-wiki session open --cwd /some/git/repo` then `self-wiki status` — should report active.
4. `self-wiki note "test note"` — appends to today's `Daily/<date>.md`.
5. `self-wiki session close --hard` — closes block, folds into `Tickets/<id>.md` if branch had a ticket.
6. `self-wiki report --week <YYYY-Www> --dry-run` — prints the synthesis prompt.

The plan that drove this implementation is at `~/.claude/plans/during-last-week-i-foamy-octopus.md`.
