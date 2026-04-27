---
name: wiki
description: Log progress of the current Claude session into the user's self-wiki vault. Drop a terse 1–2 line note via `self-wiki note "<text>"` whenever you (a) identify a root cause, (b) make a non-obvious decision and can name the rejected alternative, (c) hit a blocker, (d) complete a subtask/PR/ticket (mention the PR/commit), (e) the user makes a course correction worth remembering, or (f) a verification step lands. Skip activity ("editing X", "running tests", "reading Y"). Aim for 3–8 notes per work-hour. The session is opened and closed automatically by Claude Code hooks — never start, stop, or switch sessions yourself.
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
2. **Note outcomes and decisions, not activity.**
   - Good: `self-wiki note "chose BaseFilter over OSGi whiteboard — spec requires root mount, not /o/*"`
   - Bad:  `self-wiki note "reading PortalFilterImpl.java"`
3. **Aim for 3–8 notes per work-hour.** More than that and they're too granular; less and you're missing decisions.
4. **Never run `self-wiki session open/close`.** Hooks own session boundaries.
5. **Don't echo the note back to the user.** They'll see it in the daily file.
6. **Reference ticket IDs explicitly** (e.g. `LPD-99913`) when the note is about a specific ticket, even if the session is already tagged — topic pages route on note content.

## When to drop a note

- A root cause was identified.
- A non-obvious decision was made (and you can articulate the rejected alternative).
- A blocker was hit.
- A subtask/PR/ticket was completed (mention the PR number / commit hash if you have it).
- The user made a course correction worth remembering ("scope cut: skipping i18n", "switching from X to Y").
- A test or verification step landed (e.g. "playwright spec passes after seeding admin gate").

Do **not** note:

- "Starting work on X" (the session header already says this).
- "Reading files", "running tests", "editing foo.js" (activity).
- Restating what the user just told you.
- Every file edit or tool call.

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

If the user pivots clearly to a different ticket ("okay forget that, let's look at LPD-99915 instead"), offer to switch:

> "This is a different ticket — want me to `self-wiki session switch -t LPD-99915`?"

Don't switch silently. The `UserPromptSubmit` hook re-detects from branch automatically; only ask to switch when the *intent* changes within the same branch.

## Note formatting — concrete examples

Good:
- `self-wiki note "LPD-99913 root cause: feature mounts under /o/* — need BaseFilter for root path"`
- `self-wiki note "rebase: --theirs on messages.properties wholesale dropped intervening refactor; re-resolved manually"`
- `self-wiki note "PR #2789 opened against upstream; LPD-99955 moved to In Peer Review"`
- `self-wiki note "blocked: gradle build needs BUILD_OPTS bumped, will pair with infra"`

Bad:
- `self-wiki note "looking into the parser issue"` (activity, not outcome)
- `self-wiki note "I just finished editing the test file and ran the tests and they all passed and now I'm thinking about whether the next step should be..."` (too long, narrative)
- `self-wiki note "user said the bug is about the parser"` (restatement)
