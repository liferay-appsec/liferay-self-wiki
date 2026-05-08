---
phase: 02-monthly-report
plan: 01
subsystem: metrics-helper-lift + month-date-helpers
tags:
  - format
  - metrics
  - utc-arithmetic
  - shared-helper
  - refactor
  - tdd

requires:
  - src/utils/format.js
  - src/utils/log-parser.js
  - src/utils/regex.js
provides:
  - src/utils/format.js#datesInMonth
  - src/utils/format.js#priorMonth
  - src/utils/format.js#weeksInMonth
  - src/core/metrics.js#buildMetrics
affects:
  - src/commands/report.js (refactored — weekly path byte-identical)

tech_stack_added: []
tech_stack_patterns:
  - "UTC-only date arithmetic (Date.UTC + setUTCDate/setUTCMonth) — extends the existing isoWeek/datesInWeek convention"
  - "Shape-parametrized helpers ({ shape: 'week' | 'month' }) — preserves byte-equality for the lifting baseline"
  - "Whole-word case-insensitive regex matching via escapeRegex + \\b boundaries — D-11 compliance"

key_files:
  created:
    - src/core/metrics.js
    - test/metrics.test.js
  modified:
    - src/utils/format.js
    - test/format.test.js
    - src/commands/report.js

decisions:
  - "Lifted buildMetrics into src/core/metrics.js (D-10 default home; STRUCTURE.md core-area rule)"
  - "Weekly path passes shape: 'week' explicitly to document intent and survive future default-flips"
  - "Components-touched algorithm uses whole-word regex per D-11, NOT topics.js's substring includes()"
  - "Day-0-of-next-month trick chosen for datesInMonth length computation — single new Date.UTC call per month"
  - "Reused isoWeek as-is in weeksInMonth — no ISO-week math reimplementation"

metrics:
  duration_min: 5
  start: "2026-05-08T16:32:50Z"
  completed: "2026-05-08T16:37:15Z"
  tasks_total: 2
  tasks_completed: 2
  commits: 4
  files_changed: 5
  tests_added: 17
  tests_total_after: 158
---

# Phase 2 Plan 1: Lift buildMetrics + add month-date helpers — Summary

**One-liner:** Lifted weekly's `buildMetrics` into a shape-parametrized `src/core/metrics.js` and added three UTC-only month helpers (`datesInMonth`, `priorMonth`, `weeksInMonth`) so Plan 02-02's monthly orchestrator and Plan 02-03's auto-backfill can consume the same primitives the weekly path already uses — all without changing the `--week` output a single byte.

## Tasks Completed

| # | Task | TDD gates | Commits |
|---|------|-----------|---------|
| 1 | Add `datesInMonth` / `priorMonth` / `weeksInMonth` to `src/utils/format.js` | RED → GREEN | `278e188` (RED), `046d0ce` (GREEN) |
| 2 | Lift `buildMetrics` into `src/core/metrics.js`, refactor `src/commands/report.js`, add `test/metrics.test.js` | RED → GREEN | `9a0239a` (RED), `4144ecb` (GREEN) |

## Files Created

- **`src/core/metrics.js`** (91 lines) — exports `buildMetrics(dates, opts)`. Reads raw dailies via `parseDailyFile` (D-12 source-of-truth rule). Two shapes:
  - `shape: 'week'` (default) emits the historical four-line block byte-identical to the pre-refactor weekly helper.
  - `shape: 'month'` adds two extra lines: `Days with logs:` (its own line, D-09) and `Components touched:` (whole-word case-insensitive matching, D-11) using `escapeRegex` + `\b` boundaries.
  - `components` accepts both `string` and `{ slug, keywords }` shapes (matches `src/core/topics.js` precedent).
- **`test/metrics.test.js`** (118 lines, 7 tests) — XDG-isolated tmp-vault setup mirroring `test/log-parser.test.js`. Covers byte-equality regression guardrail, default-shape parity, month-shape additions, whole-word vs substring distinction, string-shaped component config, empty-input em-dash fallback, and empty-dates month case.

## Files Modified

- **`src/utils/format.js`** (+44 lines) — new exports `datesInMonth`, `priorMonth`, `weeksInMonth`; new private `parseYYYYMM` validator. UTC-only accessors only; throws `Invalid YYYY-MM: <input>` on bad format or out-of-range month.
- **`test/format.test.js`** (+70 lines, +10 tests) — 12 → 22 tests. Covers regular / leap / year-end month lengths, January year-rollover for `priorMonth`, the W14..W18 example from D-04, year-boundary ISO weeks for `weeksInMonth`, dedupe + first-occurrence-order invariant.
- **`src/commands/report.js`** (147 → 109 lines, −38 lines) — added `import { buildMetrics } from '../core/metrics.js';`, dropped now-unused `parseDailyFile` import, removed the 36-line local `buildMetrics` function definition, updated the call site to `await buildMetrics(present, { shape: 'week' })`. The `--week` orchestration flow, soft-fail to dry-run, prior-report loading, prompt assembly, and final write are otherwise untouched.

## Public API (recorded for Plan 02-02)

```javascript
// src/utils/format.js
datesInMonth(monthStr: string): string[]   // YYYY-MM-DD, length = days-in-month
priorMonth(monthStr: string): string       // YYYY-MM, January→prior-December rollover
weeksInMonth(monthStr: string): string[]   // YYYY-Www, deduped, first-occurrence order

// src/core/metrics.js
buildMetrics(
  dates: string[],
  opts?: {
    shape?: 'week' | 'month',                                       // default 'week'
    components?: Array<string | { slug: string, keywords?: string[] }>,  // default []
  },
): Promise<string>                          // joined metric-line string, no trailing newline
```

All three format helpers throw `Invalid YYYY-MM: <input>` on malformed input or month outside 01..12.

## Verification

| Check | Result |
|-------|--------|
| `node --test test/format.test.js` | 22/22 pass |
| `node --test test/metrics.test.js` | 7/7 pass |
| `node --test` (whole suite) | **158/158 pass** (was 141 baseline; +17 new) |
| `weeksInMonth('2026-04')` smoke | Returns `["2026-W14","2026-W15","2026-W16","2026-W17","2026-W18"]` |
| No new local-tz Date accessors in `format.js` | OK (only pre-existing hits in `todayISO` and `isoWeek` where the result is immediately wrapped in `Date.UTC`) |
| `report.js` no longer defines `buildMetrics` locally | OK |
| `report.js` line count drop | 147 → 109 (−38, matches plan's "roughly 38 lines shorter" expectation) |

The byte-equality regression guardrail (`test('buildMetrics shape:week matches the pre-refactor weekly format', ...)`) passes against the canned daily fixture: weekly output remains exactly four lines (Sessions / Tickets / PRs / Force-pushes) and explicitly does NOT emit the month-only lines.

## Deviations from Plan

### Rule 1 (bug) — Test fixture used a string the existing PR regex doesn't capture

**Found during:** Task 2 GREEN gate (test failed unexpectedly).

**Issue:** The plan's canned test fixture contained `closed pull/9999, …` and the test asserted `#9999` would appear in the `**PRs touched:**` line. The pre-refactor PR regex (kept verbatim during the lift) is `/(?:\b(?:PR|pull)\s*#?|#)(\d{2,5})\b/gi`. Tracing it against `pull/9999`:

- The first alternative `\b(?:PR|pull)\s*#?` matches `pull` and consumes zero whitespace and zero `#`; the next required token is `\d{2,5}`, but the next character in the input is `/`, not a digit. No match.
- The second alternative `#` requires a literal `#` before the digits. There is no `#` in `pull/9999`. No match.

So `#9999` is never captured — and the **pre-refactor** `buildMetrics` would have produced the exact same `#4521`-only output for this fixture. The byte-equality guardrail was actually satisfied; the test expectation was wrong.

**Fix:** Changed the fixture from `closed pull/9999` to `closed pull #9999` so the test asserts what the regex actually does. The regression-guardrail spirit (weekly output must not change after the lift) is preserved — the new helper produces the same output the old one would have for the same input.

**Files modified:** `test/metrics.test.js` (one-character fixture edit)
**Commit:** included in `4144ecb`

No CLAUDE.md violations, no architectural changes, no Rule-4 escalation needed.

## Threat Surface

The plan's `<threat_model>` covered:

- **T-02-01-01 (Tampering, monthStr validation):** Mitigated by `parseYYYYMM` — regex `^(\d{4})-(\d{2})$` plus 1..12 month-range check. Tests `datesInMonth throws on bad format` and `priorMonth throws on bad format` cover the bad-format and out-of-range cases.
- **T-02-01-02 (Tampering, regex metachar injection in components):** Mitigated by `escapeRegex` interpolation around every keyword before `\b…\b` wrapping. An adversarial `keywords: ['.+']` value cannot match arbitrary text — it matches the literal three-character string `.+` only.

No new threat surface introduced by this plan beyond what the threat model already enumerated.

## Self-Check: PASSED

Files exist:

- `src/core/metrics.js` — FOUND
- `test/metrics.test.js` — FOUND
- `src/utils/format.js` — modified (datesInMonth/priorMonth/weeksInMonth added)
- `test/format.test.js` — modified (10 new tests)
- `src/commands/report.js` — modified (buildMetrics local definition removed; import added)

Commits exist on `worktree-agent-ab527f1c8fbbab31e`:

- `278e188` (RED task 1) — FOUND
- `046d0ce` (GREEN task 1) — FOUND
- `9a0239a` (RED task 2) — FOUND
- `4144ecb` (GREEN task 2) — FOUND

Test totals: 158/158 pass (was 141 baseline) — VERIFIED.
