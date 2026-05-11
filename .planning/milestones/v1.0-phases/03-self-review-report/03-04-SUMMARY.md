---
phase: 03-self-review-report
plan: 04
subsystem: reviews-core
tags: [reviews-core, window-resolution, prior-review, prompt-builder, tdd]

# Dependency graph
requires:
  - phase: 01-cycle-config-vault-scaffold
    provides: resolveCycle (Option B semantics) + ensureReviewsDir + vault config schema (review.cycleEndMonths, review.lastReviewedAt)
  - phase: 03-self-review-report/02
    provides: getReviewFilePath helper + monthsInRange + datesInMonth
  - phase: 03-self-review-report/03
    provides: src/templates/prompts/self-review.md prompt template (read at runtime via SELF_REVIEW_PROMPT_PATH)
provides:
  - resolveReviewWindow(args) — REVIEW-02 precedence (--cycle > --last-cycle > --since > vaultConfig.lastReviewedAt > D-01 default) + D-04 off-boundary snap
  - loadPriorCycleReview(args) — D-12 manual-wins-on-collision + auto-detect Q3 extraction
  - loadInCycleTopicPages(dates) — REVIEW-05 in-cycle topic-page walk (Tickets/ + Components/)
  - buildSelfReviewPrompt(args) — REVIEW-06 + D-08 + D-13 prompt-envelope assembly
  - SELF_REVIEW_PROMPT_PATH constant alongside MONTHLY_PROMPT_PATH / WEEKLY_PROMPT_PATH
affects: [03-05-self-review-orchestrator, 03-06-self-review-command]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED → GREEN per task; each task ships two commits (failing test + implementation)"
    - "Round-trip cycleName validation via resolveCycle probe (parseCycleName) — guards against cycleEndMonths/cycleName mismatch without re-implementing cycle math"
    - "Soft-fail (return null) on every external file read in loadPriorCycleReview, matching loadPriorMonthReport's precedent"
    - "Envelope-marker convention: header tokens that appear in the prompt-template documentation (PRIOR_GROWTH_FOCUS, PRIOR_REVIEW) MUST be tested against the envelope-specific shape (with opening paren / colon) — not against the bare token (lessons learned from the Task-2 RED→GREEN trip)"

key-files:
  created: []
  modified:
    - src/core/reviews.js (18 lines → 386 lines; four new exports + SELF_REVIEW_PROMPT_PATH)
    - test/reviews.test.js (4 tests → 29 tests; 25 new tests across the four exports)

key-decisions:
  - "Off-boundary --since snaps cycleName to the enclosing cycle via resolveCycle(sinceISO, cem).current and emits partialNote in the resolveReviewWindow result. The Reviews/<cycleName>.md filename is therefore always a real cycle name (D-04)."
  - "parseCycleName probes the LAST cycle's end-month differently from non-last cycles: probeMonth=12 for the last cycle (Option B ends Dec 31), probeMonth=(reviewMonth - 1) for non-last cycles (Option B ends month-before-review-month). The defensive name-mismatch error is unreachable under valid cycleEndMonths but the throw is kept for future schema changes."
  - "extractQ3 anchors on /^## 3\\b/ rather than the full Liferay-form heading. The prompt template (plan 03-03) mandates the exact heading, but tolerating minor wording drift in extractQ3 makes future prompt-template iteration a single-file edit (REVIEW-06 spirit)."
  - "loadInCycleTopicPages anchors on `^## <date>\\b` (multiline) — same regex pattern as report.js#loadInMonthTopicPages — so a future formatting tweak of src/core/topics.js#appendDatedSection does not silently drop topic pages from synthesis. Date set expanded from in-month (~30) to in-cycle (~120)."
  - "buildSelfReviewPrompt enforces the manual-PRIOR_REVIEW-vs-autoQ3-PRIOR_GROWTH_FOCUS invariant via an if/else-if chain even though loadPriorCycleReview already enforces it. Defensive double-check so a future caller cannot inadvertently emit both blocks."

patterns-established:
  - "Per-input source attribution at file granularity in the SOURCES_LINE: \`Monthlies: \`Reports/<m>.md\`, ...\` / \`Weeklies: \`Reports/<w>.md\`, ...\` / \`Topic pages: \`<kind>/<slug>.md\`, ...\` — REVIEW-09 + D-13 at the envelope level."
  - "WINDOW_NOTE block concatenates partialNote (D-04 partial slice) and missingMonthlyNote (D-07 dry-run). Either, both, or neither — the surrounding 'WINDOW_NOTE:' header only appears when at least one is non-empty."
  - "Test setup pattern for vault-aware unit tests: extend the before() hook to set XDG_DATA_HOME/XDG_CONFIG_HOME, mkdir the tmp Reviews/ directory, and call setVaultPath. This mirrors test/report-month.test.js's vault-aware harness."

requirements-completed: [REVIEW-02, REVIEW-05, REVIEW-06, REVIEW-09]

# Metrics
duration: 6min
completed: 2026-05-11
---

# Phase 3 Plan 04: Self-Review Building Blocks Summary

**`src/core/reviews.js` grows from 18 → 386 lines with four new exports (resolveReviewWindow, loadPriorCycleReview, loadInCycleTopicPages, buildSelfReviewPrompt) plus SELF_REVIEW_PROMPT_PATH — every piece of pure read-side and prompt-construction logic the wave-4 orchestrator (plan 03-05) will compose, with 25 new tests locking precedence, snap, manual-wins, Q3 extraction, in-cycle date matching, envelope ordering, and prior-review rendering.**

## Performance

- **Duration:** ~6 min (start 2026-05-11T08:30Z, end 2026-05-11T08:36Z)
- **Tasks:** 2 (both TDD)
- **Commits:** 4 (2 RED test commits + 2 GREEN implementation commits)
- **Files modified:** 2 (src/core/reviews.js, test/reviews.test.js)
- **Tests:** 29/29 pass in reviews.test.js; 205/205 pass across the full repo suite

## Accomplishments

- Implemented `resolveReviewWindow` with the full REVIEW-02 precedence ladder (--cycle > --last-cycle > --since > vaultConfig.lastReviewedAt > D-01 default), the D-04 off-boundary snap that pins `cycleName` to the enclosing cycle and emits a `partialNote`, and the missing-`cycleEndMonths` error path.
- Implemented `loadPriorCycleReview` with the D-12 manual-wins-on-collision rule, auto-detect Q3 extraction via line-by-line `/^## 3\b/` anchoring with upper bound at the next `^## ` header, soft-fail on every external read, and a `parseCycleName` round-trip-validation helper.
- Implemented `loadInCycleTopicPages` as a direct analog of `report.js#loadInMonthTopicPages` with the date set expanded from in-month to in-cycle, anchored on `^## <date>\b` to survive future `topics.js` formatting tweaks.
- Implemented `buildSelfReviewPrompt` per the locked envelope: CYCLE line, optional WINDOW_NOTE (concatenating partialNote + missingMonthlyNote), SOURCES_LINE (always present per REVIEW-09), optional METRICS, MONTHLIES (primary) → WEEKLIES (secondary) → TOPIC_PAGES (truth) blocks with role hints (D-08), and the manual-wins-defensive prior-review block (D-12).
- Exported `SELF_REVIEW_PROMPT_PATH` alongside the existing MONTHLY_PROMPT_PATH / WEEKLY_PROMPT_PATH pattern; the prompt-template path is now a stable import for downstream callers and tests.
- 25 new tests across the four exports lock the precedence ladder, the off-boundary snap, the manual-wins invariant, autoQ3 extraction, empty-Q3 vs missing-file disambiguation, the in-cycle date-anchored topic walk, the MONTHLIES < WEEKLIES < TOPIC_PAGES envelope ordering, empty placeholders, WINDOW_NOTE concatenation, conditional METRICS, and prompt-header read-through.

## Task Commits

1. **Task 1 RED:** `a90426d` — `test(03-04): add failing tests for resolveReviewWindow + loadPriorCycleReview`
2. **Task 1 GREEN:** `f5094cf` — `feat(03-04): add resolveReviewWindow + loadPriorCycleReview to reviews.js`
3. **Task 2 RED:** `19eea74` — `test(03-04): add failing tests for loadInCycleTopicPages + buildSelfReviewPrompt`
4. **Task 2 GREEN:** `5e0185b` — `feat(03-04): add loadInCycleTopicPages + buildSelfReviewPrompt to reviews.js`

## Files Created/Modified

- `src/core/reviews.js` (18 → 386 lines)
  - Added `SELF_REVIEW_PROMPT_PATH` constant (export const)
  - Added `resolveReviewWindow(args)` (export function)
  - Added `loadPriorCycleReview(args)` (export async function)
  - Added `loadInCycleTopicPages(dates)` (export async function)
  - Added `buildSelfReviewPrompt(args)` (export async function)
  - Consolidated the import block in Task 2 (Task 1 had two `fs/promises` and two `path` imports; Task 2 merged into single statements per ESM idiom)
  - Preserved the existing module-header comment block and `ensureReviewsDir` export verbatim
- `test/reviews.test.js` (4 → 29 tests, 47 → 415 lines)
  - Extended the named-import line to add `resolveReviewWindow`, `loadPriorCycleReview`, `loadInCycleTopicPages`, `buildSelfReviewPrompt`
  - Extended the `before()` hook to set up `global.__reviewVault` + XDG_*_HOME + setVaultPath (vault-aware harness pattern)
  - Added 10 tests for `resolveReviewWindow` (5 precedence paths, snap behavior, D-01 default at two dates, missing-cycleEndMonths error, explicit-overrides-lastReviewedAt)
  - Added 5 tests for `loadPriorCycleReview` (manual-wins, manual-missing soft-fail, autoQ3 with Q3-bounded-by-next-header, empty-Q3 still kind=autoQ3, no-prior-file → null)
  - Added 2 tests for `loadInCycleTopicPages` (in-cycle match across Tickets+Components, empty/null short-circuit)
  - Added 8 tests for `buildSelfReviewPrompt` (envelope ordering, empty placeholders, manual PRIOR_REVIEW, autoQ3 PRIOR_GROWTH_FOCUS, WINDOW_NOTE single, WINDOW_NOTE concat, conditional METRICS, prompt-header read-through)

## Decisions Made

- **parseCycleName probe-month picks last vs non-last cycle differently.** Under Option B the last cycle of the year ends Dec 31, so a probe in December reaches it; non-last cycles end in (reviewMonth - 1) so the probe goes there. This makes the round-trip validation truthful: a `cycleName` whose ordinal exceeds `cycleEndMonths.length` is rejected at the ordinal check; one whose `cycleEndMonths` differs from the configured array is rejected at the post-probe name comparison. The post-probe `if (r.current.name !== cycleName)` is unreachable under valid input but kept for future schema changes.
- **extractQ3 anchors on `/^## 3\b/` rather than the full literal heading.** The prompt template (plan 03-03) mandates the exact Liferay-form heading; this loose anchor lets users iterate the wording in `src/templates/prompts/self-review.md` without breaking the auto-detect path. Trade-off: a future review with `## 3 Random Notes` would match; deemed acceptable for the milestone scope.
- **buildSelfReviewPrompt's `if (priorReview)` block uses `else if` rather than two independent `if`s.** Defensive double-check of the manual-wins invariant — even if a future caller passed `{kind: 'manual', ...}` with both fields populated, only the manual branch fires. The downstream test (`buildSelfReviewPrompt: emits PRIOR_REVIEW block on manual override`) explicitly asserts `!out.includes('PRIOR_GROWTH_FOCUS (')` to lock this.
- **Test assertion specificity for envelope-only markers.** The prompt template documents `PRIOR_GROWTH_FOCUS` and `PRIOR_REVIEW` as input variable names (6+ occurrences total); a naive `!out.includes('PRIOR_GROWTH_FOCUS')` assertion in the manual-wins test produces a false positive against a correct implementation. The fix: assert on the envelope-specific marker `PRIOR_GROWTH_FOCUS (` (with the cycleName-opening paren) which appears only when the envelope emits the block.
- **Imports consolidated in Task 2.** Task 1 left two `fs/promises` and two `path` import statements (one before/one after `ensureReviewsDir`). Node ESM permits duplicates but it's stylistic noise; Task 2 merged into single statements at the top of the file. The comment block remains the canonical module-header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Tightened `assert.ok(!out.includes('PRIOR_GROWTH_FOCUS'))` to `'PRIOR_GROWTH_FOCUS ('`**

- **Found during:** Task 2 GREEN (test ran after implementation)
- **Issue:** The plan's `<action>` block specified `assert.ok(!out.includes('PRIOR_GROWTH_FOCUS'))` for the manual-PRIOR_REVIEW emission test. The prompt template at `src/templates/prompts/self-review.md` (which the prompt builder reads at runtime as its header) legitimately documents `PRIOR_GROWTH_FOCUS` as an input-variable name 6 times. The bare-substring check produced a false positive: the implementation correctly suppressed the autoQ3 envelope block, but the header carried the token through. The implementation was correct; the test assertion was over-broad.
- **Fix:** Tightened to `assert.ok(!out.includes('PRIOR_GROWTH_FOCUS ('))` — the envelope-specific marker (opening paren only ever appears when the prompt builder emits `PRIOR_GROWTH_FOCUS (<priorCycleName>):`).
- **Files modified:** `test/reviews.test.js`
- **Commit:** `5e0185b` (folded into the Task 2 GREEN commit since both the implementation and the test refinement landed together; documented as a `[Rule 1 - Test bug]` clause in the commit message).

### Other Deviations

- **Import-block consolidation** (cosmetic). Task 1 placed two separate import blocks (one before `ensureReviewsDir` for the immediate need, one after for the prompt-path constant); Task 2's larger import set was an opportunity to merge into a single top-of-file block. Node ESM accepts duplicate-source imports without warning, so this was not a correctness fix — just a style improvement matched to the rest of the codebase (one import block per source module, top of file).

## Threat Mitigations

- **T-03-04-01 (Information Disclosure — `--prior-review` manual path):** Mitigated. `loadPriorCycleReview`'s manual branch passes the user-supplied path directly to `readFile`, which respects OS file permissions. The body is concatenated into the prompt envelope and sent to `claude -p` — a subprocess the user has already authorized. No network egress in this code path. Documented in the `--help` text (deferred to plan 03-05's command surface) that very long `--prior-review` files may degrade synthesis.
- **T-03-04-02 (Tampering — `parseCycleName`):** Mitigated. Strict regex `^(\d{4})-cycle(\d+)$` rejects malformed input at the format check; ordinal range validated against `cycleEndMonths.length`; post-probe name-comparison rejects mismatch. An attacker-controlled `--cycle` value cannot construct an arbitrary filename for the writer (which lands in plan 03-05).
- **T-03-04-03 (Spoofing — prompt injection via topic-page bodies):** Accepted (inherited from monthly-report.md pattern). The prompt header at `src/templates/prompts/self-review.md` instructs the model to treat MONTHLIES/WEEKLIES/TOPIC_PAGES/PRIOR_GROWTH_FOCUS/PRIOR_REVIEW as untrusted data — defense lives in the prompt, not in code.
- **T-03-04-04 (Tampering — `resolveReviewWindow` precedence):** Mitigated. The precedence ladder is enumerated as a top-down `if/else` chain in the implementation and locked by the `explicit --since overrides vault lastReviewedAt` test. An attacker who could write `lastReviewedAt` into vault config cannot bypass an explicit `--since` flag.

## Threat Flags

None — this plan adds pure module exports (no new network surface, no new auth path, no new filesystem write surface beyond the `loadPriorCycleReview` read which uses OS permissions). The actual writer to `Reviews/<*>.md` lands in plan 03-05 and inherits this module's documented invariants.

## Verification

All `<success_criteria>` from the prompt pass:

| Check                                                                                  | Expected | Actual |
| -------------------------------------------------------------------------------------- | -------- | ------ |
| `node --test test/reviews.test.js` exits 0                                             | 0        | 0 (29/29) |
| `node --test` (full repo) exits 0                                                      | 0        | 0 (205/205) |
| `resolveReviewWindow` exported                                                         | yes      | yes (1 grep hit) |
| `loadPriorCycleReview` exported                                                        | yes      | yes (1 grep hit) |
| `loadInCycleTopicPages` exported                                                       | yes      | yes (1 grep hit) |
| `buildSelfReviewPrompt` exported                                                       | yes      | yes (1 grep hit) |
| `SELF_REVIEW_PROMPT_PATH` exported                                                     | yes      | yes (4 grep hits — declaration + 3 references) |
| `grep -c 'SELF_REVIEW_PROMPT_PATH' src/core/reviews.js`                                | ≥1       | 4      |
| `grep -c 'getReviewFilePath(' src/core/reviews.js`                                     | ≥1       | 1      |
| `grep -c 'resolveCycle(' src/core/reviews.js`                                          | ≥1       | 5      |
| Task 1 — `resolveReviewWindow` test occurrences                                        | ≥8       | 23     |
| Task 1 — `loadPriorCycleReview` test occurrences                                       | ≥5       | 12     |
| Task 2 — `MONTHLIES: (primary — use as the spine)` in reviews.js                       | 1        | 2 (code + comment) |
| Task 2 — `WEEKLIES: (secondary — for detail when monthly is thin)` in reviews.js       | 1        | 2 (code + comment) |
| Task 2 — `TOPIC_PAGES: (ticket/component ground truth)` in reviews.js                  | 1        | 2 (code + comment) |
| Task 2 — `PRIOR_REVIEW:` emit in reviews.js                                            | ≥1       | 2      |
| Task 2 — `PRIOR_GROWTH_FOCUS` emit in reviews.js                                       | ≥1       | 2      |
| Task 2 — `loadInCycleTopicPages` test occurrences                                      | ≥2       | 7      |
| Task 2 — `buildSelfReviewPrompt` test occurrences                                      | ≥7       | 19     |
| Task 2 — `iM < iW && iW < iT` order-assertion in test                                  | ≥1       | 1      |

## Self-Check: PASSED

- `src/core/reviews.js` exists at 386 lines — FOUND
- `test/reviews.test.js` exists at 415 lines — FOUND
- All four new exports importable: `SELF_REVIEW_PROMPT_PATH, buildSelfReviewPrompt, ensureReviewsDir, loadInCycleTopicPages, loadPriorCycleReview, resolveReviewWindow` — FOUND (verified via `node -e "import(...)"`)
- Commit `a90426d` (Task 1 RED) — FOUND in git log
- Commit `f5094cf` (Task 1 GREEN) — FOUND in git log
- Commit `19eea74` (Task 2 RED) — FOUND in git log
- Commit `5e0185b` (Task 2 GREEN) — FOUND in git log

## TDD Gate Compliance

Both tasks executed RED → GREEN with separate commits:

- Task 1: `test(03-04): ...` → `feat(03-04): ...` (a90426d → f5094cf)
- Task 2: `test(03-04): ...` → `feat(03-04): ...` (19eea74 → 5e0185b)

No REFACTOR commits were necessary; the Task 1 GREEN commit produced the requested exports cleanly, and Task 2 GREEN included the cosmetic import-consolidation as part of the broader edit (no behavior change). Each RED commit emitted strict failures (import errors and assertion failures) confirming the tests genuinely failed without the implementation.

## Next Phase Readiness

- **Plan 03-05 (selfReviewOrchestrator):** Can now import the four building blocks plus `SELF_REVIEW_PROMPT_PATH` directly:
  ```javascript
  import {
    ensureReviewsDir,
    resolveReviewWindow,
    loadPriorCycleReview,
    loadInCycleTopicPages,
    buildSelfReviewPrompt,
  } from '../core/reviews.js';
  ```
- The orchestrator composes them in order: `resolveReviewWindow` → enumerate in-cycle monthlies (auto-backfill per D-05) → load weeklies → `loadInCycleTopicPages(datesInCycle)` → `loadPriorCycleReview` → `buildSelfReviewPrompt` → `claudeHeadless` → write to `getReviewFilePath(cycleName)` → `writeVaultConfig({review: {lastReviewedAt, lastReviewedCycle}})`.
- **Plan 03-06 (CLI command):** Wires `self-wiki self-review` with `--since` / `--cycle` / `--last-cycle` / `--prior-review` / `--dry-run` / `--force` / `--out` flags; routes through plan 03-05's orchestrator.
- **Open invariants for downstream:** The MONTHLIES → WEEKLIES → TOPIC_PAGES ordering is locked by a test. The manual-PRIOR_REVIEW-wins-on-collision rule is locked at both `loadPriorCycleReview` (suppression) and `buildSelfReviewPrompt` (defensive `else if`). The `SELF_REVIEW_PROMPT_PATH` is the single import entry point for the prompt header — future caller iteration of the template is a single-file edit.

---
*Phase: 03-self-review-report*
*Plan: 04*
*Completed: 2026-05-11*
