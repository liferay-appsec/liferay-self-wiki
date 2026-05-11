<!--
This is a fictional scrubbed example for self-wiki.
`EXAMPLE-NNN` tickets are made up. For the full storyline see ../../README.md.
-->
<!-- vault config: { ticketRegex: 'EXAMPLE-\d+' } -->

# Daily/YYYY-MM-DD.md

## Session 1 — Task: EXAMPLE-001 — extract OAuth provider interface
- Started: 09:00
- Note [09:18]: Re-read the four call sites that touch the legacy `oauthClient` directly. They all want the same three methods (`getAccessToken`, `refresh`, `revoke`) — the rest is private. Going to land that as a `Provider` interface in this PR and migrate the call sites in follow-ups.
- Note [10:42]: Decided against making `refresh` return a fresh client (initial sketch). Caller mental model is simpler if `refresh` mutates in place — every caller already holds the same long-lived instance. Rejected: returning a new client (broke the singleton assumption in two call sites).
- Note [11:55]: PR #421 opened against main. CI green on first push. Tagged the platform team for review since the interface touches their session-store contract.
- Ended: 12:08
- Duration: 188 min
- Completed: ✅

## Session 2 — Task: EXAMPLE-002 — fix session-expiry race
- Started: 13:14
- Note [13:31]: Reproduced the race on a local two-tab repro. Concurrent `logout` + `refresh` can leave the session store with a zombie token row when the refresh races past the revoke. Going to add a single-flight lock around refresh keyed on the user id.
- Note [14:09]: Single-flight lock landed. The interesting bit is the failure mode without it — the refresh wins, the revoke writes `revoked_at`, and the next request sees a valid-looking token whose audit row says it's gone. Adding a regression test in `test/session-expiry.test.js` so this doesn't slip again.
- Note [14:48]: Force-pushed PR #422 after the reviewer asked for the lock scope to drop from "per session" to "per user id". Single fixup squashed into the original commit.
- Last activity: 14:50
- Ended: 14:51
- Duration: 97 min
- Interrupted: ⚠️

## Session 3 — Task: EXAMPLE-003 — weekly CI coverage signal
- Started: 15:30
- Note [15:47]: Started on a small CI workflow that posts the diff in coverage against main as a PR comment. The plan is one file in `.github/workflows/`, no new dependencies — just `c8` plus a `jq` script. Want this in before the next sprint review so the coverage trend is visible without anyone running it locally.
- Note [16:12]: Sketched the workflow but hit a permissions wall on writing PR comments from a fork. Going to revisit Monday with a smaller scope: post coverage to the run summary instead of the PR. PR #423 opened as a draft so the workflow can be reviewed even though the comment path is stubbed.
<!-- session-3-open -->
