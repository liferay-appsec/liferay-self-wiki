---
phase: 02-monthly-report
fixed_at: 2026-05-08T00:00:00Z
review_path: .planning/phases/02-monthly-report/02-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 12
skipped: 1
status: partial
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-05-08
**Source review:** `.planning/phases/02-monthly-report/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 13
- Fixed: 12
- Skipped: 1 (WR-03 — out-of-scope by design per orchestrator instruction)

Full test suite (`node --test "test/"*.test.js`) passes after every fix, and also passes under `TZ=America/Los_Angeles` so the CR-03 timezone fix is verified in a non-UTC zone.

## Fixed Issues

### CR-03: `weeksInMonth` mixes UTC and local time, producing wrong ISO week

**Files modified:** `src/utils/format.js`
**Commit:** `4f375cf`
**Applied fix:** Switched `isoWeek` to read date components via `getUTCFullYear / getUTCMonth / getUTCDate` so the calendar-date conversion is consistent with the UTC arithmetic that follows. `weeksInMonth` passes UTC-anchored Dates; the prior local-tz reads shifted negative-offset zones to the previous calendar day before the ISO week math, flipping W52 ↔ W53 around month/year boundaries. Verified by re-running the format and report-month suites under `TZ=America/Los_Angeles`.

### CR-04: `reportWeekOrchestrator` reads each daily file twice with TOCTOU window

**Files modified:** `src/commands/report.js`
**Commit:** `c39477d`
**Applied fix:** Dropped the `access()` probe; let `readFile` be the single point of truth. The catch now requires `err.code === 'ENOENT'` to classify as "missing" — non-ENOENT errors (permission, I/O) surface instead of being silently re-bucketed. Closes the TOCTOU window between `access` and `readFile` and removes one of the two race surfaces enabling CR-01.

### CR-01: Internal weekly orchestrator can call `process.exit(1)` mid-monthly-run

**Files modified:** `src/commands/report.js`
**Commit:** `c2ca432`
**Applied fix:** When `internal === true` and `present.length === 0`, log a `warn: skipping <week> ...` to stderr and return early instead of calling `process.exit(1)`. Standalone (non-internal) callers retain the original exit-1 contract.

### CR-02: Unhandled `claudeHeadless` rejection in monthly backfill loop

**Files modified:** `src/commands/report.js`
**Commit:** `69087be`
**Applied fix:** Wrapped each `reportWeekOrchestrator(... internal: true)` call in a `try/catch`; on rejection, write `warn: backfill failed for <week>: <message>` and continue with the next missing week. This restores the "no partial state" invariant the gate-comment promises — a single mid-loop `claude -p` failure no longer aborts the surrounding monthly run.

### WR-01: `claudeHeadless` and `hasClaudeCli` had no timeout

**Files modified:** `src/core/claude.js`
**Commit:** `d33b255`
**Applied fix:** Added per-call timeouts. `claudeHeadless` defaults to 5 min (real model work), `hasClaudeCli` defaults to 5 s (noop probe). Both accept `opts.timeoutMs`. On expiry the child is sent SIGTERM, then SIGKILL after a 2 s grace period; the timer is `unref()`-ed so it never blocks the event loop on its own.

### WR-02: Source-grep structural-guard tests

**Files modified:** `test/report-month.test.js`
**Commit:** `dce42e8`
**Applied fix:** Kept the existing source-grep tests but added a documented rationale block at the top of that section explaining the trade-off: behavior coverage requires a `claude` CLI stub the project does not yet have (v0.1, "no test suite yet" per CLAUDE.md), so these guards prevent silent removal of the regenerated-marker, auto-backfill, dry-run-gate, and internal-flag invariants. Replace with end-to-end behavior tests once the stub infrastructure lands. (Per orchestrator instruction option (a).)

### WR-04: Dead `join('')` and unclear precedence in Sources line assembly

**Files modified:** `src/commands/report.js`
**Commit:** `867432d`
**Applied fix:** `sourceParts` always held exactly one element, so `sourceParts.join('')` was a no-op. Replaced with a straight conditional expression — one clause per data category (head, missing weeks, topic pages) — and removed the array indirection.

### WR-05: PR regex `\d{2,5}` truncates 6+ digit PR numbers

**Files modified:** `src/core/metrics.js`
**Commit:** `798d836`
**Applied fix:** Bumped digit upper bound to `\d{2,7}` (covers ~9.9M, well beyond any realistic project). Lower bound of 2 retained to keep `PR #5` noise out.

### WR-06: PR regex conflates GitHub issues with PRs

**Files modified:** `src/core/metrics.js`
**Commit:** `c9cf6c4`
**Applied fix:** Dropped the bare `#NNN` branch from the regex; PRs now require an explicit `PR` or `pull` prefix. Per CLAUDE.md the deterministic-metrics block is load-bearing — the synthesis prompt instructs the model to use `PRs touched` as-is, so accuracy here matters. The metrics fixture happens to mention PR #4521 with both `PR #4521` and a bare `#4521` reference; the bare reference is dropped but #4521 is still detected via the explicit prefix on a different line, so the existing test passes unchanged.

### WR-07: `loadInMonthTopicPages` substring match is fragile

**Files modified:** `src/commands/report.js`
**Commit:** `23b163e`
**Applied fix:** Replaced `raw.includes('## ${date} ')` (depended on a literal trailing space) with a multiline `^## (date|date|...)\\b` regex over all in-month dates. Decouples the consumer from `topics.js#appendDatedSection`'s trailing-text choice; a future format tweak (`: Session` instead of `— Session`, or no separator) will not silently drop topic pages from monthly synthesis. `escapeRegex` imported from `src/utils/regex.js` to safely interpolate the date list.

### WR-08: `anyDailyExists` masks non-ENOENT errors

**Files modified:** `src/commands/report.js`
**Commit:** `9bbe9d7`
**Applied fix:** Replaced the bare `catch {}` with `catch (err) { if (err.code !== 'ENOENT') throw err; }`. Permission flaps and other I/O errors now surface instead of being silently rebucketed as "no daily exists" (which would have caused the auto-backfill loop to skip a week the user simply could not read). Kept `access()` as the existence probe — cheaper than a tiny `readFile` and ENOENT is the only legitimate "missing" signal anyway.

### WR-09: `--out` path validation

**Files modified:** `src/commands/report.js`
**Commit:** `b193dc6`
**Applied fix:** Added a `resolveOutPath()` helper that resolves the user-supplied path against the vault root. When the resolved target is outside the vault prefix, log `warn: --out path is outside the vault: <path>` to stderr (without blocking — dumping to `/tmp` for inspection is a legitimate use). Applied to both weekly and monthly orchestrator output paths so the CLAUDE.md "don't write to topic pages outside `src/core/topics.js`" rule is enforced consistently across `--out` usage.

## Skipped Issues

### WR-03: `formatHHMM` / `todayISO` (local) vs `todayUTC` / `currentMonthUTC` (UTC) — silent inconsistency

**File:** `src/utils/format.js:1-7` vs `src/commands/report.js:153-161`
**Reason:** Skipped per orchestrator instruction — "wider-scope architectural decision; document the inconsistency in REVIEW-FIX.md but leave fixing as out-of-scope (defer to a future phase) unless the fix is trivially mechanical."
**Original issue:** The codebase mixes local-tz and UTC idioms inconsistently:
- `formatHHMM` (used by daily-log writer) uses `toLocaleTimeString` (local)
- `todayISO` uses `getFullYear / getMonth / getDate` (local) — drives daily file naming
- `todayUTC` and `currentMonthUTC` (in `report.js`) use UTC — drive monthly partial-month detection

Around local midnight in non-UTC zones, the daily-file naming (local) and monthly partial-month detection (UTC) can disagree by one day, producing surprising output (e.g. "Partial month note added the day after the month nominally ended"). The README's user-facing model is "today's daily file" — users reason in local time, so `todayUTC` may be the wrong default for partial-month detection.

**Recommended follow-up (out of scope here):** Pick one timezone semantics for all user-facing time helpers. Most likely correct choice is local time everywhere user-facing (matches the daily file naming the user sees), with UTC reserved for internal serialized timestamps in state. That requires touching `report.js#todayUTC` and `report.js#currentMonthUTC`, the partial-month detection logic, and likely a CLAUDE.md note. Not a one-line mechanical fix.

The fix is also not strictly required for v0.1 correctness — both code paths are internally consistent, the cross-path discrepancy only manifests in narrow time windows around local midnight, and the partial-month note is informative not load-bearing.

## Notes for verifier

- All 12 applied fixes pass syntax check (`node -c <file>`) and behavior check (`node --test test/<affected>.test.js`).
- Full suite (`node --test "test/"*.test.js`) goes from 171 pass / 0 fail at baseline to 171 pass / 0 fail after every fix.
- Suite also passes under `TZ=America/Los_Angeles`, validating the CR-03 timezone fix in a non-UTC zone (the existing suite was UTC-coincidence-clean before).
- No new tests added; behavior-coverage gaps for the auto-backfill `try/catch` (CR-02) and the `--out` warn (WR-09) require a `claude` stub which is out of scope for v0.1 (per CLAUDE.md). The structural-guard tests in `report-month.test.js` cover the runtime branch presence; the explanatory comment block added by WR-02 documents the trade-off.
- WR-03 deferred per orchestrator instruction; rationale and recommended follow-up captured above.

---

_Fixed: 2026-05-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
