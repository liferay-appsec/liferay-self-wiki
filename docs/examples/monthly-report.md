<!--
This is a fictional scrubbed example for self-wiki.
`EXAMPLE-NNN` tickets are made up. For the full storyline see ../../README.md.
-->

# Monthly Report — April YYYY

Sources: drew from `Reports/YYYY-W14.md`, `Reports/YYYY-W15.md`, `Reports/YYYY-W17.md`, `Tickets/EXAMPLE-001.md`, `Tickets/EXAMPLE-002.md`, and `Tickets/EXAMPLE-003.md`. Week YYYY-W16 is missing — the weekly was never generated (the engineer was off rotation that week).

## Theme(s) of the month

### Theme 1: OAuth provider refactor (`EXAMPLE-001` — multi-week thread)

| Ticket / Topic | Layer           | Outcome                                                                                     |
| -------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `EXAMPLE-001`  | Auth / provider | PR #421 merged (W14); four call sites migrated across PRs #427, #428, #431, #436 (W15–W17). |
| `EXAMPLE-002`  | Auth / session  | PR #422 merged (W14); single-flight lock; regression test still passing at month close.     |

The auth refactor was the dominant thread of the month. Started in W14 by extracting a small `Provider` interface from the legacy `oauthClient` (PR #421), then carried four call-site migrations across W15 and W17. The interface shape held without revision once the first two migrations went in — the rejected alternative of returning a fresh client from `refresh` would have forced a singleton-breaking change in two of those four sites, validating the W14 decision. The session-expiry race fix (`EXAMPLE-002`) sits inside this theme because the bug surfaced inside the legacy paths the refactor is replacing; the regression test it added in W14 is the safety net the migrations relied on.

### Theme 2: CI feedback signal (`EXAMPLE-003` — late-month tooling thread)

| Ticket / Topic | Layer        | Outcome                                                                       |
| -------------- | ------------ | ----------------------------------------------------------------------------- |
| `EXAMPLE-003`  | CI / tooling | Draft PR #423 in W14; merged in W17 once fork-permission scope was clarified. |

A late-month tooling thread that started as a draft PR in W14 (blocked on fork-permission scope for PR comments) and landed in W17 after the smaller scope — posting coverage diffs to the GitHub Actions run summary — was agreed. The PR-comment path is still open as carry-over.

## Notable architectural decisions

- **`EXAMPLE-001` — `Provider.refresh` mutates in place rather than returning a fresh client** (YYYY-W14). The decision held across all four call-site migrations without revision. Rejected: returning a new client (would have broken the singleton assumption in two of the four sites).
- **`EXAMPLE-002` — single-flight lock scoped to user id, not session id** (YYYY-W14). The reported race was cross-tab on the same user, so locking at session-id would have missed it. Rejected: per-session lock (caught the obvious repro but not the reported one).
- **`EXAMPLE-003` — post coverage to the GitHub Actions run summary, not as a PR comment** (YYYY-W17). The PR-comment path is blocked on org-level fork permissions; the run-summary path delivers the same signal without the permissions wait. Rejected: blocking the workflow on the permissions question (would have left the coverage signal unbuilt for the entire month).

## Process / tooling improvements

- **Regression tests for concurrency bugs use a two-tab repro pattern** (`test/session-expiry.test.js`, YYYY-W14). The repro is the test, not a separate fixture. Pattern repeated successfully when the W15 migrations hit a similar two-flow race.
- **Coverage delta in the GitHub Actions run summary** (YYYY-W17). One workflow file, no new external dependencies. The PR-comment path remains open as a follow-up once fork-permission scope is settled.

## Lessons learned

- **Single-flight scope follows the data, not the request** (from YYYY-W14). The initial sketch locked at session-id; the reported race was cross-tab, so it missed. Rule of thumb: lock the smallest entity that owns the contested write.
- **Force-push fixups beat new commits when the change is a scope tweak the reviewer flagged** (from YYYY-W14). Keeps the rollback target small and the merge history readable.
- **Interface shape held across four migrations without revision** (from YYYY-W17). Worth the up-front session-1 effort to enumerate every call site before drawing the interface — the discipline showed up as zero rework in the migrations that followed.

## Risks / carry-over

- `EXAMPLE-003` PR-comment path still open at month close (`YYYY-W17`). Draft is gone — the run-summary path covers the signal — but the fork-permissions question remains unanswered. Carrying into next month with low priority unless a reviewer asks.
- W16 is a true gap in the source set (engineer off-rotation), not a dropped thread. Verified against `Tickets/EXAMPLE-001.md` — no migrations happened that week, so no synthesis is missing.

## Quick metrics

- Sessions: 38
- Tickets: EXAMPLE-001, EXAMPLE-002, EXAMPLE-003
- PR refs: #421, #422, #423, #427, #428, #431, #436
- Force-pushes: 4
- Days-with-logs: 17
- Components touched: auth-provider, ci-tooling

## Sources

### Weekly reports
- `Reports/YYYY-W14.md`
- `Reports/YYYY-W15.md`
- `Reports/YYYY-W17.md`

### Topic pages
- `Tickets/EXAMPLE-001.md`
- `Tickets/EXAMPLE-002.md`
- `Tickets/EXAMPLE-003.md`
