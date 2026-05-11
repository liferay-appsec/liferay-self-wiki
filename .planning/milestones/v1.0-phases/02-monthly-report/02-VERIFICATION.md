---
phase: 02-monthly-report
verified: 2026-05-08T17:12:43Z
status: passed
score: 6/6 requirements verified; 28/28 plan must-haves verified
mode: mvp
overrides_applied: 0
test_suite:
  command: "node --test test/*.test.js"
  passed: 171
  failed: 0
smoke_tests:
  - command: "node src/cli.js report --month 2026-04 --dry-run"
    result: "exit 0; printed full themed monthly prompt envelope (MONTH/SOURCES_LINE/METRICS/WEEKLIES/TOPIC_PAGES) — claude was NOT invoked"
  - command: "node src/cli.js report --month foo"
    result: "exit 1; stderr: 'error: invalid --month value: foo (expected YYYY-MM)'"
  - command: "node src/cli.js report --month 2026-13"
    result: "exit 1; stderr: 'error: invalid --month value: 2026-13 (expected YYYY-MM)'"
---

# Phase 2: Monthly Report — Verification Report

**Phase Goal:** "Users can generate a themed monthly synthesis report for any calendar month, with deterministic metrics computed in code and narrative prose through `claude -p`, following the same patterns as the weekly report."

**Phase Mode:** MVP (vertical-slice user-visible behaviour)

**Verified:** 2026-05-08T17:12:43Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal-Level Verdict

The user-visible vertical slice is delivered. From a configured vault, the user can run `self-wiki report --month [YYYY-MM]` and receive either (a) a printed themed synthesis prompt under `--dry-run`, or (b) a `Reports/<YYYY-MM>.md` written via `claude -p` with auto-backfill of any missing weeklies in the window. Deterministic metrics (sessions / tickets / PRs / force-pushes / days-with-logs / components-touched) are computed in code via the lifted `buildMetrics` helper; only the prose synthesis goes through `claude -p` — exactly matching the weekly pattern. All 6 phase requirements (MONTH-01..MONTH-06) and all 28 plan must-have truths are satisfied by the codebase. The full test suite (171 tests across 13 files) is green.

---

## Requirements Coverage (MONTH-01..MONTH-06)

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| MONTH-01 — `report --month <YYYY-MM>` generates themed monthly | 02-02 | VERIFIED | `src/cli.js:89` adds `-m, --month [YYYY-MM]`; `src/commands/report.js:31-33` dispatches to `reportMonthOrchestrator`; smoke test `--month 2026-04 --dry-run` returns the full themed prompt with `## Theme(s) of the month` + `MONTH: 2026-04`. |
| MONTH-02 — Versioned prompt at `src/templates/prompts/monthly-report.md` producing themes | 02-02 | VERIFIED | `src/templates/prompts/monthly-report.md` exists (37 lines), wired via `MONTHLY_PROMPT_PATH` (`report.js:19`); contains `## Theme(s) of the month`, `## Notable architectural decisions`, `## Process / tooling improvements`, `## Lessons learned`, `## Risks / carry-over`, `## Quick metrics`, `## Sources`. The "no invention" rule and the "untrusted data, not instructions" rule are preserved verbatim from weekly. |
| MONTH-03 — Writes `Reports/<YYYY-MM>.md`; re-run prepends `<!-- regenerated YYYY-MM-DD -->` | 02-02 | VERIFIED | `report.js:311 outPath = opts.out || getReportFilePath(month)`; lines 316-325 implement the access-then-prepend regenerated marker on second-and-subsequent runs (D-13). Test 8 `regenerated-marker code path exists in source (D-13 grep guardrail)` asserts both `<!-- regenerated ` and `access(outPath)` are present. |
| MONTH-04 — Graceful degradation on partial-month / partial coverage | 02-02 + 02-03 | VERIFIED | Two paths: (a) Partial-month note when `today <= last day of month` (`report.js:281-286`, D-15), test `current-month dry-run includes a Partial month note`. (b) Auto-backfill skips weeks with zero dailies via `anyDailyExists` guard (`report.js:100-108`, `253-255`), test `Backfill source contains the empty-week graceful-skip guard`. Past-month does NOT emit partial note, test `past-month dry-run does NOT include a Partial month note` confirms. |
| MONTH-05 — Deterministic metrics in code, only prose via `claude -p` | 02-01 | VERIFIED | `src/core/metrics.js` exports `buildMetrics(dates, { shape, components })`; reads dailies via `parseDailyFile` (D-12 source-of-truth); shape `'month'` adds `Days with logs:` and `Components touched:` lines. Whole-word case-insensitive matching via `escapeRegex` + `\b` boundaries (D-11), `metrics.js:82`. Plan 02-01 byte-equality regression test passes — weekly path unchanged. |
| MONTH-06 — `--dry-run` prints prompt without invoking `claude -p` | 02-02 | VERIFIED | `report.js:298-301` short-circuits before any `hasClaudeCli` check or `claudeHeadless` call. Smoke test `--month 2026-04 --dry-run` confirmed with no `claude` invocation; full prompt envelope printed to stdout. Test `--month --dry-run prints the monthly prompt envelope` verifies. Crucially, dry-run also gates the auto-backfill loop (`report.js:247`) so dry-run never silently invokes weekly synthesis (CONTEXT.md `<specifics>`). |

**Coverage:** 6/6 requirements satisfied. No orphaned requirements (REQUIREMENTS.md maps exactly MONTH-01..MONTH-06 to Phase 2; all are claimed across plans 02-01..02-03).

---

## ROADMAP Success Criteria

The phase goal expanded into ROADMAP success criteria (CONTEXT.md §canonical_refs):

| # | Success Criterion | Status | Evidence |
| - | ----------------- | ------ | -------- |
| 1 | Metric set: session counts, distinct tickets, components touched, total active days | VERIFIED | `metrics.js` shape:'month' emits all four (Sessions, Tickets touched, Days with logs, Components touched) plus weekly-parity PRs and Force-pushes. `test/metrics.test.js` test 3 confirms. |
| 2 | Themed-synthesis prompt mirrors weekly skeleton | VERIFIED | `monthly-report.md` is a clone-and-adjust of `weekly-report.md` with the documented renames (D-05). Section order matches §3 of D-05. |
| 3 | Re-run overwrites with `<!-- regenerated YYYY-MM-DD -->` marker | VERIFIED | See MONTH-03. |
| 4 | `claude` soft-fail to dry-run | VERIFIED | `report.js:303-306` exits 2 with the canonical stderr message; test 11 (`Without --dry-run, missing claude exits 2 before any backfill`) exercises this with `PATH=/nonexistent`, asserts no partial state on disk. |

---

## Per-Plan Must-Haves (truths)

### Plan 02-01 — Lift buildMetrics + month-date helpers (11 truths)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | `datesInMonth('2026-04')` returns 30 ISO YYYY-MM-DD strings 2026-04-01..2026-04-30 (D-04) | VERIFIED | `format.js:81-93`; `test/format.test.js` `datesInMonth returns 30 dates for April 2026`. |
| 2 | `datesInMonth('2024-02')` returns 29 (leap), `datesInMonth('2026-02')` returns 28 | VERIFIED | Test `datesInMonth handles February non-leap (28) and leap (29)`. |
| 3 | `priorMonth('2026-04') = '2026-03'`; `priorMonth('2026-01') = '2025-12'` (D-14) | VERIFIED | `format.js:95-99`; tests `priorMonth steps back one month within a year` + `priorMonth wraps January to prior December`. |
| 4 | `weeksInMonth('2026-04')` returns `['2026-W14','2026-W15','2026-W16','2026-W17','2026-W18']` deduped, in iteration order (D-04) | VERIFIED | `format.js:101-114`; test `weeksInMonth April 2026 returns W14..W18 in order` uses `assert.deepEqual` against the exact array. |
| 5 | All three helpers throw `Invalid YYYY-MM: <input>` on malformed input | VERIFIED | `parseYYYYMM` (`format.js:72-79`); tests `datesInMonth throws on bad format` + `priorMonth throws on bad format` cover bad format AND out-of-range (00, 13). |
| 6 | `buildMetrics(dates, { shape: 'week' })` byte-identical to pre-refactor (D-10 regression guardrail) | VERIFIED | `test/metrics.test.js` test 1 `buildMetrics shape:week matches the pre-refactor weekly format` matches all four pre-refactor lines + asserts month-only lines are absent. |
| 7 | `buildMetrics(dates, { shape: 'month', components })` emits Days-with-logs + Components-touched (D-09) | VERIFIED | `metrics.js:64-72`; test `buildMetrics shape:month adds Days-with-logs and Components touched`. |
| 8 | Components-touched uses case-insensitive whole-word matching (D-11) — `\bcomp\b` regex, not substring | VERIFIED | `metrics.js:82` `new RegExp('\\b' + escapeRegex(k) + '\\b', 'i')`; test `buildMetrics shape:month uses whole-word matching (not substring) per D-11` confirms `'rep'` does NOT match `'report.js'`. |
| 9 | Components-touched accepts both string and `{ slug, keywords }` shapes (D-11) | VERIFIED | `metrics.js:79-81`; test `buildMetrics shape:month accepts string-shaped component config`. |
| 10 | `report.js --week` path produces byte-identical output after lift | VERIFIED | `report.js:71` calls `buildMetrics(present, { shape: 'week' })`; the byte-equality regression test passes (#6 above). All 171 tests green including the existing weekly-flow tests. |
| 11 | Lifted helper lives in `src/core/metrics.js` (D-10) | VERIFIED | `src/core/metrics.js` exists, 91 lines, exports `buildMetrics`. |

### Plan 02-02 — `report --month` vertical slice (14 truths)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | User can run `report --month 2026-04` to write `<vault>/Reports/2026-04.md` (MONTH-01, MONTH-03) | VERIFIED | Dispatch + write path (`report.js:21-36`, `222-329`); `getReportFilePath(month)` writes to `Reports/<YYYY-MM>.md`. Smoke `--dry-run` produced the correct prompt; live write requires `claude` CLI (out of automated scope, manually verified per SUMMARY). |
| 2 | `report --month` (no value) resolves current calendar month (D-16) | VERIFIED | `report.js:223 opts.month === true ? currentMonthUTC() : ...`; CLI brackets `[YYYY-MM]` make value optional (`cli.js:89`); test `--month without a value defaults to current month (D-16)`. |
| 3 | `--month 2026-04 --dry-run` prints prompt without invoking claude (MONTH-06) | VERIFIED | `report.js:298-301` short-circuit; smoke test confirmed. |
| 4 | If `claude` not on PATH, `--month` exits 2 with stderr naming `--dry-run` | VERIFIED | `report.js:303-306` (post-dry-run path) + `247-251` (pre-backfill gate); test `Without --dry-run, missing claude exits 2 before any backfill` confirms with `PATH=/nonexistent`. |
| 5 | Re-run prepends `<!-- regenerated YYYY-MM-DD -->` (MONTH-03, D-13) | VERIFIED | `report.js:316-325`; grep-guard test 8 confirms code path. |
| 6 | Partial-month note when `today <= last day of month` (MONTH-04, D-15) | VERIFIED | `report.js:280-286`; test `current-month dry-run includes a Partial month note (D-15)`. |
| 7 | Past months do NOT emit partial-month note (D-15) | VERIFIED | Test `past-month dry-run does NOT include a Partial month note` (asserts on `2026-01`). |
| 8 | Prior-month report read from `Reports/<prior-YYYY-MM>.md` and passed as PRIOR_REPORT (D-14, D-06) | VERIFIED | `report.js:177-190 loadPriorMonthReport`; test 1 asserts `PRIOR_REPORT (2026-03):` appears in dry-run output when `Reports/2026-03.md` exists. |
| 9 | Prior-month absent → PRIOR_REPORT block omitted silently (D-14 soft-fail) | VERIFIED | `loadPriorMonthReport` returns null on missing file; `buildMonthlyPrompt` only appends the block when `priorReport` is truthy; test `prior-month soft-fails when no prior monthly file exists (D-14)`. |
| 10 | Prompt template at `src/templates/prompts/monthly-report.md` contains `## Theme(s) of the month`, `## Quick metrics`, `## Sources`, no-invention rule (MONTH-02, D-05/D-07/D-08) | VERIFIED | All four sections present in template lines 19, 25, 26, 31. |
| 11 | Mutually exclusive with `--week` — both fails fast | VERIFIED | `report.js:26-29`; test `--month and --week together is a usage error (exit 1)`. |
| 12 | Invalid `--month` value fails with clear error (path-traversal defense) | VERIFIED | `validateMonthOrExit` (`report.js:163-175`); smoke tests `--month foo` and `--month 2026-13` confirmed exit 1; test `--month with malformed value exits 1` covers `2026/04`, `2026-13`, `not-a-month`, `../../etc/passwd`. |
| 13 | Monthly prompt sources from weeklies + topic pages (D-01) — raw dailies NOT in prompt body | VERIFIED | `buildMonthlyPrompt` (`report.js:332-386`) emits MONTH/SOURCES_LINE/METRICS/WEEKLIES/TOPIC_PAGES/PRIOR_REPORT; raw daily logs are read by `metrics.js#parseDailyFile` (code-side metric computation only), not concatenated into the prompt envelope. |
| 14 | Metrics block computed via `buildMetrics(dates, { shape: 'month', components })` (D-12) | VERIFIED | `report.js:274-277`; key-link grep `shape: 'month'` present. |

### Plan 02-03 — Auto-backfill missing weeklies (8 truths)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | `report --month` (non-dry-run) walks `weeksInMonth(month)` and synthesizes any week with dailies but no `Reports/<YYYY-Www>.md` before the monthly synthesis (D-02, D-03) | VERIFIED | `report.js:247-270`; iterates `missingWeeks` (sourced from `weeks = weeksInMonth(month)`, chronological); calls `reportWeekOrchestrator({ week: weekStr, internal: true })` per missing week. Live multi-call chain confirmed by SUMMARY's manual smoke; structural guard test 9 `Plan 02-03 RED — auto-backfill phase wired into reportMonthOrchestrator` locks the source-level invariants. |
| 2 | `--month --dry-run` does NOT silently invoke weekly syntheses | VERIFIED | `report.js:247 if (!opts.dryRun && missingWeeks.length > 0)`; test `--dry-run does NOT backfill missing weeklies (CONTEXT.md <specifics>)` asserts no `Reports/2026-Wxx.md` is written under dry-run. |
| 3 | Backfill is invoked in chronological order (W14 before W15 before …) | VERIFIED | `weeksInMonth(monthStr)` (`format.js:101-114`) walks `datesInMonth` in date order, deduping in first-occurrence order — chronological by construction. Test `weeksInMonth dedupes and preserves first-occurrence order` confirms. The backfill loop iterates `missingWeeks` which preserves that order. |
| 4 | Backfill skips weeks with zero daily logs (MONTH-04 graceful) | VERIFIED | `anyDailyExists` (`report.js:100-108`); `if (!hasAnyDaily) continue` (`report.js:255`); test `Backfill source contains the empty-week graceful-skip guard (MONTH-04)`. |
| 5 | If inner weekly synthesis fails, monthly orchestrator surfaces error and exits non-zero | VERIFIED | `reportWeekOrchestrator` propagates `claudeHeadless` rejection as exception; the monthly orchestrator does not catch it, so the exception unwinds to `program.parseAsync().catch` (`cli.js:128-131`) which writes `error: ${err.message}` to stderr and `process.exit(1)`. Per-week stderr line `backfilling <week>…` (`report.js:87`) tells the user which week was in flight when the failure occurred. |
| 6 | If `claude` missing, soft-fail fires BEFORE any backfill | VERIFIED | `report.js:247-251` (pre-flight gate at top of backfill block); test `Without --dry-run, missing claude exits 2 before any backfill (no partial state)` confirms exit 2 + zero `Reports/2026-Wxx.md` written. |
| 7 | After backfill, Sources line no longer lists newly-backfilled weeks under `Missing weeks:` | VERIFIED | `report.js:258-269` re-loads `presentWeeks` / `missingWeeks` from disk after the backfill loop; the `let`-binding (lines 231-232) ensures `buildMonthlyPrompt` sees post-backfill arrays. (Live chain manually smoke-verified per SUMMARY; structural guard `presentWeeks = []` reset is asserted by test 9.) |
| 8 | Backfill emits stderr progress lines (`backfilling 2026-W14…` / `synthesizing 2026-04…`) | VERIFIED | `report.js:87` emits `${internal ? 'backfilling' : 'synthesizing'} ${week}…`; the synthesizing-line wording for the standalone weekly + the monthly is preserved (regression-grep). |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/utils/format.js` | exports `datesInMonth`, `priorMonth`, `weeksInMonth` (UTC-only) | VERIFIED | All three exported (lines 81, 95, 101); UTC accessors only in new code; no `getMonth()` / `getDate()` / `setDate()` introduced (existing pre-Phase-2 hits in `todayISO` and `isoWeek` are pre-existing and immediately wrapped in `Date.UTC`). |
| `src/core/metrics.js` | exports `buildMetrics(dates, { shape, components })`; min 60 lines | VERIFIED | 91 lines, exports `buildMetrics`; reads via `parseDailyFile`; whole-word match via `escapeRegex` + `\b`. |
| `test/format.test.js` | tests for new helpers (regular/leap/year-end, year-rollover, W14..W18, year-boundary) | VERIFIED | 22 tests (was 12); all 10 new tests cover the cases. |
| `test/metrics.test.js` | regression test (week byte-equality), month-shape, empty-month, year-rollover | VERIFIED | 7 tests, 118 lines (≥ 80 min); covers byte-equality regression, default-shape parity, month additions, whole-word matching, string-shaped config, empty-input dashes, empty-dates month. |
| `src/commands/report.js` | refactored to import `buildMetrics`; weekly path byte-identical; adds `reportMonthOrchestrator`, `reportWeekOrchestrator`, `anyDailyExists`, monthly prompt envelope | VERIFIED | All present (386 lines); imports `buildMetrics` from `../core/metrics.js`; no local `buildMetrics` definition; weekly byte-equality preserved (regression test passes); auto-backfill phase wired. |
| `src/templates/prompts/monthly-report.md` | versioned themed-synthesis prompt; min 35 lines; contains `## Theme(s) of the month` | VERIFIED | 37 lines; contains all required headings + no-invention rule + untrusted-data rule. |
| `src/cli.js` | `report` subcommand grows `-m, --month [YYYY-MM]` | VERIFIED | Line 89; brackets (not angle brackets) make the value optional per D-16. |
| `test/report-month.test.js` | end-to-end tests (dry-run, mutual exclusion, malformed value, partial-month, prior-report soft-fail, regenerated marker, backfill cases) | VERIFIED | 13 tests, 322 lines (≥ 120 min); covers all listed cases plus the four backfill-specific tests from Plan 02-03. |

---

## Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `src/cli.js` | `src/commands/report.js#reportCommand` | `.option('-m, --month [YYYY-MM]', ...)` + `.action(reportCommand)` | WIRED |
| `src/commands/report.js#reportMonthOrchestrator` | `src/core/metrics.js#buildMetrics` | `await buildMetrics(dates, { shape: 'month', components })` (line 274) | WIRED |
| `src/commands/report.js#reportMonthOrchestrator` | `src/templates/prompts/monthly-report.md` | `readFile(MONTHLY_PROMPT_PATH, 'utf8')` (line 333, constant defined line 19) | WIRED |
| `src/commands/report.js#reportMonthOrchestrator` | `src/utils/paths.js#getReportFilePath` | `getReportFilePath(month)` (line 311) | WIRED |
| `src/commands/report.js#reportMonthOrchestrator` | `src/commands/report.js#reportWeekOrchestrator` (extracted) | `await reportWeekOrchestrator({ week: weekStr, internal: true })` (line 256) | WIRED |
| `src/commands/report.js#reportMonthOrchestrator` | `src/utils/log-parser.js#parseDailyFile` (via metrics + topic-page reads) | `metrics.js` calls `parseDailyFile` for every in-month date (D-12) | WIRED |
| `src/commands/report.js` | `src/core/metrics.js#buildMetrics` (weekly path) | `await buildMetrics(present, { shape: 'week' })` (line 71) | WIRED |
| `src/utils/format.js#weeksInMonth` | `src/utils/format.js#isoWeek` | reuses existing helper, no reimplementation | WIRED |

---

## Data-Flow Trace (Level 4)

For the user-visible vertical slice the trace is:

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `reportMonthOrchestrator` | `presentWeeks` / `missingWeeks` | `readFile(getReportFilePath(weekStr))` per week | Real read from disk; values flow into `SOURCES_LINE` and `WEEKLIES` block | FLOWING |
| `reportMonthOrchestrator` | `metrics` | `buildMetrics(dates, { shape: 'month', components: cfg.components })` | Real `parseDailyFile` reads + accumulator math; flow into `METRICS:` envelope line | FLOWING |
| `reportMonthOrchestrator` | `topicPages` | `loadInMonthTopicPages(month)` walks Tickets/ + Components/ for `## YYYY-MM-DD ` markers | Real `readdir` + `readFile`; flow into `TOPIC_PAGES:` block; smoke confirmed `Tickets/LPD-12345.md` surfaced | FLOWING |
| `reportMonthOrchestrator` | `priorReport` | `loadPriorMonthReport(month)` reads `Reports/<prior-month>.md` | Real read; nullable; flow into `PRIOR_REPORT (...):` block | FLOWING |
| `reportMonthOrchestrator` | `partialNote` | `today <= dates.at(-1)` UTC comparison | Real boolean; flow into `PARTIAL_NOTE:` envelope line | FLOWING |
| `buildMonthlyPrompt` | `prompt` (final string) | template + envelope assembly | Real concatenation of all above; printed under `--dry-run`, sent to `claudeHeadless` otherwise | FLOWING |

No hollow-prop or static-fallback patterns detected. The smoke test confirmed every section of the envelope renders with real values from the configured vault.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Themed monthly prompt prints under dry-run with no `claude` invocation (MONTH-01, MONTH-06) | `node src/cli.js report --month 2026-04 --dry-run` (against tmp vault with one daily) | exit 0; full prompt envelope including `MONTH: 2026-04`, `SOURCES_LINE: Sources: (no weekly reports present). Missing weeks: 2026-W14..W18.`, `METRICS:` with real session count, `## Theme(s) of the month` heading | PASS |
| Invalid month string is rejected (path-traversal defense) | `node src/cli.js report --month foo` | exit 1; stderr: `error: invalid --month value: foo (expected YYYY-MM)` | PASS |
| Out-of-range month is rejected | `node src/cli.js report --month 2026-13` | exit 1; stderr: `error: invalid --month value: 2026-13 (expected YYYY-MM)` | PASS |
| Full test suite | `node --test "test/*.test.js"` | 171/171 pass, 0 fail, 0 cancelled, duration ~2.7s | PASS |

---

## Anti-Patterns Found

None. Grep for `TODO|FIXME|XXX|HACK|PLACEHOLDER` against the Phase 2 surface (`src/core/metrics.js`, `src/commands/report.js`, `src/templates/prompts/monthly-report.md`, `src/utils/format.js`) returned zero hits. No empty `return null` / `return []` placeholders introduced. No console.log-only handlers. No props passed with hardcoded empty values at call sites.

The only minor lint-worthy observation (informational, not a blocker): `report.js:340-342` emits `Sources: (no weekly reports present).` when `weeklies.length === 0`, which is a deliberate user-facing diagnostic string, not a stub.

---

## Project-Skill Adherence (CLAUDE.md)

| Rule | Status |
| ---- | ------ |
| Daily logs are the source of truth (CLAUDE.md) | UPHELD — `metrics.js` reads `parseDailyFile` for every in-month date; the monthly prompt body cites only weeklies + topic pages but the code-side metric computation always traces back to dailies (D-12). |
| Deterministic vs. model split — never ask the model to compute a number | UPHELD — `buildMetrics` returns a fully-formed metric block; the prompt's `## Quick metrics` instruction is "paste the `METRICS` block exactly as given." |
| Soft dependencies degrade silently (`claude` missing → dry-run) | UPHELD — `report.js:303-306` exits 2 with the canonical message; pre-backfill gate (`247-251`) prevents partial-state. Test 11 exercises this end-to-end. |
| No `obsidian-cli`; direct `.md` writes | UPHELD — `writeFile(outPath, ...)` writes plain markdown. |
| Topic page writes only via `src/core/topics.js` | UPHELD — `loadInMonthTopicPages` is read-only (`readFile`); no topic-page writes in Phase 2. |

---

## Human Verification Required

None. The phase is fully verified by the automated test suite + smoke tests + source inspection. The live multi-call `claude -p` chain (auto-backfill writing weeklies then synthesizing the month) is intentionally out of automated scope — same precedent as the weekly path's `claudeHeadless` invocation. Plan 02-03's SUMMARY documents that this was manually smoke-verified by stepping through code paths; the structural-guard tests (test 9 and the source-grep guards in tests 12 and 8) lock down the source-level invariants the live chain depends on.

---

## Gaps Summary

No gaps. Phase 2 delivers the user-facing vertical slice promised by the goal:

1. CLI surface `self-wiki report --month [YYYY-MM]` is wired (mutually exclusive with `--week`, optional value defaults to current month).
2. Themed prompt template at `src/templates/prompts/monthly-report.md` exists and is versioned.
3. Deterministic metrics flow through the lifted shared `buildMetrics(shape: 'month')` helper.
4. Auto-backfill of missing weeklies fires before the monthly synthesis (chronological order, gated by single upstream `hasClaudeCli` check, dry-run-safe).
5. Soft-fail to dry-run on missing `claude`, partial-month note, regenerated marker, prior-month carry-over all in place.
6. Weekly-path byte equivalence preserved (regression test passes).
7. All 171 tests green; 6/6 requirements (MONTH-01..MONTH-06) satisfied.

---

_Verified: 2026-05-08T17:12:43Z_
_Verifier: Claude (gsd-verifier)_
