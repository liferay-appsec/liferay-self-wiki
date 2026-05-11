---
phase: 03-self-review-report
plan: 07
subsystem: testing
tags: [acceptance, flag-matrix, writeback, prompt-shape-guard, structural-tests, surrogate-vault]

# Dependency graph
requires:
  - phase: 03-self-review-report (plans 01-06)
    provides: cycles.js D-PREREQ fix, resolveReviewWindow, loadPriorCycleReview, loadInCycleTopicPages, buildSelfReviewPrompt, selfReviewOrchestrator, auto-backfill cascade, hoisted soft-fail gate
provides:
  - 15 new structural-guard tests in test/self-review.test.js locking REVIEW-02 / -04 / -07 / -08 / -09 contracts
  - --since precedence ladder asserted via dry-run (off-cycle snap, on-start no-partialNote, lastReviewedAt fallback, explicit-since-wins)
  - --last-cycle structural-format assertion (date-agnostic regex)
  - --cycle without --since flag asserted
  - --out passes through resolveOutPath with outside-vault stderr warning
  - Prompt-template grep guards: value-tagging mandate, 5 Liferay value names, three review-question headers verbatim, aggregated `## Sources` footer with per-type groups, per-item `*(source:...)*` inline attribution, untrusted-data treatment line, manual-PRIOR_REVIEW-wins-on-collision rule
  - writeVaultConfig({ review: { lastReviewedAt, lastReviewedCycle } }) call-shape guard (no cycleEndMonths leakage)
  - writeFile(outPath) → writeVaultConfig ordering guard (success-only writeback)
  - 03-ACCEPTANCE.md auto-approved-surrogate evidence for Phase 3 closure
affects: [phase-04-and-beyond, refactors-to-reviews.js, refactors-to-self-review.md-template]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural-guard grep tests for prompt-template invariants (extends report-month.test.js lines 213-230 pattern to self-review)"
    - "Auto-approved-surrogate acceptance pattern: hermetic tmp vault + isolated XDG_CONFIG_HOME so checkpoint:human-verify can be auto-promoted without touching the user's real vault"
    - "Anchor structural-ordering guards on `await <fn>(` (not bare `<fn>(`) to avoid JSDoc false positives"

key-files:
  created:
    - .planning/phases/03-self-review-report/03-ACCEPTANCE.md
  modified:
    - test/self-review.test.js (19 → 34 tests; +184 lines)

key-decisions:
  - "Anchor the writeFile→writeVaultConfig ordering guard on `await writeVaultConfig({` rather than `writeVaultConfig({`. The orchestrator's JSDoc above the call site mentions writeVaultConfig({…}), which the bare-pattern regex matched at index 19747 — earlier than the actual writeFile call at index 28808 — producing a false negative on the ordering invariant. The `await`-prefix anchor disambiguates the call site from documentation references."
  - "Auto-approved-surrogate acceptance pattern: under auto-mode (workflow.auto_advance=true), checkpoint:human-verify against a real vault is promoted to a hermetic surrogate run. Use `self-wiki init <tmp> --yes --no-set-default` (mandatory per CLAUDE.md) plus an isolated XDG_CONFIG_HOME pointing at the tmp vault, so the user's real vaultPath is never re-pointed. The user's `~/.config/self-wiki/config.json` was verified unchanged pre/post run."
  - "The acceptance log frontmatter carries `mode: auto-approved-surrogate` to make the auto-promotion auditable. The log explicitly lists 3 paste-readiness questions the surrogate cannot answer (rich-monthly compliance, recurring focus synthesis, real-synthesis source-attribution spot-check) and provides reproduction instructions for the user to follow up if they want a human-verified pass."

patterns-established:
  - "Prompt-template structural guards: regex `assert.match(tpl, /\\*\\*<value>\\*\\*/)` per Liferay value name (avoids template-literal-with-`&`-escape pitfall in the original plan). Future prompt-template edits that drop a mandate will surface as a failed test rather than a silent regression."
  - "Vault-config writeback shape guards combine (a) a content regex (`writeVaultConfig\\(\\{[\\s\\S]*?review: \\{[\\s\\S]*?lastReviewedAt[\\s\\S]*?lastReviewedCycle/`), (b) a bounded-block negative match (`writeVaultConfig\\(\\{[\\s\\S]{0,200}?\\}\\)` must NOT contain `cycleEndMonths`), and (c) an ordering guard via `indexOf`. Three independent checks lock the same invariant from different angles."

requirements-completed: [REVIEW-02, REVIEW-04, REVIEW-07, REVIEW-08, REVIEW-09]

# Metrics
duration: ~12min
completed: 2026-05-11
---

# Phase 3 Plan 07: Self-Review Phase 3 Closure Summary

**15 structural-guard tests lock REVIEW-02/04/07/08/09 contracts in test/self-review.test.js + an auto-approved-surrogate acceptance log closes Phase 3 under auto-mode**

## Performance

- **Duration:** ~12 min wall-clock (Task 1 commit at 2026-05-11T08:38:33-03, Task 2 commit at 08:41:54-03; setup + structural validation accounted for the rest)
- **Started:** 2026-05-11T11:35Z (approx)
- **Completed:** 2026-05-11T11:47Z (approx)
- **Tasks:** 2 (1 auto + 1 checkpoint auto-promoted)
- **Files modified:** 2

## Accomplishments

- **Phase 3's automated-test layer is feature-complete.** Every REVIEW-* requirement now has at least one explicit test or grep guardrail. The new tests cover the flag-matrix gaps (`--since` precedence ladder including lastReviewedAt fallback and explicit-since-wins, `--last-cycle` format, `--out` outside-vault warning, `--cycle` without `--since`), the prompt-template invariants (value-tagging mandate, 5 Liferay value names, three review-question headers verbatim, aggregated `## Sources` footer, per-item inline source attribution, untrusted-data treatment, manual-PRIOR_REVIEW-wins-on-collision), and the vault-config writeback shape and ordering (no `cycleEndMonths` leakage in the patch object; `writeFile(outPath)` precedes `await writeVaultConfig`).
- **Phase 3 acceptance is logged.** The auto-approved-surrogate run against `/tmp/03-07-acceptance-vault` confirmed: exit 0, full envelope (CYCLE, WINDOW_NOTE, SOURCES_LINE, MONTHLIES/WEEKLIES/TOPIC_PAGES blocks, three review-question headers, all 5 Liferay value names, the aggregated `## Sources` footer mandate, the untrusted-data line, the per-item `*(source:...)*` mandate, the `PRIOR_REVIEW` override rule), preflight stderr summary firing on missing monthlies, and the `--prior-review` flag correctly suppressing the auto-detect `PRIOR_GROWTH_FOCUS` data block.
- **Full suite remains green at 240/240.** No regressions in any pre-existing test file.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add flag-matrix + prompt-shape tests to test/self-review.test.js** — `6e36c2e` (test)
2. **Task 2: Real-vault acceptance dry-run — auto-promoted to surrogate under auto-mode** — `272da9b` (docs)

_Both commits stage their files individually; no `git add -A` was used._

## Files Created/Modified

- `test/self-review.test.js` — Appended 15 structural-guard tests (+184 lines). Tests are grouped by REVIEW-* requirement with explanatory section banners.
- `.planning/phases/03-self-review-report/03-ACCEPTANCE.md` — New (force-added; `.planning/phases/` is gitignored). Contains the surrogate-run command lines, structural-assertion table, stderr preflight output, `--prior-review` evidence, the three paste-readiness questions the surrogate cannot answer, reproduction instructions for the user's real vault, and the cleanup commands.

## Decisions Made

See `key-decisions` in frontmatter. Three substantive decisions:

1. **JSDoc disambiguation on the ordering guard.** The plan's original ordering-guard regex (`writeVaultConfig({`) matched the JSDoc summary above the orchestrator's call site (line 462: `→ writeVaultConfig({review: {...}})`), reporting writeVaultConfig appearing BEFORE writeFile and failing the test even though the actual call site at line 696 is correctly ordered. Switching the anchor to `await writeVaultConfig({` resolves the false positive without weakening the contract.
2. **Auto-approved-surrogate pattern.** Auto-mode promotes `checkpoint:human-verify` to auto-approval. Rather than fabricating approval blindly, run the same flow against a hermetic tmp vault, log structural evidence, and explicitly call out what the surrogate cannot validate.
3. **Vault-config isolation via `XDG_CONFIG_HOME`.** `--no-set-default` keeps `init` from rewriting the user's vaultPath, but `self-review` would still read the user's `~/.config/self-wiki/config.json#vaultPath` at runtime. Setting `XDG_CONFIG_HOME=/tmp/03-07-acceptance-xdg` (with a separate config.json pointing at the tmp vault) makes the surrogate run truly hermetic. This mirrors the pattern in `test/self-review.test.js#before()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan's writeFile→writeVaultConfig ordering test had a false-positive match on the JSDoc summary**

- **Found during:** Task 1 (test/self-review.test.js — running the new test for the first time)
- **Issue:** The plan's test body used `src.indexOf('writeVaultConfig({')` to locate the call site. The orchestrator's JSDoc block (lines 442-466 of `src/core/reviews.js`) includes the line `→ writeVaultConfig({review: {...}}).` summarizing the orchestrator flow. `indexOf` matches that documentation reference at index 19747, which is EARLIER than the actual `await writeFile(outPath` call at index 28808 — flipping the ordering and failing the assertion (`expected writeFile (28808) to precede writeVaultConfig (19747)`).
- **Fix:** Changed the anchor to `await writeVaultConfig({`. The JSDoc comment doesn't use `await`, so the regex now matches only the actual call site (line 696). Added an inline comment explaining the JSDoc false-positive trap so a future maintainer doesn't reintroduce the bug.
- **Files modified:** `test/self-review.test.js` (single test body)
- **Verification:** `node --test test/self-review.test.js` exits 0 (34/34 PASS); `node --test test/*.test.js` exits 0 (240/240 PASS).
- **Committed in:** `6e36c2e` (Task 1 commit — fix landed inline with the new test additions)

---

**Total deviations:** 1 auto-fixed (1 bug in plan-as-authored)
**Impact on plan:** The fix is a one-line anchor tightening; it strengthens the guard rather than weakening it. No scope creep.

## Issues Encountered

- **Auto-mode checkpoint promotion required careful hermetic isolation.** The plan's Task 2 is a `checkpoint:human-verify` that explicitly tells the user to run `self-wiki self-review --last-cycle --dry-run` against their real vault. Auto-mode promotes that to auto-approval; the orchestrator's pre-flight directive specified a surrogate path. The challenge was making the surrogate run truly hermetic — `init --no-set-default` alone is insufficient because `self-review` reads `vaultPath` from the user's `~/.config/self-wiki/config.json` at runtime. Solution: also set `XDG_CONFIG_HOME` to a separate dir containing a config.json that points at the tmp vault. Pre/post-run `cat ~/.config/self-wiki/config.json` confirmed the user's `vaultPath` was unchanged.

## User Setup Required

None — Phase 3 is feature-complete and requires no external service configuration. The user MAY optionally run a real-vault dry-run before treating Phase 3 as fully closed; the acceptance log § "Reproducing against the real vault" provides the exact commands.

## Next Phase Readiness

- **Phase 3 closes.** Every REVIEW-* requirement has automated test coverage or auto-approved-surrogate evidence (with optional real-vault follow-up documented).
- **Surrogate artifacts cleaned up.** `rm -rf /tmp/03-07-acceptance-vault /tmp/03-07-acceptance-xdg` plus the captured log files. The tmp paths are no longer on disk.
- **No blockers for the next phase.** Phase 4 (or whatever follows in ROADMAP.md) can proceed without prerequisite work from this plan.

## Self-Check: PASSED

- `test/self-review.test.js` — exists (verified via Read and `wc -l` shows 560 lines = 376 + 184 inserted)
- `.planning/phases/03-self-review-report/03-ACCEPTANCE.md` — exists (verified via Write + commit `272da9b` create-mode)
- Commit `6e36c2e` — exists (`git log --oneline` includes it)
- Commit `272da9b` — exists (`git log --oneline` includes it)
- `node --test test/self-review.test.js` exits 0 — 34/34 PASS
- `node --test test/*.test.js` exits 0 — 240/240 PASS
- User's `~/.config/self-wiki/config.json#vaultPath` unchanged (verified pre and post surrogate run)
- Surrogate tmp paths cleaned up (verified via `ls /tmp/ | grep -i 03-07` returning empty)

---
*Phase: 03-self-review-report*
*Completed: 2026-05-11*
