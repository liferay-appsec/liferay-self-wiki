---
phase: 01-cycle-config-vault-scaffold
plan: 01
subsystem: cycles
tags: [cycles, utc-arithmetic, pure-utility, review-cadence]

# Dependency graph
requires:
  - phase: bootstrap
    provides: src/utils/format.js (UTC-arithmetic + throw-on-bad-input idiom)
provides:
  - "src/core/cycles.js — resolveCycle(date, cycleEndMonths) → {current, previous}: {name, start, end}"
  - "Locked validator message: 'cycleEndMonths must be a non-empty sorted array of integers 1–12' (em dash U+2013)"
  - "Asymmetry rule documented (and tested): cycle1's review month stays in current; later entries advance to next cycle on review-month start"
affects:
  - 02-monthly-report (may cross-reference cycle boundaries in monthly report headers)
  - 03-self-review-report (calls resolveCycle when --since and lastReviewedAt are both unset)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-utility module: zero imports, UTC-only Date math, throw on bad input"
    - "Cycle name format: <YYYY>-cycle<N> with N as 1-indexed ordinal in sorted cycleEndMonths"

key-files:
  created:
    - src/core/cycles.js
    - test/cycles.test.js
  modified: []

key-decisions:
  - "Asymmetry: D-04 review-month-stays-current applies ONLY to the FIRST entry of cycleEndMonths (cycle1's review). For non-first entries, review-month is the start of the NEXT cycle's coverage per D-03 contiguous coverage. This reconciles must_haves truths with D-03 across the full year."
  - "Validator message locked to 'cycleEndMonths must be a non-empty sorted array of integers 1–12' (U+2013 en dash). Phase 3 docs that quote this message must use the en dash byte-for-byte."
  - "resolveCycle accepts both Date instance and ISO-8601-parseable string for the date parameter (D-Claude-Discretion); both forms produce identical output."

patterns-established:
  - "Pure-utility: src/core/cycles.js has zero imports, mirroring src/utils/format.js. New deterministic helpers belong here when the module is cycle-shaped (vs. session/log-shaped)."
  - "UTC-only Date math: Date.UTC(...) constructor + setUTCDate(...) arithmetic + getUTC* accessors. No local-tz getters anywhere in the file."
  - "Test-file mirror: test/cycles.test.js follows test/format.test.js exactly — node:test runtime, no mkdtempSync, no XDG_*_HOME isolation (pure utility, no filesystem)."

requirements-completed:
  - CONFIG-03

# Metrics
duration: ~25 min
completed: 2026-05-07
---

# Phase 1 Plan 1: Cycle Helper (`resolveCycle`) Summary

**Pure UTC-arithmetic `resolveCycle(date, cycleEndMonths)` module in `src/core/cycles.js` that returns `{current, previous}: {name, start, end}` for any cadence (Liferay default `[5,9,12]`, semi-annual `[6,12]`, annual `[12]`), backed by 16 tests covering boundary days, year-wrap in both directions, and every invalid-input class.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-07T21:23 (approx, plan execution start)
- **Completed:** 2026-05-07T21:49 UTC
- **Tasks:** 2 / 2
- **Files created:** 2
- **Files modified:** 0
- **Lines added:** 271 (135 src + 136 test)

## Accomplishments

- Established `src/core/cycles.js` as the canonical deterministic cycle helper for Phases 2 and 3. Zero imports, UTC-only arithmetic, throw-on-bad-input.
- Locked the validator throw message verbatim — including the U+2013 en dash — so Phase 3 docs that quote it stay byte-stable.
- Added `test/cycles.test.js` with 16 cases that map 1:1 to the plan's must_haves truth set (D-11): Liferay `[5,9,12]` boundary days for every cycle, year-wrap in both directions, semi-annual `[6,12]` and annual `[12]` cadences, ISO-string vs Date-object input parity, and every invalid-input form throws the locked message.
- Identified and corrected an asymmetry in the resolution rule (see Deviations) — the literal "smallest entry ≥ m" sketch was insufficient to satisfy the must_haves; only `cycleEndMonths[0]`'s review month extends `current` per D-04. Documented the refinement inline in `src/core/cycles.js` so future maintainers don't reintroduce the bug.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement `resolveCycle` in `src/core/cycles.js`** — `6549a4f` (feat)
2. **Task 2: Cover `resolveCycle` with `test/cycles.test.js` (+ asymmetry-rule refinement)** — `7947a2d` (test, includes a Rule 1 fix to `src/core/cycles.js` discovered while writing the comprehensive test suite)

_Note: TDD ordering here was inverted by the plan structure — Task 1 ships the implementation (verified by an inline `<verify>` smoke test that doesn't catch year-boundary asymmetry), Task 2 ships the broad test suite that exposed the asymmetry bug. The fix to `cycles.js` rides along with Task 2's commit per Rule 1 (auto-fix bugs found during the current task)._

## Files Created/Modified

- **`src/core/cycles.js`** (created, 135 lines) — `resolveCycle(date, cycleEndMonths)` plus four file-private helpers (`validateCycleEndMonths`, `normalizeDateUTC`, `isoDate`, `lastDayOfMonth`, `dayAfter`, `cycleAt`). Pure module: zero `import` statements; only `getUTC*` / `setUTCDate` / `Date.UTC` for date math.
- **`test/cycles.test.js`** (created, 136 lines) — 16 `test(...)` blocks mirroring `test/format.test.js`'s style (no `before/after`, no `mkdtempSync`, no XDG isolation).

## Decisions Made

- **Cycle1 asymmetry is the resolution rule.** D-04 says "during May (cycle1's review month) current remains cycle1." I extrapolated to "any review month stays in current" but the must_haves truths (Sep 1 → cycle3, Dec 1 2025 → 2026-cycle1) require the opposite for cycles 2..N: their review months are the *start* of the next cycle's coverage per D-03 contiguous coverage. The reconciled rule: only `cycleEndMonths[0]` (cycle1) extends current into its review month; cycle2..N hand off to the next cycle on review-month-day-1.
- **String-input parity is supported.** `resolveCycle('2026-05-15', [5,9,12])` returns the same object as `resolveCycle(new Date('2026-05-15T00:00:00Z'), [5,9,12])` — covers the Phase 3 case where a `--cycle <name>` flag might reverse-derive a date.
- **No internal helpers exported.** Per D-01, `resolveCycle` is the canonical surface. The Claude's-Discretion option to also export `cycleNameFor(year, ordinal)` was declined for surface minimalism — Phase 3 doesn't need it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Refined current-cycle resolution to satisfy must_haves**

- **Found during:** Task 2 (writing the comprehensive test suite)
- **Issue:** The plan's `<action>` skeleton implementation in Task 1 used the rule "smallest `cem[i]` such that `cem[i] >= m`" verbatim. With Liferay `[5,9,12]`:
    - `Sep 1 2026` (m=9) → smallest entry ≥ 9 is 9 (i=1) → resolves to `2026-cycle2` (end=Aug 31)
    - `Dec 1 2025` (m=12) → smallest entry ≥ 12 is 12 (i=2) → resolves to `2025-cycle3` (end=Nov 30)
    - `Dec 1 2026` (m=12) → resolves to `2026-cycle3` (end=Nov 30)

  But the plan's must_haves truths and the test cases the plan dictates require:
    - `Sep 1 2026` → `2026-cycle3` (start=Sep 1, end=Nov 30) — D-03 contiguous coverage
    - `Dec 1 2025` → `2026-cycle1` (start=Dec 1 2025, end=Apr 30 2026) — D-03 contiguous coverage
    - `Dec 1 2026` → `2027-cycle1` — year-wrap forward

  The literal rule contradicts D-03 for non-first entries. The asymmetry: D-04's "review month stays in current" applies only to `cycle1` (the first entry). For later entries, the review month is the FIRST day of the next cycle's coverage.
- **Fix:** After the `for` loop in `resolveCycle`, when `curOrdinalZero > 0 && cycleEndMonths[curOrdinalZero] === m`, advance `curOrdinalZero` by 1 (year-wrapping to `0`/`y+1` if past the array end). For `curOrdinalZero === 0` (cycle1's review-month), keep current as cycle1 — that's the only case D-04's "stays-current" rule applies. Documented with a multi-line comment in `src/core/cycles.js`.
- **Files modified:** `src/core/cycles.js` (the resolveCycle body, between lines 88 and 121).
- **Verification:** `node --test test/cycles.test.js` passes 16/16. `npm test` passes 133/133 (no regressions). Smoke commands for Dec 1 2025, Sep 1 2026, Dec 1 2026 all return the expected cycle.
- **Committed in:** `7947a2d` (Task 2 commit; the fix and the test that revealed it ship together).

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix is a 12-line addition that preserves every other property of the skeleton (validator stays loud, name format unchanged, year-wrap previousCycle still works). The plan's must_haves truths and ROADMAP success criteria all hold. Documented inline so the asymmetry isn't reintroduced.

## Issues Encountered

- The plan's `<action>` skeleton's resolution rule and the plan's must_haves truths were locally inconsistent for non-first cycleEndMonths entries (see Deviation #1). The must_haves were treated as ground truth (they're listed as plan-level invariants). The skeleton was treated as suggestive. Outcome: both `cycles.js` and the test file shipped consistent.
- One self-authored test bug: I initially encoded `[6,12] cycle1.start` as `'2026-01-01'` (an arithmetic mistake — that would be a 5-month cycle starting from January, not the contiguous 6-month cycle starting Dec 1 2025). Corrected before commit; the test now asserts the contiguous-coverage values.

## Validator Message (verbatim, for Phase 3 to quote)

```
cycleEndMonths must be a non-empty sorted array of integers 1–12
```

The dash between `1` and `12` is U+2013 (EN DASH). Phase 3 doc strings or error pretty-printers that quote this message MUST preserve the en dash byte-for-byte.

## Confirmation

- `node --test test/cycles.test.js` → **16/16 pass** (16 tests, 0 failures, ~325 ms)
- `npm test` (full suite) → **133/133 pass** (no regressions in pre-existing tests)
- Smoke (`node -e 'import(...).then(m=>{const r=m.resolveCycle(new Date("2026-05-15T00:00:00Z"),[5,9,12]); ...})'`) prints `current = 2026-cycle1 / 2025-12-01 → 2026-04-30` and `previous = 2025-cycle3 / 2025-09-01 → 2025-11-30`. ✓
- Acceptance criteria from PLAN:
  - File exists at `src/core/cycles.js` ✓
  - `grep -q "export function resolveCycle"` ✓
  - `grep -cE "^import |^from "` returns `0` ✓
  - No local-tz Date accessors (`getMonth()`, `getDate()`, `getFullYear()`, `setDate(`, `setMonth(`) ✓
  - Throw message verbatim with U+2013 ✓
  - File exists at `test/cycles.test.js` ✓
  - No `mkdtempSync` / `XDG_*_HOME` ✓
  - `from 'node:test'` present ✓
  - 16 `test(...)` blocks (≥ 12 required) ✓

## Next Phase Readiness

- **Phase 2 (monthly report):** May not call `resolveCycle` directly (monthly is calendar-month, not cycle-shaped) but can cross-reference `{current, previous}` for header text. The contract is stable; no surprises expected.
- **Phase 3 (self-review report):** `resolveCycle(new Date(), cycleEndMonths)` is the canonical default-window resolver when `--since` and `lastReviewedAt` are both unset. The `name` field (`<YYYY>-cycle<N>`) is the canonical filename component for `Reviews/<YYYY>-cycle<N>.md`. The `previous` field gives the immediately-preceding cycle for the "what cycle did I last review" comparison. Phase 3 should:
  - Catch the locked validator throw (`/cycleEndMonths must be a non-empty sorted array of integers 1–12/`) and pretty-print it with a "edit `<vault>/.self-wiki/config.json`" pointer.
  - Use `current.name` for the output filename and `current.start`..`current.end` for the date-range filter on monthly + weekly reports.
- **Plans 2..5 of Phase 1:** Independent of this plan (per the wave-1 parallelization config). Plan 2 (vault config defaults) and Plan 3 (Reviews/ scaffold) don't depend on `cycles.js` and can run alongside. Plan 4 / Plan 5 in later waves can reference this SUMMARY for the asymmetry rule documentation.

## Self-Check: PASSED

- `src/core/cycles.js` exists at the worktree path. ✓ FOUND
- `test/cycles.test.js` exists at the worktree path. ✓ FOUND
- Commit `6549a4f` exists in `git log`. ✓ FOUND
- Commit `7947a2d` exists in `git log`. ✓ FOUND
- `node --test test/cycles.test.js` exits 0 (16/16). ✓
- `npm test` exits 0 (133/133, no regressions). ✓

---
*Phase: 01-cycle-config-vault-scaffold*
*Plan: 01*
*Completed: 2026-05-07*
