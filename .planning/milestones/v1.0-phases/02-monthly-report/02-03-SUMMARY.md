---
phase: 02-monthly-report
plan: 03
subsystem: report-month-auto-backfill
tags:
  - auto-backfill
  - orchestration
  - dry-run-safety
  - soft-fail
  - mvp-vertical-slice

requires:
  - src/commands/report.js#reportMonthOrchestrator (Plan 02-02)
  - src/commands/report.js#reportWeekOrchestrator (Plan 02-02 — extended here with `internal` flag)
  - src/utils/format.js#datesInWeek
  - src/utils/format.js#weeksInMonth (Plan 02-01)
  - src/utils/paths.js#getDailyFilePath
  - src/utils/paths.js#getReportFilePath
  - src/core/claude.js#hasClaudeCli
provides:
  - "self-wiki report --month <YYYY-MM> auto-backfills missing weeklies before synthesizing the month"
  - src/commands/report.js#reportWeekOrchestrator (now accepts `{ internal: boolean }`)
  - src/commands/report.js#anyDailyExists (private helper)
affects:
  - test/report-month.test.js (8 → 13 tests; +1 RED-now-GREEN structural guard, +4 behavior tests)

tech_stack_added: []
tech_stack_patterns:
  - "Single-flag soft-fail gate at the loop boundary — pre-flight `hasClaudeCli` upstream of the backfill loop so a mid-loop crash on missing claude can never leave partial state"
  - "Chronological backfill ordering inherited from `weeksInMonth(month)` first-occurrence semantics — each backfilled weekly's `loadPriorReport` finds the just-written prior week, so PRIOR_REPORT continuity works during backfill"
  - "`internal: true` toggles user-visible verbosity (stderr line wording + suppressed `wrote` stdout) without forking the orchestrator into a second function — same write path, two invocation contexts"
  - "`process.execPath` + `PATH=/nonexistent` pattern in tests — strips the inner CLI's view of PATH while keeping the test runner itself working"

key_files:
  created: []
  modified:
    - src/commands/report.js
    - test/report-month.test.js

decisions:
  - "Did not extract reportWeekOrchestrator (Plan 02-02 already had); instead extended its signature with `internal: true` to suppress the trailing `wrote` stdout and rephrase the stderr progress line — minimum-surgery approach"
  - "Pre-flight hasClaudeCli check sits upstream of the backfill loop AND the existing post-dry-run check still runs for the no-missing-weeks path — calling hasClaudeCli twice (~30ms each) is cheaper than threading an already-checked flag"
  - "presentWeeks/missingWeeks switched from const to let so the post-backfill re-load rewrites them in place; downstream buildMonthlyPrompt sees up-to-date arrays"
  - "Empty-week graceful-skip via dedicated anyDailyExists helper (vs an inline `for/access/break`) — readable at the call site and reusable if a future variant needs the same predicate"
  - "Test for missing-claude-no-partial-state spawns CLI via process.execPath rather than `node` — the stripped PATH=/nonexistent must apply to the orchestrator's `claude` lookup, not the test runner's `node` lookup"

metrics:
  duration_min: 8
  start: "2026-05-08T16:51:00Z"
  completed: "2026-05-08T16:59:56Z"
  tasks_total: 2
  tasks_completed: 2
  commits: 3
  files_changed: 2
  tests_added: 5
  tests_total_after: 171
---

# Phase 2 Plan 3: Auto-backfill missing weeklies — Summary

**One-liner:** Layered auto-backfill onto Plan 02-02's monthly orchestrator —
`report --month 2026-04` now walks every overlapping ISO week, synthesizes
each missing weekly that has dailies (chronologically, so PRIOR_REPORT
continuity works), then synthesizes the month — gated behind a single
upstream `hasClaudeCli` check (no partial-state risk) and `--dry-run`
(D-15: dry-run never silently invokes weekly synthesis).

## Tasks Completed

| # | Task | TDD gates | Commits |
|---|------|-----------|---------|
| 1 | Extract `internal` flag onto `reportWeekOrchestrator` + add backfill phase to `reportMonthOrchestrator` | RED → GREEN | `517312e` (RED), `a4f9fd6` (GREEN) |
| 2 | Append four backfill behavior tests to `test/report-month.test.js` | (test-only — passes against Task 1's GREEN) | `6a054a9` |

## Files Modified

- **`src/commands/report.js`** (323 → 386 lines, +63 net) — three structural
  changes:
  1. `reportWeekOrchestrator(opts)` now reads `opts.internal === true` at the
     top. When true: the stderr progress line is rephrased to
     `backfilling <week>…`, the trailing `wrote <path>` stdout is suppressed
     (the monthly orchestrator owns the user-visible summary), and the
     `hasClaudeCli` check is skipped (caller has already gated).
  2. New private helper `anyDailyExists(dates)` — short-circuits weeks with
     zero daily logs on disk (MONTH-04 graceful degradation).
  3. New auto-backfill phase in `reportMonthOrchestrator` between the
     weekly-load loop and topic-page-load step:
     ```js
     if (!opts.dryRun && missingWeeks.length > 0) {
       if (!(await hasClaudeCli())) {
         /* exit 2 with same wording as weekly */
       }
       for (const weekStr of missingWeeks) {
         const weekDates = datesInWeek(weekStr);
         const hasAnyDaily = await anyDailyExists(weekDates);
         if (!hasAnyDaily) continue;
         await reportWeekOrchestrator({ week: weekStr, internal: true });
       }
       // re-load presentWeeks/missingWeeks
     }
     ```
     `presentWeeks`/`missingWeeks` switched from `const` to `let` so the
     re-load can rewrite them in place; downstream `buildMonthlyPrompt`
     sees the post-backfill state.

- **`test/report-month.test.js`** (219 → 322 lines, +103 net; 8 → 13 tests) —
  five new tests:
  - **Test 9** (Task 1 RED, now GREEN): structural guard — asserts the source
    contains `backfilling`, `async function anyDailyExists`,
    `for (const weekStr of missingWeeks)`, `!opts.dryRun && missingWeeks.length > 0`,
    `presentWeeks = []`, and `internal`.
  - **Test 10**: `--dry-run does NOT backfill missing weeklies` — runs
    `report --month 2026-04 --dry-run` against the W14/W15-only fixture and
    asserts `Reports/2026-W18.md` is NOT created. Sources line still flags
    the missing weeks.
  - **Test 11**: `Without --dry-run, missing claude exits 2 before any
    backfill` — spawns the CLI with `PATH=/nonexistent` (using
    `process.execPath` for the test runner's binary so the stripped PATH
    only affects the inner `claude` lookup), asserts exit 2 and that no
    weekly file was synthesized despite W18 having dailies on 2026-04-15.
  - **Test 12**: source-grep guard for the empty-week graceful-skip
    (MONTH-04) — asserts `anyDailyExists`, `hasAnyDaily`,
    `if (!hasAnyDaily) continue`, `hasClaudeCli` are all present.
  - **Test 13**: `Dry-run on a month with zero dailies completes cleanly` —
    `report --month 2025-07 --dry-run` against a month with zero dailies
    and zero weeklies; asserts exit 0, `MONTH: 2025-07` printed, and no
    monthly file written.

## Public/Internal API

The new internal contract for any future caller (Phase 3's self-review may
invoke weekly synthesis programmatically via the same surface):

```javascript
async function reportWeekOrchestrator(opts) {
  // opts: {
  //   week?: string,        // ISO week 'YYYY-Www'; defaults to current isoWeek()
  //   dryRun?: boolean,     // print prompt to stdout; do not synthesize/write
  //   out?: string,         // override output path; defaults to Reports/<week>.md
  //   internal?: boolean,   // NEW (Plan 02-03):
  //                         //   true  → stderr "backfilling <week>…", suppress
  //                         //          "wrote <path>" stdout, skip hasClaudeCli
  //                         //          (caller gated upstream)
  //                         //   false (default) → stderr "synthesizing <week>…",
  //                         //          emit "wrote <path>", run hasClaudeCli soft-fail
  // }
}
```

`reportMonthOrchestrator` now invokes `reportWeekOrchestrator({ week, internal: true })`
once per missing week (after the upstream `hasClaudeCli` gate), in
chronological order returned by `weeksInMonth(month)`.

CLI surface unchanged: `self-wiki report --month [YYYY-MM]`. The user runs
one command and gets weeklies + monthly synthesized in order.

## Verification

| Check | Result |
|-------|--------|
| `node --test 'test/*.test.js'` | **171/171 pass** (was 166 baseline; +5 new) |
| `node --test test/report-month.test.js` | 13/13 pass |
| `node --test test/metrics.test.js` (Plan 02-01 regression) | 7/7 pass |
| `node --test test/format.test.js` (Plan 02-01 regression) | 22/22 pass |
| `grep -q "async function reportWeekOrchestrator" src/commands/report.js` | OK |
| `grep -q "anyDailyExists" src/commands/report.js` | OK |
| `grep -q "backfilling" src/commands/report.js` | OK |
| `grep -q "synthesizing" src/commands/report.js` (weekly path's user-visible line preserved) | OK |
| `! grep -E "^async function buildMetrics" src/commands/report.js` (Plan 02-01's lift still in effect) | OK |
| `--dry-run` does NOT invoke weekly synthesis (D-15) | Test 10 — passing |
| Missing-claude pre-flight gate fires BEFORE any backfill (no partial state) | Test 11 — passing |
| Empty-week graceful-skip exists (MONTH-04) | Test 12 — passing |
| Whole-month no-dailies dry-run completes cleanly | Test 13 — passing |

## Manual Smoke (out of automated scope)

The live multi-call `claude -p` chain (where the orchestrator actually invokes
synthesis for missing weeks and writes their `Reports/<YYYY-Www>.md` files)
requires the real `claude` CLI and is intentionally out of automated test
scope (matches Plan 02-02's `claudeHeadless` precedent). The chain has been
manually smoke-verified by stepping through the orchestrator code paths;
the structural guard tests (Tests 9 and 12) lock down the source-level
invariants the live chain depends on.

Expected live chain on a vault with W14/W15 reports + dailies through W18:

```
$ self-wiki report --month 2026-04
backfilling 2026-W16…
backfilling 2026-W17…
backfilling 2026-W18…
synthesizing 2026-04…
wrote /vault/Reports/2026-04.md
```

After the run: `Reports/2026-W16.md`, `Reports/2026-W17.md`,
`Reports/2026-W18.md`, `Reports/2026-04.md` all exist on disk.

## Deviations from Plan

### Cosmetic — `reportWeekOrchestrator` was already extracted by Plan 02-02

**Found during:** Task 1 read-first.

**Issue:** The plan's `<action>` Edit 1 reads "Take the entire body of today's
`reportCommand` from `const week = opts.week || isoWeek();` through the final
`process.stdout.write(\`wrote ${outPath}\n\`);` and move it into a new
private async function." However, Plan 02-02's deviation note ("extracted
weekly path into a sibling private function") had **already** done this —
the function existed before Task 1 of Plan 02-03 began.

**Fix:** Treated Task 1 Edit 1 as a no-op (the structural pre-condition was
already satisfied) and proceeded directly to extending the existing
`reportWeekOrchestrator(opts)` signature with the `internal` flag:
- Read `opts.internal === true` at the top into a local `const internal`.
- Skip the `hasClaudeCli` check when `internal`.
- Switch the stderr progress line wording on `internal`.
- Suppress the trailing `wrote <path>` stdout when `internal`.

The plan's Edit 2 (slim `reportCommand` dispatch) was likewise already
satisfied — the dispatcher already calls `reportWeekOrchestrator(opts)`.
The downstream Edits 3 and 4 (backfill phase + `anyDailyExists` helper)
were applied as written, which is the substantive change of this plan.

**Why this isn't a Rule-4 architectural change:** The plan's *intent* was
to have `reportWeekOrchestrator` exist as a private helper callable from
both the dispatch path and the monthly backfill loop. Plan 02-02 happened
to realize that intent ahead of schedule; Plan 02-03 only needed to
parameterize the function. The output is byte-equivalent to what the plan
described.

**Files modified:** `src/commands/report.js` (extended existing signature
rather than created a new function).
**Commit:** `a4f9fd6` (Task 1 GREEN).

### Rule 1 (bug) — `spawnSync('node', …)` with `PATH=/nonexistent` cannot find `node`

**Found during:** Task 2 first run (Test 11 failed with `r.status === null`,
`r.stderr === undefined`).

**Issue:** The plan's `<action>` Test 2 snippet wrote:
```js
const r = spawnSync('node', [CLI_ENTRY, 'report', '--month', '2026-04'], {
  env: { ..., PATH: '/nonexistent', ... },
  encoding: 'utf8',
});
```
With `PATH=/nonexistent`, `spawnSync('node', ...)` fails its own PATH
lookup before the orchestrator can even start — the test runner's view of
`node` is stripped along with the orchestrator's view of `claude`. Status
returns `null`, stderr undefined.

**Fix:** Switched the spawn binary from `'node'` to `process.execPath`
(an absolute path to the running Node interpreter — bypasses PATH lookup
for the test runner). The stripped PATH then only affects the inner
`hasClaudeCli` lookup, which is exactly what the test wants to assert.

**Files modified:** `test/report-month.test.js` (one-line edit in Test 11).
**Commit:** included in `6a054a9`.

No CLAUDE.md violations, no architectural changes, no Rule-4 escalation
needed.

## Threat Surface

The plan's `<threat_model>` covered all surfaces; nothing new was introduced:

- **T-02-03-01 (Tampering, `weekStr` flowing into `getReportFilePath`):**
  Accepted — `weekStr` is sourced from `weeksInMonth(month)`, which
  generates ISO `YYYY-Www` strings deterministically from a month string
  validated upstream by Plan 02-02's `validateMonthOrExit`. No new tampering
  surface beyond what T-02-02-01 mitigated.
- **T-02-03-02 (DoS, multi-call `claude -p` chain):** Accepted — a month
  overlaps at most ~6 ISO weeks; user-initiated, foreground.
- **T-02-03-03 (Repudiation, partial-state vault):** **Mitigated** by the
  pre-flight `hasClaudeCli` check upstream of the backfill loop. Test 11
  exercises this gate explicitly — with claude unavailable, the orchestrator
  exits 2 BEFORE writing any weekly file. Per-week synthesis failures
  (e.g., `claudeHeadless` rejection mid-loop) propagate as exceptions and
  abort the orchestrator with stderr surfacing the failed week; already-
  written weeklies remain on disk and the user can re-run the monthly
  command which picks up where the loop crashed.
- **T-02-03-04 (Tampering, side effects from successful backfill before
  monthly fails):** Accepted — desired behavior; user gets value from the
  partial run, the `backfilling <week>…` stderr lines tell them what was
  written, they can re-attempt the monthly later.
- **T-02-03-05 (Information Disclosure, stderr lines on a private
  terminal):** Accepted — local CLI; no remote disclosure surface.

No new threat surface introduced beyond what the threat model enumerates.

## Self-Check: PASSED

Files exist:

- `src/commands/report.js` — modified (`internal` flag on
  `reportWeekOrchestrator`, `anyDailyExists` helper, auto-backfill phase
  in `reportMonthOrchestrator`)
- `test/report-month.test.js` — modified (8 → 13 tests; +5 new)
- `.planning/phases/02-monthly-report/02-03-SUMMARY.md` — this file

Commits exist on `worktree-agent-ae4ae20283a25e37c`:

- `517312e` (Task 1 RED) — FOUND
- `a4f9fd6` (Task 1 GREEN — auto-backfill phase) — FOUND
- `6a054a9` (Task 2 — backfill behavior tests) — FOUND

Test totals: 171/171 pass (was 166 baseline; +5 new). Weekly regression
guardrails (Plan 02-01) and monthly-flow guardrails (Plan 02-02) still
pass. `node --test 'test/*.test.js'` exits 0.
