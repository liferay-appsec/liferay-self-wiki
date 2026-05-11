---
phase: 03-self-review-report
plan: 06
subsystem: self-review
tags: [auto-backfill, preflight, monthly-cascade, slice-2, hoisted-gate, no-partial-state]
dependency_graph:
  requires:
    - "src/commands/report.js#reportMonthOrchestrator (plan 03-06 Task 1 exports it; Phase 2 originally built it)"
    - "src/core/reviews.js#selfReviewOrchestrator (plan 03-05 slice-1 wires it; this plan extends it)"
    - "src/core/reviews.js#{resolveReviewWindow,loadPriorCycleReview,loadInCycleTopicPages,buildSelfReviewPrompt} (plan 03-04)"
    - "src/core/claude.js#hasClaudeCli (existing; used as single upstream gate)"
    - "src/utils/format.js#monthsInRange (Phase 2)"
  provides:
    - "selfReviewOrchestrator auto-backfills missing monthlies before synthesis (REVIEW-05)"
    - "Preflight stderr summary surfaces cascade size to user (D-05)"
    - "Hoisted hasClaudeCli gate prevents partial state on missing claude (D-05)"
    - "reportMonthOrchestrator exported with internal:true plumbing (Task 1)"
  affects:
    - "src/commands/report.js (signature change: monthly orchestrator is now exported + internal-aware)"
    - "src/core/reviews.js (orchestrator restructured: preflight → hoisted gate → cascade → re-load)"
tech_stack:
  added: []
  patterns:
    - "Single hoisted hasClaudeCli gate before cascade (no partial-state invariant)"
    - "Best-effort cascade with per-iteration try/catch + stderr warn (matches monthly's weekly cascade)"
    - "Post-cascade re-load of input arrays so downstream sees post-backfill state"
    - "Preflight stderr summary BEFORE any side effect (lets user Ctrl-C if surprised)"
    - "internal:true plumbing on subordinate orchestrator (mirror of reportWeekOrchestrator's existing pattern)"
key_files:
  created: []
  modified:
    - "src/commands/report.js (+23/-4: export + internal flag plumbing in reportMonthOrchestrator)"
    - "src/core/reviews.js (+120/-17: preflight + hoisted gate + cascade + re-load; redundant slice-1 soft-fail block removed)"
    - "test/self-review.test.js (+105/-0: 6 new tests — 2 behavior + 1 no-partial-state + 3 structural guards)"
    - "test/report-month.test.js (+19/-0: 1 structural guard for Task 1)"
decisions:
  - "Hoisted soft-fail-to-dry-run gate replaces (rather than supplements) the slice-1 post-prompt gate — removes a second hasClaudeCli call that was redundant under slice-2 ordering."
  - "Cascade per-iteration error handling mirrors reportMonthOrchestrator's weekly cascade (try/catch + stderr warn): best-effort, no rollback, partial cycle remains valid."
  - "Re-loaded monthlies post-cascade by repeating the same fs.readFile loop, not by mutating arrays in place — the cascade's writes happened via subprocess, so memory state can't be incrementally updated reliably."
  - "Preflight estimate of weekly cascade size = missingMonths.length * 4. Conservative; the user-visible message already says '(estimate)'."
metrics:
  duration: "~5 min (parallel-executor wall time)"
  completed_date: "2026-05-11"
  tasks_completed: 3
  files_touched: 4
  insertions: 267
  deletions: 21
requirements:
  completed: [REVIEW-05]
---

# Phase 03 Plan 06: Self-Review Auto-Backfill Cascade Summary

## One-liner

Adds the slice-2 auto-backfill cascade to `self-wiki self-review`: missing monthlies in the cycle window are now generated automatically via `reportMonthOrchestrator({internal: true})` per missing month before the self-review prompt is built, behind a preflight stderr summary and a single hoisted `hasClaudeCli` gate that guarantees no partial state on missing claude.

## Performance

- **Duration:** ~5 min (parallel-executor wall time)
- **Started:** 2026-05-11T11:26:37Z
- **Completed:** 2026-05-11
- **Tasks:** 3 (1 source extension + 1 orchestrator extension + 1 test suite extension)
- **Files modified:** 4

## Accomplishments

- **`reportMonthOrchestrator` is now exported** from `src/commands/report.js`, with `internal:true` plumbing that mirrors `reportWeekOrchestrator`'s existing pattern (suppress wrote-stdout, rephrase progress line, skip the redundant inner hasClaudeCli re-check).
- **`selfReviewOrchestrator` auto-backfills missing monthlies** by invoking `reportMonthOrchestrator` per missing month — which itself cascades to weeklies (Phase 2), so a fresh-vault cycle-end run produces all 4 monthlies + ~16 weeklies + the final review draft from a single keystroke.
- **Preflight stderr summary (D-05)** prints BEFORE any side effect: cycle name + window, monthlies needed, ✓-marked present monthlies, will-generate list, estimated weekly cascade size. Non-interactive — the user can Ctrl-C if surprised.
- **Single hoisted hasClaudeCli gate (D-05)** fires BEFORE the cascade. If claude is missing AND --dry-run is off, the orchestrator builds the prompt with pre-cascade state and exits cleanly via the slice-1 soft-fail-to-dry-run path. No partial state in the vault is possible from a mid-cascade crash on missing claude.
- **D-06 stale-monthlies-canonical preserved:** the cascade only fires for `missingMonths`. Existing `Reports/<YYYY-MM>.md` files are loaded read-only and never regenerated.
- **D-07 strict dry-run preserved:** the cascade block is gated behind `!opts.dryRun`. Dry-run output uses "would generate (skipped — dry-run)" + "Missing monthlies (would be backfilled in non-dry-run)" phrasing.

## Task Commits

Each task was committed atomically with RED/GREEN gates per `tdd="true"`:

1. **Task 1 (RED):** test(03-06) — lock reportMonthOrchestrator internal:true plumbing — `caff791`
2. **Task 1 (GREEN):** feat(03-06) — extend reportMonthOrchestrator with internal:true plumbing — `882139a`
3. **Task 2 + 3 (RED):** test(03-06) — lock auto-backfill cascade + preflight summary — `173dd1b`
4. **Task 2 (GREEN):** feat(03-06) — auto-backfill cascade + preflight summary in self-review — `da14f84`

Task 3's test additions shipped in the Task 2 RED commit (`173dd1b`) because the plan's structure put all the cascade-related tests in one block; the natural TDD flow was to add the tests first as the RED gate for Task 2's implementation. All 6 new tests pass against Task 2's GREEN implementation.

## Files Created/Modified

- `src/commands/report.js` — `reportMonthOrchestrator` is now `export`ed and accepts `opts.internal === true`. When `internal:true`: skip the final-synthesis hasClaudeCli re-check (caller's hoisted gate guarantees claude is available); use `'backfilling'` instead of `'synthesizing'` in the stderr progress line; suppress the `wrote ${outPath}` stdout line (caller owns the user-visible final summary). The inner weekly-cascade hasClaudeCli check at lines 290-294 stays unchanged — the cascade only fires on missing weeks and is the monthly orchestrator's own concern. Public callers (cli.js report subcommand) never pass `internal:true`, so existing behavior is unchanged. Verified: existing report-month tests still pass (14/14).
- `src/core/reviews.js#selfReviewOrchestrator` — restructured around the cascade:
  - Step 4 monthly load uses `let` binding for `monthlies`/`missingMonths` so the post-cascade re-load (step 4c) can overwrite them in place.
  - Step 4a NEW: preflight stderr summary (D-05). Prints `Resolving <cycle>`, `Monthlies needed: ...`, per-present `✓ Reports/<m>.md exists`, then either `would generate (skipped — dry-run)` (dry-run) or `will generate: ...` + `cascades to backfill ~N weekly reports (estimate)` (non-dry-run).
  - Step 4b NEW: hoisted soft-fail-to-dry-run gate. Fires when `!opts.dryRun && !hasClaudeCli()`. Builds prompt with pre-cascade state and returns; no partial state. Replaces (not supplements) the slice-1 post-prompt gate, which is now redundant and removed.
  - Step 4c NEW: cascade loop. `for (const monthStr of missingMonths) { await reportMonthOrchestrator({ month: monthStr, internal: true }) }` with try/catch + stderr warn per iteration (best-effort, mirrors monthly's weekly cascade). Post-loop re-loads `monthlies` + `missingMonths` from disk via the same readFile loop.
  - Step 8 `missingMonthlyNote` rephrased to distinguish dry-run path (`would be backfilled in non-dry-run`) from cascade-best-effort-failure path (`cascade attempted but some failed`).
  - Step 11 redundant soft-fail block removed (hoisted to step 4b).
- `test/self-review.test.js` — 6 new tests covering: preflight summary stderr format, dry-run-no-cascade invariant, no-partial-state-on-missing-claude invariant, cascade import structural guard, post-cascade re-load structural guard, hoisted-before-cascade ordering structural guard.
- `test/report-month.test.js` — 1 new structural guard for Task 1: asserts `reportMonthOrchestrator` is exported and that the internal-flag pattern (const declaration, `if (!internal && !(await hasClaudeCli()))`, `internal ? 'backfilling' : 'synthesizing'`, ≥2 `if (!internal)` guards) is in source.

## Decisions Made

- **Hoisted soft-fail-to-dry-run replaces (rather than supplements) the slice-1 post-prompt gate.** Plan body explicitly directed this restructure to consolidate to a single hasClaudeCli call. Slice-1's post-prompt gate handled the "claude went away between prompt build and synthesis" race, which is so vanishingly rare and well-handled by the synthesis-time `claudeHeadless()` failure path that double-gating buys nothing. Single hoisted gate = simpler control flow + correct no-partial-state invariant.
- **Cascade error handling = best-effort, no rollback.** Mirrors `reportMonthOrchestrator`'s weekly cascade (`src/commands/report.js` lines 301-310): per-iteration try/catch + stderr warn. If one monthly fails mid-cascade, the others remain valid; the post-loop re-load reflects exactly what's on disk; the buildSelfReviewPrompt sees that state plus a `missingMonthlyNote` flagging "cascade attempted but some failed".
- **Post-cascade re-load is a fresh readFile loop, not array mutation.** The cascade's writes happened in subprocesses (each `reportMonthOrchestrator` call writes a file). Memory state of `monthlies` and `missingMonths` in the parent can't be incrementally updated as the subprocess writes complete; the cleanest invariant is to re-load both from disk once the cascade returns.
- **Preflight estimate of weekly cascade size = `missingMonths.length * 4`.** Conservative; the message says "(estimate)". A monthly covers 4-5 ISO weeks depending on overlap; the user just needs a magnitude hint for the Ctrl-C decision, not an exact count.

## Deviations from Plan

None — plan executed exactly as written, with one minor judgment call:

1. **Task 3's tests were committed in the Task 2 RED commit (`173dd1b`), not a separate Task 3 commit.** The plan defined Task 3 as a distinct task because the tests are a separate concern from the implementation, but the test additions ARE Task 2's RED gate under `tdd="true"`. Committing tests before implementation is the canonical TDD flow; committing them as "Task 3 follow-up" after Task 2's GREEN would have inverted the discipline. The Task 1 commits follow the same pattern (RED test commit before GREEN implementation commit). All 6 new test names from the plan are present and pass.

## Issues Encountered

None.

## Requirements traceability

| Requirement | Implementation |
|-------------|----------------|
| REVIEW-05 | Auto-backfill cascade in `selfReviewOrchestrator` step 4c. Missing monthlies trigger `reportMonthOrchestrator({month, internal: true})` per month; the monthly's own weekly cascade handles weeklies transitively. |

Other Phase 3 requirements (REVIEW-01..04, REVIEW-06..09) were completed in earlier plans of this phase and are preserved here — the cascade does not change the prompt envelope, the writeback, the value-tagging, or the source-attribution mechanics.

## Decisions tracked from CONTEXT.md

| Decision ID | Implementation |
|-------------|----------------|
| D-05 | Default-on auto-backfill, preflight stderr summary BEFORE any side effect, single hoisted hasClaudeCli gate. |
| D-06 | Stale monthlies treated as canonical: cascade only fires for `missingMonths`; existing `Reports/<YYYY-MM>.md` files are loaded read-only and never regenerated. No `--refresh-monthlies` flag. |
| D-07 | `--dry-run` is strict: the cascade block is gated behind `!opts.dryRun`. Dry-run output uses "would generate (skipped — dry-run)" phrasing. No `claude -p` invocation in dry-run mode under any code path. |

## Verification

- `node --test test/self-review.test.js test/report-month.test.js` → 33/33 pass (was 27 baseline; +6 from this plan).
- `node --test test/*.test.js` → 225/225 pass (was 219 baseline; +6 from this plan).
- `grep -c 'Monthlies needed:' src/core/reviews.js` → 1 (≥1 required).
- `grep -c 'reportMonthOrchestrator(' src/core/reviews.js` → 1 (≥1 required; cascade invocation).
- `grep -cE 'internal === true|internal: true' src/commands/report.js` → 5 (≥1 required; internal-flag plumbing in two orchestrators).
- `grep -c '^export async function reportMonthOrchestrator' src/commands/report.js` → 1.
- `grep -c 'cascades to backfill' src/core/reviews.js` → 1.
- `grep -c 'would generate (skipped — dry-run)' src/core/reviews.js` → 1.
- `grep -c 'Re-load monthlies post-cascade' src/core/reviews.js` → 1.
- `grep -c 'printing prompt to stdout instead' src/core/reviews.js` → 1 (single hoisted location; redundant slice-1 block removed).
- Ordering invariant verified: `printing prompt to stdout instead` (line 577) precedes `reportMonthOrchestrator({ month: monthStr` (line 591) in `src/core/reviews.js`.

## TDD Gate Compliance

Plan-level type is `execute`, not `tdd`, but Tasks 1, 2, 3 each have `tdd="true"`. Per-task gate sequence verified in git log:

- **Task 1:** `test(03-06): RED — lock reportMonthOrchestrator internal:true plumbing` (caff791) → `feat(03-06): extend reportMonthOrchestrator with internal:true plumbing` (882139a). RED gate first, GREEN gate second.
- **Tasks 2+3:** `test(03-06): RED — lock auto-backfill cascade + preflight summary` (173dd1b) → `feat(03-06): auto-backfill cascade + preflight summary in self-review` (da14f84). RED gate first, GREEN gate second.

No REFACTOR commits were needed — the slice-2 implementation is structurally clean and the existing patterns (try/catch + stderr warn, readFile loops) carried over without modification.

## Authentication Gates

None — `claude -p` invocation is gated by `hasClaudeCli()` and the slice deliberately soft-fails when claude is missing (REVIEW-08, inherited from slice 1).

## Known Stubs

None. The slice is complete: missing monthlies are auto-backfilled rather than surfaced as a stub; dry-run output uses the canonical "would be backfilled in non-dry-run" phrasing.

## Threat Flags

No new threat surface beyond what `<threat_model>` in `03-06-PLAN.md` already documented. The four threats (T-03-06-01 through T-03-06-04) are all addressed:

- **T-03-06-01 (partial-state on cascade crash):** Hoisted hasClaudeCli gate fires BEFORE the cascade; if claude is missing, the cascade never starts. Per-iteration try/catch handles mid-cascade failures by logging + continuing; surrounding cycle's other monthlies remain valid. Post-cascade re-load reflects whatever state the cascade left behind. Locked by the `Without --dry-run, missing claude soft-fails BEFORE the cascade (no partial state)` test.
- **T-03-06-02 (runaway cascade DoS):** Accepted per plan. Preflight summary surfaces the ~16 claude invocation estimate; user can Ctrl-C.
- **T-03-06-03 (cascade ordering / audit):** Accepted per plan. Monthlies processed in calendar order from `monthsInRange`; per-failure stderr warns include the month string.
- **T-03-06-04 (preflight info disclosure):** Accepted per plan. Stderr lists vault paths (user's own files); no PII.

## Self-Check: PASSED

Verified after writing this SUMMARY:

- `src/commands/report.js` contains `export async function reportMonthOrchestrator` ✓
- `src/core/reviews.js` imports `reportMonthOrchestrator` from `../commands/report.js` ✓
- `src/core/reviews.js` invokes `reportMonthOrchestrator({ month: monthStr, internal: true })` inside the cascade loop ✓
- `test/self-review.test.js` contains the 6 new cascade-related tests ✓
- `test/report-month.test.js` contains the Plan 03-06 RED structural guard ✓
- Commits exist on `worktree-agent-afceb95cb3a5ed453`:
  - `caff791` (Task 1 RED) ✓
  - `882139a` (Task 1 GREEN) ✓
  - `173dd1b` (Tasks 2+3 RED) ✓
  - `da14f84` (Task 2 GREEN) ✓
- Full test suite green: 225/225 ✓

## Next Phase Readiness

Plan 03-07 (acceptance) can now run `self-wiki self-review` against a fresh-vault fixture and verify the end-to-end cascade produces 4 monthlies + ~16 weeklies + the final review draft from a single keystroke (claude permitting). The preflight summary + cascade are demoable; the no-partial-state invariant on missing claude is locked by tests.

---
*Phase: 03-self-review-report*
*Completed: 2026-05-11*
