---
name: wiki
description: Log progress of the current Claude session into the user's self-wiki vault. Drop a terse 1–2 line note via `self-wiki note "<text>"` liberally — whenever the session produces something worth recalling later: a diagnosis, a decision, a blocker, a completion, a config or environment change, a preference the user persists, a lesson learned, a scope shift, or any concrete progress marker. When in doubt, note it — gaps cost more than redundancy. Skip only narration ("editing X", "running tests", "reading Y") and pure restatement of what the user just said. The session is opened and closed automatically by Claude Code hooks — never start, stop, or switch sessions yourself.
user-invocable: true
allowed-tools:
  - Bash(self-wiki status)
  - Bash(self-wiki status *)
  - Bash(self-wiki note *)
  - Bash(self-wiki note --claude-session-id *)
  - Bash(self-wiki session switch)
  - Bash(self-wiki session switch *)
---

# wiki — autonomous session logging into the user's self-wiki vault

`self-wiki` runs as Claude Code hooks. SessionStart auto-opens a session block in today's `Daily/<date>.md` (detecting the task from the current branch). SessionEnd closes it and folds notes into `Tickets/*.md` / `Components/*.md`. **Your job is to drop terse decision/outcome notes during the session.** You never start, stop, or switch sessions yourself unless the user explicitly asks.

## The rules

1. **Notes are 1–2 lines, terse, factual.** Write like a git commit subject. If a note needs more than two lines, it's two notes or it belongs in the weekly report, not a note.
2. **Note liberally. When in doubt, note it.** Gaps in the daily log are expensive (you can't summarize what wasn't recorded); redundancy is cheap. Don't gatekeep notes behind "is this important enough" — if a future-you reading the daily log would want to know it happened, log it.
3. **Skip only narration and restatement.** Don't note "reading X", "running Y", "editing Z" — the diff and the tool calls already capture activity. Don't echo back what the user just told you.
4. **Never run `self-wiki session open/close`.** Hooks own session boundaries.
5. **Don't echo the note back to the user.** They'll see it in the daily file.
6. **Reference ticket IDs explicitly** (e.g. `LPD-12345`) when the note is about a specific ticket, even if the session is already tagged — topic pages route on note content.

## When to drop a note

Anything in this list is worth a note. The list is illustrative, not exhaustive — if it feels like progress or context worth preserving, log it.

- **Diagnosis / root cause** — what was broken and why.
- **Decision** — what you chose and (when useful) what you rejected. No "rejected alternative" gate; a decision worth recording is worth recording on its own.
- **Blocker / surprise / weirdness** — anything that stalls progress or contradicts a prior assumption.
- **Completion** — subtask done, PR opened/updated, branch pushed, tests green, formatter clean, security review clear. Name the artifact (PR number, commit, test count).
- **Course correction or preference persisted** — the user changed scope, switched approach, or asked you to remember something. Memory updates count.
- **Config / environment change** — credentials wired, dependency added, env var set, CI hook adjusted, gradle tweak.
- **Verification result** — test passed/failed, manual check on staging, security review outcome.
- **Lesson learned** — a takeaway you don't want to repeat ("never use --theirs wholesale on diverged branches").
- **Scope decision** — cut, defer, expand, parked. Name the boundary.
- **Progress marker** — a meaningful intermediate state ("rebase onto master clean, 7 commits", "all 4 playwright tests green on clean db").

Do **not** note:

- "Starting work on X" (the session header already says this).
- "Reading files", "running tests", "editing foo.js" — pure activity. *But:* the result of the test or the conclusion from the read absolutely is a note.
- Restating what the user just told you.
- Every individual file edit or tool call.

## Workflow

Before your first note in a session, sanity-check:

```bash
self-wiki status
```

- `active: ...` → drop notes as decisions land.
- `idle` → the SessionStart hook didn't fire (rare). Tell the user once and keep working; don't try to open a session yourself.
- `soft-closed: ...` → the hook will reopen it on the next prompt; you don't need to do anything.
- `active sessions: N` (multiple lines) → the user has parallel Claude Code sessions running. `self-wiki note "<text>"` routes to the right one automatically: the SessionStart hook exports `$CLAUDE_SESSION_ID` into your bash env, and `note` reads it. If you ever see a "multiple active sessions" error, the env var wasn't set — pass `--claude-session-id "$CLAUDE_SESSION_ID"` explicitly as a fallback.

## Switching tasks mid-session

If the user pivots clearly to a different ticket ("okay forget that, let's look at LPD-22222 instead"), offer to switch:

> "This is a different ticket — want me to `self-wiki session switch -t LPD-22222`?"

Don't switch silently. The `UserPromptSubmit` hook re-detects from branch automatically; only ask to switch when the *intent* changes within the same branch.

## Note formatting — concrete examples

Good:
- `self-wiki note "LPD-12345 root cause: handler runs before auth filter — wrong ordering in the filter chain"` (diagnosis)
- `self-wiki note "rebase: --theirs on messages.properties wholesale dropped intervening refactor; re-resolved manually"` (lesson)
- `self-wiki note "PR #123 opened upstream; LPD-12346 moved to In Peer Review"` (completion)
- `self-wiki note "blocked: build needs BUILD_OPTS bumped, will pair with infra"` (blocker)
- `self-wiki note "preference persisted: /pr skill should push to upstream remote, not personal-fork; memory note updated"` (course correction)
- `self-wiki note "API_USER/API_TOKEN wired into ~/.bashrc via 'op read …' — /pr can update tickets end-to-end"` (config)
- `self-wiki note "all 4 e2e playwright tests green on clean db — earlier failure was residual state from manual admin clicks"` (verification + lesson)
- `self-wiki note "scope cut: LPD-12347 third-party only; banner suppression deferred to LPD-12348"` (scope)

Bad:
- `self-wiki note "looking into the parser issue"` (narration, no outcome yet)
- `self-wiki note "I just finished editing the test file and ran the tests and they all passed and now I'm thinking about whether the next step should be..."` (too long, narrative — the *result* of the test is the note: "auth-middleware test green")
- `self-wiki note "user said the bug is about the parser"` (restatement; if the user's input changed scope or persisted a preference, note *that*, not their literal words)
