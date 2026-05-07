# Codebase Concerns

**Analysis Date:** 2026-05-07

Scope: full repo (`/home/me/dev/projects/liferay-self-wiki`). No `TODO`/`FIXME`/`HACK`/`XXX` markers were found via Grep — concerns below are derived from reading the implementation, the architectural rules in `CLAUDE.md`, and the recent commit topics (report iteration, Stop-block nudge).

## Architectural Invariants to Preserve (from CLAUDE.md "What NOT to do")

These are not bugs today — they are constraints whose violation would silently destroy the design. Anyone touching the relevant files should treat them as load-bearing.

**Don't add `pid` liveness checks to state.**
- Files: `src/core/state.js`, `src/commands/session.js`, `src/commands/status.js`.
- Why: self-wiki has no daemon. Sessions are framed entirely by Claude Code hooks (`SessionStart` / `Stop` / `SessionEnd` / `UserPromptSubmit`). The pomo lineage tempts a contributor to add `pid` + `process.kill(pid, 0)` liveness, which would race against hook ordering and create false "stale" sessions.
- Current safeguard: `reapStaleSlots` in `src/commands/session.js:309` uses an age-based threshold (`REAPER_AGE_MS = 6h`) instead of liveness probes — this is the correct shape and should not be replaced.

**Don't write to topic pages outside `src/core/topics.js`.**
- File: `src/core/topics.js`.
- Why: `appendDatedSection` in `src/core/topics.js:123` has subtle invariants — idempotent re-runs, section-marker collision handling at line 140, lookbehind regex at line 141, `escapeRegex` for the date string. Bypassing it (e.g. writing markdown directly from a command) would silently break re-fold idempotency.
- Current callers: `updateTopicsForSession` (`src/core/topics.js:12`), called from `src/commands/session.js:204` (hard-close), `src/commands/update-topics.js:21`, `src/commands/close-orphans.js:28`, and `src/commands/session.js:333` (reaper). All correct.

**Don't invent content in the weekly-report prompt.**
- File: `src/templates/prompts/weekly-report.md`.
- Why: the deterministic vs. model split is the core trustworthiness contract. `METRICS` (PR refs, force-push count, session counts) is computed in `src/commands/report.js:70-106`; prose synthesis is bounded by the "No invention" rule at `weekly-report.md:29` and the prompt-injection-resistance rule at `weekly-report.md:28`. Loosening either breaks the report's evidentiary value.

**Never call `self-wiki session open` from inside the skill.**
- File: `src/templates/skill/SKILL.md`.
- The autonomy boundary is the hook (`src/templates/hooks.json:3-9`). The skill's `allowed-tools` list (`SKILL.md:5-11`) intentionally omits `session open` / `session close`. Adding either would let the model double-open sessions and corrupt the daily file.

## Tech Debt

**Stale "no test suite" claim in `CLAUDE.md`.**
- Files: `CLAUDE.md` (the "Testing locally" section says "There is no test suite yet (v0.1)").
- Reality: `test/*.test.js` is ~1939 lines covering session lifecycle, logger, log-parser, topics, nudge, stop-detector, state, paths, format, config — a substantial suite wired through `npm test` (`package.json:20`).
- Impact: contributors are misled into manual-only verification and may skip writing tests for new code.
- Fix: replace the section with `npm test` and a one-line description of coverage gaps (see "Test Coverage Gaps" below).

**Stale README metrics claim.**
- File: `README.md:118` claims weekly-report metrics include "test-add counts".
- Reality: `src/commands/report.js:70-106` computes only sessions, tickets, PR refs, and force-push mentions. No `tests-added` counter exists anywhere in the source.
- Impact: low (readers expect a metric the tool doesn't produce).
- Fix: remove "test-add counts" from the README, or implement it (parse `\b\d+\s+(?:new\s+)?tests?\s+(?:added|passing)\b` from notes in `report.js:buildMetrics`).

**`reportCommand` never refreshes the prior-report when synthesis fails.**
- File: `src/commands/report.js:62-67`.
- Behavior: `await claudeHeadless(prompt)` either resolves to a string (written verbatim) or rejects (un-caught — bubbles up to the top-level handler in `src/cli.js:126-129`). If `claude -p` returns an error mid-stream, the prior report is left untouched but the user only sees `error: claude -p exited with code N` with no hint about partial output.
- Impact: low; recoverable by re-running.
- Fix approach: catch the rejection in `reportCommand`, write a `.partial` file with whatever stdout was captured, and surface the path.

**`closeOrphanedSentinels` rebuilds two sentinel-scan loops.**
- File: `src/core/logger.js:130-135`.
- The function first runs a global `sentinelRe.exec(working)` to collect numbers, then for each number calls `findBlock(working, n)`. After each successful close, `working` is mutated, but the original number set was collected against the un-mutated text — fine in practice (numbers don't change), but the duplicate scan could be folded into a single pass. Cosmetic.

## Known / Latent Bugs

**`countSessionsTodayUnlocked` is racy across concurrent `SessionStart` hooks for the same UTC day.**
- File: `src/core/logger.js:9-25`.
- Mitigation: `withLock` (`src/core/lock.js`) wraps `openSessionBlockAtomic`, so within a single `proper-lockfile` lease the count→append is atomic.
- Residual risk: `proper-lockfile` uses a `<file>.lock` directory and a 30s `stale` timer (`src/core/lock.js:5-9`). On a busy laptop with two Claude Code instances simultaneously firing `SessionStart` against the same vault on the same day, contention is bounded by `retries: 50, maxTimeout: 200` (max ~10s of retry). If the lock genuinely goes stale (process killed mid-write), both writers can briefly believe they own it; the loser's `appendFile` will land at the end of the file but its `sessionNumber` may collide with the winner's. The sentinel-based parser (`log-parser.js:34`) tolerates duplicate `## Session N` headers because it splits on `^## Session ` and processes each block independently, but `closeSessionBlock`/`appendNote` use `findBlock` which finds only the *first* match (`logger.js:163-166`) — the second collision-block's sentinel would never be closed and would only be cleaned up by `close-orphans` or the 6h reaper.
- Likelihood: low (requires kill -9 mid-open). Worth an explicit comment in `logger.js`.

**`composeClosedBlock` `escapeRe(tag)` over a regex-special string.**
- File: `src/core/logger.js:187, 209-211`.
- The sentinel `<!-- session-N-open -->` contains `-` chars which are benign outside character classes but `escapeRe` covers them anyway. Behavior is correct; just confirming this is intentional.

**`appendNote` and `appendSwitch` use `raw.replace(tag, () => line)`.**
- File: `src/core/logger.js:69-72, 83-85`.
- Replaces only the first occurrence of `tag`. If a daily file ever contains *two* unclosed sentinels for the same N (cross-process collision above, or a malformed manual edit), the note attaches to the first; the second remains an orphan.
- Documented self-healing path: `close-orphans` + the 6h reaper. Acceptable for v0.1.

**Soft-reopen window uses `Date.now()` against ISO timestamp.**
- File: `src/commands/session.js:278-279`.
- `closedAt` is an ISO string; `new Date(existing.closedAt).getTime()` will return `NaN` if `closedAt` is somehow null/undefined, making `minutesSinceClose = NaN`, and `NaN > X` is always false → soft-reopen silently rejected. Defensive but masks state corruption. Adding a `Number.isFinite(minutesSinceClose)` guard (or treating non-finite as "do not reopen") would make the failure mode explicit in `src/core/error-log.js`.

**`log-parser.js` splits on `## Session ` literally.**
- File: `src/utils/log-parser.js:35`.
- A user-edited daily file with a heading like `## Session notes` (no number) would be split on, generating a malformed first block; the inner `headerMatch` (`log-parser.js:38`) requires `^(\d+) — Task:` so the malformed block is silently dropped — but its content (which followed `## Session`) is also lost from the parsed output. Topic rebuilds would skip those notes.
- Likelihood: low (the user has to manually inject that exact heading). Worth a tighter regex: `/^## Session (?=\d+ — Task: )/m`.

**`composeClosedBlock` "already closed and no sentinel" path is a no-op.**
- File: `src/core/logger.js:199-201`.
- If a block somehow has `- Ended:` already and no sentinel, `composeClosedBlock` returns the block unchanged — but it does *not* update or replace the existing `Ended:` line. `closeSessionBlock`'s caller path guards this at line 45-48 (early return if already closed), so the live behavior is fine. The defensive branch in `composeClosedBlock` is reachable only via `closeOrphanedSentinels` finding a block with `Ended:` but a stray sentinel — in which case `working.includes(tag)` is true and we never reach the no-op branch.

## Security Surface

**`detect.js` JIRA fetch — bearer-token transmission.**
- File: `src/core/detect.js:71-80`.
- Token is read from `process.env[jiraCfg.tokenEnvVar]` and sent as `Authorization: Bearer <token>` to a user-configured `baseUrl`. There is **no allowlist or scheme check** on `baseUrl` — a misconfigured config (e.g. `baseUrl: "http://attacker"`) would exfiltrate the bearer token over plaintext HTTP to an arbitrary host.
- Mitigation: `baseUrl` is set interactively via `self-wiki config jira` (`src/commands/config.js:54`), so the user types it themselves; risk is essentially user-error, not a remote attack vector.
- Recommendation: in `detect.js:tryJiraTitle`, reject any `baseUrl` that doesn't start with `https://`, and consider scoping the token to only the configured host (refuse if the URL post-template-substitution doesn't share the same origin).

**`exportSessionIdToHookEnv` writes to `$CLAUDE_ENV_FILE`.**
- File: `src/commands/session.js:83-92`.
- Sanitizes `claudeSessionId` against `/^[A-Za-z0-9._-]+$/` before appending — good. The line written is `export CLAUDE_SESSION_ID=<id>`, no quoting needed because of the regex constraint. No injection vector.

**`self-wiki note <text>` writes user-supplied text into markdown via `appendNote`.**
- Files: `src/commands/note.js:18`, `src/core/logger.js:61-73`.
- `text.trim()` is interpolated into a string template `- Note [HH:MM]: ${message}\n${tag}`. Markdown is the target format, so newlines in `message` would split a single note across lines — `appendNote` does **not** strip or escape newlines. A malicious caller (or a model that pastes a multi-line completion as a note) can inject `\n## Session 99 — Task: fake` and confuse the parser.
- Realistic threat: the model is the primary caller, not an adversary. But the parser's confusion would be silent (orphaned content under a phantom session header).
- Fix approach: in `appendNote`, replace `\r?\n` in `message` with a single space (or HTML `<br>`) before composition.

**`appendNote` `replace(tag, () => line)` callback form.**
- File: `src/core/logger.js:71`.
- The function-form callback (vs. string replacement) avoids `$N` substitution from interpreting `$&`/`$1` in user notes. This is correct and explicitly commented at `logger.js:70`. Don't regress this when refactoring.

**`fetch` to JIRA has no timeout.**
- File: `src/core/detect.js:76`.
- A hung JIRA host stalls `session open` (which is in the `SessionStart` hook critical path). The hook command shell-wraps with `|| true` (`src/templates/hooks.json:6`), so the user-visible blast radius is "Claude Code's session start is delayed for tens of seconds" — not a hang, but bad UX.
- Fix: add `AbortSignal.timeout(2000)` to the fetch call.

**`gh` and `git` invocations have no timeout.**
- File: `src/core/detect.js:43-69`.
- `tryGitBranch`, `hasGh`, `tryGhPrView` all use `promisify(execFile)` with no timeout. A misconfigured `gh` (e.g. requiring auth refresh, network-blocked) hangs `session open`. Same hook-critical-path problem.
- Fix: pass `{ timeout: 2000 }` to each `exec(...)` call.

## Performance Bottlenecks

**`rebuildTicketPage` / `rebuildComponentPage` re-parse every daily file per topic.**
- File: `src/core/topics.js:41-88`.
- `await listDailyDates()` then `await parseDailyFile(dateStr)` inside a `for` — sequential. A 1-year vault (~250 weekday daily files) parses 250 × N times for `rebuild --all-tickets` (one full sweep per ticket).
- Impact: O(daily_files × tickets) markdown reads. For 250 days × 50 tickets = 12,500 reads.
- Fix approach: in `collectAllTicketIds` / the rebuild loop, parse each daily file once into an in-memory map and iterate over tickets within that.

**`sessionMentionsAny` lowercases the entire haystack on every call.**
- File: `src/core/topics.js:113-121`.
- For each component, joined session text is `.toLowerCase()`'d. With M components and N sessions per file, that's M × N toLowerCase calls per rebuild. Trivial today (component count is small), but `appendDatedSection` calls `collectComponentsFromSession` per close — a 50-component vault would rescan the whole session each time.
- Fix: lowercase the haystack once per session, then `keywords.some(k => haystack.includes(k.toLowerCase()))`.

**Lock retries can total ~10s under contention.**
- File: `src/core/lock.js:6` — `retries: { retries: 50, factor: 1.2, minTimeout: 10, maxTimeout: 200 }`.
- Worst-case: 50 × 200ms = 10s of retry before giving up. In a hook on the critical path (`SessionStart`), 10s is noticeable.
- Acceptable today; flag if multiple Claude instances become a routine workflow.

## Fragile Areas

**`stop-detector.js` is brittle to Claude Code transcript schema changes.**
- File: `src/core/stop-detector.js`.
- Walks the JSONL transcript backward, expects shapes like `entry.message.role === 'assistant'`, `entry.message.content` array of `{ type: 'text' | 'tool_use', name: 'Bash', input: { command } }`, and `entry.uuid`.
- If Claude Code renames any of these (it has happened in past minor releases), the detector silently returns the empty default (`stop-detector.js:11`), the Stop-block JSON is never emitted, the second-chance nudge stops firing — and there is no error logged or surfaced. The whole "closing tells" feature degrades to a silent no-op.
- Files dependent on this contract: `src/commands/session.js:118-146` (soft-close path), `src/commands/nudge.js:31-41` (fallback nudge), `src/core/closing-tells.js`, `test/stop-detector.test.js`, `test/session.test.js:205-300`.
- Fix approach: emit a single warning (rate-limited via `error-log.js`) when `lines.length > 0` but no entry has a recognized assistant shape — that signals a schema drift.

**`looksLikeClosingSummary` regex list duplicated across three places.**
- Files: `src/core/closing-tells.js:8-25`, `src/templates/skill/SKILL.md:3, 20`, `src/commands/nudge.js:60-63`.
- The header comment in `closing-tells.js:4-6` already calls this out: "Keep this list in sync with the prose form in src/templates/skill/SKILL.md and src/commands/nudge.js." There is no programmatic enforcement; drift is inevitable.
- Impact: when a new tell is added to the regex list but not to SKILL.md, the model is never instructed to drop the note proactively, so the second-chance fallback fires more often than necessary. When added to SKILL.md but not to the regex, the detector misses real wrap-ups.
- Fix approach: either (a) add a test that asserts every regex pattern source matches at least one phrase quoted in SKILL.md, or (b) generate the SKILL.md prose from the regex list at build time.

**`composeClosedBlock` has four branches with subtle ordering.**
- File: `src/core/logger.js:179-201`.
- Strip `Last activity:` lines → if sentinel present, replace first + remove duplicates → else if not closed, append → else no-op. Comment markers (`// 1.` … `// 4.`) help, but any future change to closing semantics has to walk all four cases to stay idempotent. `test/logger.test.js` is the safety net; add a test for any new branch.

**Daily-log mutation depends on three sentinels co-existing.**
- File: `src/core/logger.js:6` — `sentinel(n) = '<!-- session-${n}-open -->'`.
- The contract: exactly one sentinel per open session, stripped on close. `closeOrphanedSentinels` and `composeClosedBlock` defensively handle duplicates. But a manual edit by the user that copy-pastes a session block (and its sentinel) into another day's file would create a same-N duplicate — `findBlock` finds only the first, leaving the second open forever. Current self-healing covers this only on the same day; cross-day duplicates would never close.
- Mitigation: README explicitly tells users not to manually edit Daily/. Acceptable.

**`reapStaleSlots` uses an absolute 6h threshold.**
- File: `src/commands/session.js:24, 309-353`.
- A long-running session (e.g. a planning session that legitimately spans 7 hours of wall-clock) will be force-closed as `interrupted` on the next `session open` from any Claude instance against the same vault. The user has no way to extend the threshold per-session.
- Fix approach: surface `REAPER_AGE_MS` in vault config (`src/templates/vault/.self-wiki/config.json`) so users can override.

## Hook Wiring Concerns

**Stop hook emits stdout into Claude Code's hook-decision stream.**
- Files: `src/templates/hooks.json:13` runs `self-wiki session close --soft --silent --block-on-tell || true`. `src/commands/session.js:171-174` writes `JSON.stringify(blockEmission) + '\n'` to stdout.
- The `--silent` flag in the hook command suppresses the human-readable success line (`session N soft-closed`) but **not** the JSON block emission — that's the whole point. This is correct, but the layering is non-obvious: a future contributor adding new stdout writes inside the soft-close path could accidentally feed Claude Code malformed JSON.
- Defensive: add a comment in `session.js` near line 171 reminding contributors that anything written to stdout in soft-mode is part of the hook protocol.

**`UserPromptSubmit` runs two `self-wiki` commands serially per turn.**
- File: `src/templates/hooks.json:24-30`.
- `self-wiki session switch --silent` then `self-wiki nudge`. Each command does its own `applyUserConfig` + `migrateLegacyState` + state read — adds ~30-100ms per turn on a cold laptop. Acceptable; flag only if hook latency complaints surface.

**`SessionEnd` is best-effort; documented but easy to forget.**
- File: `README.md:108` makes this explicit. The `close-orphans` reaper + 6h `reapStaleSlots` are the safety nets. If a future contributor removes either, terminated terminals leak open sentinels permanently.

## Test Coverage Gaps

**No test for the JIRA fetch path.**
- File: `src/core/detect.js:71-80`. `tryJiraTitle` does a real `fetch` — there is no mock or fixture in `test/`. Schema changes to JIRA's REST API are unguarded.
- Risk: low (the function returns null on any error path).

**No test for `claudeHeadless` failure modes.**
- File: `src/core/claude.js`. Behaviors not covered: child process ENOENT (claude not on PATH — there is `hasClaudeCli` but its error path isn't tested), child stderr inheritance, partial stdout on non-zero exit.
- Risk: medium — `report.js` swallows nothing and exits 1 on any reject.

**No test for the lock contention path.**
- File: `src/core/lock.js`. Concurrent `openSessionBlockAtomic` calls are not exercised. The race window described above (kill -9 mid-write) cannot be hit in unit tests without lock injection.
- Risk: low likelihood, high blast radius (silent block-collision).

**No test for `exportSessionIdToHookEnv`.**
- File: `src/commands/session.js:83-92`. The sanitization regex is the security boundary against injection into a sourced env file. Should have a test that an id like `; rm -rf /` results in either rejection or sanitization to underscores.

**No integration test for the full hook flow.**
- The four hook events (`SessionStart` → `Stop` → `UserPromptSubmit` → `SessionEnd`) are unit-tested individually, but no test simulates the full sequence with shared state. A regression like "session open writes a state file with key X, but session close reads key Y" would slip through current unit tests.

## Soft Dependencies — Failure Modes

**`gh` not installed or unauthenticated.**
- File: `src/core/detect.js:53-69`. Both `hasGh` and `tryGhPrView` swallow all errors. Detected task falls back to branch/repo. Correct degradation per the project rule "Soft dependencies degrade silently".

**`claude` CLI missing.**
- File: `src/commands/report.js:56-59`. `hasClaudeCli` early-exits with code 2. User-facing message is clear.
- File: `src/core/claude.js:25-31` — `hasClaudeCli` uses `spawn` with `stdio: 'ignore'`; `child.on('error', ...)` resolves false on ENOENT. Correct.

**JIRA token env var missing.**
- File: `src/core/detect.js:73`. Returns null silently — task falls back to PR title or branch. Correct.

**Hook payload malformed JSON on stdin.**
- File: `src/utils/hook-input.js:14-19`. `JSON.parse` failure returns null; caller falls back to `$CLAUDE_SESSION_ID` or `--claude-session-id`. Correct.
- Edge case: a 250ms timeout (`hook-input.js:4`) is short. If the hook is invoked under heavy load (e.g. a Mac with thermal throttling) and Claude Code is slow to write stdin, we time out and miss the session id. The fallback chain in `resolveSessionId` (`session.js:258-273`) covers this for `session open` (env var → cwd-match), but `note` and `nudge` rely solely on `readHookSessionId` (`note.js:26`, `nudge.js:22`) — under timeout, both silently no-op, the note is discarded, the user sees no error.
- Fix approach: bump default to 1000ms, or surface a stderr line on timeout.

## Scaling Limits

**Daily file size grows unbounded.**
- File: `src/utils/paths.js:50` — one `Daily/<date>.md` per day. A heavy day with 30 sessions and 200 notes is still kilobytes; not a real issue. But `parseDailyFile` reads the whole file into memory each time — fine until a day approaches MB scale (it won't).

**`listDailyDates` returns every file, sorted, every call.**
- File: `src/utils/log-parser.js:21-32`. Called from `rebuildTicketPage` (every rebuild), `rebuild --all-tickets` (once), `close-orphans --all` (once). At 1000 daily files, `readdir` + filter + sort is still <10ms. Fine.

**`sessions/` directory grows with each Claude instance.**
- File: `src/utils/paths.js:25-29`, `src/core/state.js:39-58`. Each Claude session id = one JSON file. `clearSession` unlinks on hard-close. Soft-closed slots persist until `reapStaleSlots` (6h). On a heavy day with 20 distinct Claude sessions and a crashed terminal, ~20 stale slots accumulate. `listActiveSessions` reads them all — at 100s of slots, still fast. Acceptable.

## Dependencies

**`proper-lockfile@^4.1.2`** — file-locking on a `.lock` directory; widely used, stable. No known issues.

**`commander@^14.0.0`** — major version bumps frequently; v14 is current as of analysis date. Hook command surface (`hooks.json`) is independent of Commander internals, so future bumps are low-risk.

**`chalk@^5.3.0`** — ESM-only since v5; aligns with `"type": "module"` in `package.json:5`. Used only in `src/commands/init.js`. No risk.

**No test framework dependency.** Tests use `node:test` (built-in). Migration to v22+ Node would surface any deprecated APIs there; today, fine.

## Missing Critical Features

**No `self-wiki status --vault` to check vault writability.**
- A user who renames their vault directory will see the next `session open` fail at `ensureVaultDirs` with no easy diagnostic. `self-wiki config show` is the closest equivalent (`src/commands/config.js:11-26`) but doesn't actually probe the vault path for write access.

**No backfill / repair command for malformed daily files.**
- If `parseDailyFile` encounters a malformed block, it silently drops it. There is no `self-wiki doctor` to surface "this daily file has 3 unparseable blocks". A user editing daily files manually would get silent data loss in topic rebuilds.

**No way to disable the `SessionEnd` hard-close in favor of soft-only.**
- Some users may prefer all-soft-closed sessions (rebuild on demand). The current hooks.json wires `SessionEnd → close --hard`. Workaround: edit `~/.claude/settings.json` after `init`. A vault-config flag would be cleaner.

---

*Concerns audit: 2026-05-07*
