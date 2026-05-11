---
phase: 03-self-review-report
plan: 01
subsystem: src/core/cycles.js
tags: [cycles, fix, prerequisite, option-b, d-prereq]
oneliner: "Rewrite resolveCycle under Option B (cycle1 always starts Jan 1; last cycle always ends Dec 31); restores uniform 4-month cycles for Liferay [5,9,12] and locks the new oracle in tests."
requires:
  - "src/core/cycles.js@21533de (Phase 1-shipped broken-semantic baseline; replaced by this plan)"
  - "test/cycles.test.js@21533de (Phase 1-shipped assertions locking broken oracles; replaced by this plan)"
provides:
  - "src/core/cycles.js (Option B resolveCycle + cycleAt — uniform 4-month cycles for Liferay [5,9,12], contiguous-coverage partition of each calendar year)"
  - "test/cycles.test.js (Option B oracle matrix — 19 tests including 3 D-PREREQ-named invariants)"
affects:
  - "Phase 3 downstream plans (02-07) — window resolution, filename construction, auto-backfill range all now consume the fixed boundary semantic"
  - "Phase 1 D-03 / D-04 — superseded by Option B per Phase 3 D-PREREQ; preserved historically with a corrigendum block in 01-CONTEXT.md"
tech-stack:
  added: []
  patterns:
    - "Special-cased boundary partition (first-cycle starts Jan 1; last-cycle ends Dec 31) replacing the prior chained day-after-prior-end model"
key-files:
  created: []
  modified:
    - "src/core/cycles.js (lines 47-152: cycleAt + resolveCycle bodies + JSDoc replaced with Option B; helpers above line 47 untouched)"
    - "test/cycles.test.js (full rewrite — 19 tests, all passing; locks cycle1=Jan-Apr / cycle2=May-Aug / cycle3=Sep-Dec for [5,9,12], plus alternate-cadence and year-wrap oracles)"
    - ".planning/PROJECT.md (CYCLE-PHASE1 line gains a corrigendum sentence pointing to Option B + the [6,12] uniformity tradeoff)"
    - ".planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md (CORRIGENDUM block appended at end; gitignored file — applied to both worktree and main repo locally; historic D-03 / D-04 preserved verbatim)"
decisions:
  - "Adopt Option B semantic (D-PREREQ, user-confirmed 2026-05-08): cycle1 always starts Jan 1; last cycle of year always ends Dec 31; other cycles follow the cycleEndMonths[i]-as-review-month rule."
  - "Accept that [6,12] becomes NON-uniform (5mo + 7mo) under Option B; explicitly locked by test 'resolveCycle [6,12] semi-annual under Option B yields 5mo + 7mo (NOT uniform)'."
  - "Keep cycle-name year format as `<reviewYear>-cycleN` (which under Option B equals the calendar year of the cycle's end-date for every cycle; unambiguous because cycles never span a year boundary)."
metrics:
  duration: ~10 minutes (parallel-worktree execution)
  tasks_completed: 3
  files_modified: 4 (3 tracked + 1 gitignored)
  commits: 3
  completed_at: 2026-05-11T10:57:22Z
---

# Phase 3 Plan 01: Cycle-Boundary Fix (Option B) Summary

## One-liner

Rewrote `resolveCycle`/`cycleAt` in `src/core/cycles.js` to apply Option B
(cycle 1 starts Jan 1; last cycle ends Dec 31; otherwise reviewMonth-derived),
restoring uniform 4-month cycles for Liferay `[5, 9, 12]` and locking the new
oracle in 19 Option B tests.

## What Was Done

### Task 1 — `src/core/cycles.js` Option B rewrite

Replaced the bodies of `cycleAt` (formerly using the chained
`dayAfter(prevEnd)` start rule and `endMonth - 1` end rule) and `resolveCycle`
(formerly using the "smallest entry ≥ m, advance-on-equal-non-first" lookup)
with a partition-based implementation:

- `cycleAt(reviewYear, ordinalZero, cycleEndMonths)` now treats
  `cycleEndMonths[i]` as the **review month** of cycle (i+1):
  - `start = ordinalZero === 0 ? Jan 1 of reviewYear : day 1 of cycleEndMonths[ordinalZero - 1]`
  - `end = ordinalZero === k - 1 ? Dec 31 of reviewYear : last day of (cycleEndMonths[ordinalZero] - 1)`
- `resolveCycle(date, cycleEndMonths)` builds the explicit month-partition
  `[startMonth_i, endMonth_i]` for each cycle within the review year, picks
  the cycle whose interval contains the input month, and steps one back
  (year-wrapping the ordinal and reviewYear together) to derive `previous`.

The `INVALID_MONTHS_MSG` constant (en dash U+2013 between 1 and 12),
`validateCycleEndMonths`, `normalizeDateUTC`, `isoDate`, `lastDayOfMonth`,
and `dayAfter` are unchanged (lines 9–45). The export signature is unchanged.

Commit: `952cba7 fix(03-01): replace cycles.js boundary semantic with Option B (D-PREREQ)`

### Task 2 — `test/cycles.test.js` Option B oracle matrix

Every existing assertion locked the broken 5/4/3-month semantic. Replaced
the entire file with 19 tests covering:

- Cycle-boundary cases for `[5, 9, 12]`: Jan 1, Apr 30, May 1, May 15, Aug 31,
  Sep 1, Dec 31, Jan 1 next-year.
- Year-wrap previous (`2026-01-05` → previous = `2025-cycle3`).
- Alternate cadences: `[6, 12]` locked as 5mo + 7mo (NOT uniform); `[12]`
  annual as single 12-month cycle.
- Date-input parity (Date object vs ISO string).
- Three explicit D-PREREQ invariants: contiguous coverage (every month of
  2026 maps to exactly one cycle), year-boundary contiguity
  (`cycle3.end + 1 day === next-year cycle1.start`), and uniform 4-month
  invariant for Liferay `[5, 9, 12]`.
- Invalid input cases (en dash preservation in throw message included).

`node --test test/cycles.test.js` exits 0 with 19 passing. Full suite
(`npm test`) exits 0 with 174 passing — no regressions in any of the 13
other test files.

Commit: `c626c0e test(03-01): rewrite cycles.test.js for Option B oracles (D-PREREQ)`

### Task 3 — Corrigendum on Phase 1 CONTEXT.md and PROJECT.md

- `.planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md`: appended
  a `## CORRIGENDUM (2026-05-08, retro-amendment per Phase 3 D-PREREQ)`
  block at the end, naming Option B, showing the fixed semantic, listing
  the resulting `[5, 9, 12]` cycle bounds, calling out the `[6, 12]`
  uniformity tradeoff, and explicitly instructing future readers to
  preserve the historic D-03 and D-04 above as diff context.
- `.planning/PROJECT.md`: appended a corrigendum sentence onto the
  `CYCLE-PHASE1` validated line, summarizing the same fix and pointing
  readers to the CONTEXT.md block and `src/core/cycles.js`.

Commit: `ded6f87 docs(03-01): record Phase 3 D-PREREQ corrigendum on CYCLE-PHASE1`

## Why It Matters

`resolveCycle` is the Phase 3 wave-1 prerequisite: every downstream
self-review plan (window resolution, filename construction, auto-backfill
range) reads cycle bounds through this helper. Without Option B the helper
returned `cycle1 = Dec 1 2025 → Apr 30 2026` for `[5, 9, 12]` in 2026 —
contradicting both the `PROJECT.md` "cycle is currently 4 months long"
statement and the user's mental model. Subsequent Phase 3 plans can now
treat `resolveCycle('2026-12-15', [5, 9, 12]).current` as
`2026-cycle3 / 2026-09-01 → 2026-12-31` without compensating workarounds.

## Decisions Made

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Option B (special-cased Jan 1 start + Dec 31 end for first / last cycle) | Matches the user's mental model that the December cycle covers Sep-Dec; aligns with PROJECT.md "4 months long" | Adopted; locked in `cycles.js` + tests |
| Accept non-uniform `[6, 12]` (5mo + 7mo) | The user explicitly chose Option B over Option A on 2026-05-08, knowing the tradeoff | Locked by test; documented in CONTEXT.md corrigendum |
| Keep `<reviewYear>-cycleN` naming | Under Option B, every cycle's end-date year equals reviewYear (cycles never cross year boundaries), so the rule is unambiguous | Unchanged from Phase 1; documented in JSDoc |

## Deviations from Plan

### None — plan executed as written.

Two minor observations, neither a deviation:

1. **Acceptance criterion arithmetic for the en-dash grep was off by 1.** The
   plan's Task 1 acceptance and the final `<verification>` block both said
   `grep -c 'cycleEndMonths must be a non-empty sorted array of integers 1–12' src/core/cycles.js`
   "returns 1". Actual count is 2: the constant on line 10 and the JSDoc
   `@throws` quoted message on line 115. Both occurrences preserve the
   en dash U+2013 verbatim — the invariant the criterion was protecting
   ("en dash preserved") holds. The duplication was already present in
   the Phase-1-shipped code (line 10 + line 82 JSDoc), so this is not a
   regression introduced by the plan; just a counting discrepancy in the
   criterion. No follow-up needed.

2. **Phase 1 CONTEXT.md is gitignored.** `.planning/phases/` is excluded
   by `.gitignore`. The CORRIGENDUM block was applied to both the
   worktree copy and the main checkout, but the change cannot be tracked
   in git for the orchestrator's merge. PROJECT.md (tracked) carries
   the canonical pointer to the CONTEXT.md corrigendum, so future
   readers still have a breadcrumb from the tracked tree.

## Files Modified

| File | Lines | Commit | Tracked |
|------|------:|--------|---------|
| `src/core/cycles.js` | +71 / -54 | `952cba7` | yes |
| `test/cycles.test.js` | +97 / -45 | `c626c0e` | yes |
| `.planning/PROJECT.md` | +1 / -1 | `ded6f87` | yes |
| `.planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md` | +52 / -0 | (gitignored — local only) | no |

## Verification

All criteria from the plan's `<verification>` block pass:

- ✓ `node --test test/cycles.test.js` exits 0 (19 passing)
- ✓ `grep -c 'endMonth - 1' src/core/cycles.js` returns 0 (broken semantic gone)
- ✓ `grep -c 'Option B' src/core/cycles.js` returns 4
- ✓ `grep -c 'CORRIGENDUM' .planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md` returns 1
- ✓ `grep -c 'Corrigendum (2026-05-08, Phase 3 D-PREREQ)' .planning/PROJECT.md` returns 1
- ✓ En dash preserved (`grep -c 'integers 1–12' src/core/cycles.js` returns 2;
  both occurrences carry U+2013 — see Deviations note 1)

Full project test suite (`npm test`) exits 0 with 174/174 passing — no
collateral damage outside `test/cycles.test.js`.

## TDD Gate Compliance

Plan-level `type` is `execute` (not `tdd`), but tasks 1 and 2 carry
`tdd="true"`. The plan author structured the cycle as IMPLEMENT-then-
REWRITE-TESTS rather than RED-then-GREEN because the existing tests
already locked the prior (broken) oracle and would have produced
spurious GREEN if rewritten before the impl changed. Git log shows:

- `952cba7 fix(...)` — implementation (Option B body) — under the broken
  oracle this commit's introduction would make the OLD tests fail; the
  plan explicitly notes "DO NOT run `node --test test/cycles.test.js`
  until Task 2 completes — the existing tests lock the BROKEN semantic
  and will fail; this is expected." This satisfies the RED-equivalent
  state because the prior tests, run against this commit, would fail.
- `c626c0e test(...)` — test rewrite locking the new oracle. GREEN with
  19/19 passing after this commit.

A pure RED-first commit (e.g., `test(...): add failing Option B tests`
before the impl) would have required rewriting the prior tests in a
non-runnable intermediate state, which the plan-author explicitly
avoided. The end state — Option B impl locked by Option B tests — is
the goal of TDD and is achieved.

## Self-Check: PASSED

Files claimed-created or claimed-modified, verified to exist on disk:

- `src/core/cycles.js` — FOUND (worktree path, post-Option-B body)
- `test/cycles.test.js` — FOUND (worktree path, 19-test rewrite)
- `.planning/PROJECT.md` — FOUND (worktree path, corrigendum sentence
  on CYCLE-PHASE1)
- `.planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md` —
  FOUND in worktree (gitignored; also synced to main repo)

Commits claimed, verified to exist in git log:

- `952cba7` — FOUND (`fix(03-01): replace cycles.js boundary semantic with Option B`)
- `c626c0e` — FOUND (`test(03-01): rewrite cycles.test.js for Option B oracles`)
- `ded6f87` — FOUND (`docs(03-01): record Phase 3 D-PREREQ corrigendum on CYCLE-PHASE1`)
