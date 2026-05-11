---
phase: 05-public-grade-documentation
plan: 03
subsystem: documentation
tags: [docs, claude-md, staleness-fix]

requires:
  - phase: 04-legal-contributor-onboarding
    provides: "CONTRIBUTING.md points contributors at CLAUDE.md as the architectural contract; 04-CONTEXT.md handed this staleness fix to Phase 05"
provides:
  - "CLAUDE.md §\"Testing locally\" reflects v1.0+ reality (npm test → 240 tests)"
  - "Contributor surface (CONTRIBUTING.md → CLAUDE.md) no longer gives conflicting signals about the test bar"
affects: [06, 07, future contributor onboarding]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - "CLAUDE.md (§\"Testing locally\" only)"

key-decisions:
  - "Preserve the six-step manual verification list intact. The automated suite covers unit-level behavior; the manual list covers hook integration, the init flow, and real Claude Code session lifecycle — the test suite can't exercise those paths. Re-framing the manual list as 'end-to-end manual verification' (rather than 'verify by') makes the complementary relationship explicit."
  - "Use grounded fact, not approximation. The plan locked '240 tests' and '15 test files'; verified pre-edit via `ls test/*.test.js | wc -l` = 15 and `npm test` reporting 240 — those are the numbers in the new text."

patterns-established: []

requirements-completed: [DOCS-01]  # The "Testing locally fix" is folded under DOCS-01's umbrella per Claude's Discretion in 05-CONTEXT.md.

duration: ~3min
completed: 2026-05-11
---

# Plan 05-03: CLAUDE.md Testing-locally staleness fix — Summary

**CLAUDE.md §"Testing locally" now accurately reflects the 240-test suite that runs via `npm test`; the contributor surface (CONTRIBUTING.md → CLAUDE.md) no longer gives conflicting signals.**

## Performance

- **Tasks:** 1
- **Files modified:** 1 (CLAUDE.md, +3 / −1)
- **Completed:** 2026-05-11

## Accomplishments

- The stale opening sentence "There is no test suite yet (v0.1). Verify by:" is gone.
- Replaced with: "Tests live under `test/` and run with `npm test` (which executes `node --test test/*.test.js`). The suite covers config, format, log-parser, logger, nudge, paths, session, state, stop-detector, topics, metrics, report-month, reviews, self-review, and cycles — 15 test files, 240 tests on v1.0 close."
- New transitional sentence frames the six-step list as "end-to-end manual verification" complementary to the automated suite.
- Six-step manual verification list (npm link → init --no-set-default → session open → note → session close --hard → report --week --dry-run) preserved byte-for-byte.
- Trailing provenance line ("The plan that drove this implementation…") preserved.
- No other section of CLAUDE.md was touched.

## Task Commits

1. **Task 1: CLAUDE.md Testing-locally rewrite** — `f903ca1` (fix)

## Files Modified

- `CLAUDE.md` — §"Testing locally" only. Stale opening sentence replaced with grounded test-suite description; manual six-step list preserved.

## Deviations

- None. Every locked acceptance criterion verified after the edit.

## Verification

All acceptance criteria pass:
- `grep -q '^## Testing locally$' CLAUDE.md` → ok (heading unchanged).
- `grep -q 'There is no test suite yet' CLAUDE.md` → 0 (stale sentence gone).
- `grep -q '(v0.1)' CLAUDE.md` → 0 (stale version tag gone).
- `grep -q 'npm test' CLAUDE.md` → ok.
- `grep -q 'node --test test/' CLAUDE.md` → ok.
- `grep -q '240 tests' CLAUDE.md` → ok.
- `grep -q '15 test files' CLAUDE.md` → ok.
- `grep -q 'self-wiki init /tmp/test-vault --yes --no-set-default' CLAUDE.md` → ok (manual list preserved).
- `grep -q 'foamy-octopus' CLAUDE.md` → ok (trailing provenance preserved).
- `grep -i 'liferay, inc' CLAUDE.md` → 0 matches.
- Architectural-rules section H2 count = 1; "autonomy boundary is the hook" still present.
- Repo-layout fence still includes `core/`, `commands/`, `utils/`.
- "What NOT to do" H2 present.
- **Regression: `npm test` → 240/240 pass.**

## Notes for downstream

- The "240 tests" number is grounded today; future test additions will push past 240. The line says "v1.0 close" to anchor it in time. Phase 06 (adding `self-wiki doctor`) will add tests and bump the count — at that point, refresh the count in this same paragraph or shift to a "~240 tests" form that ages better.
- This was a small carry-forward fix from Phase 04, not a Phase 05 requirement. Folded under DOCS-01's umbrella per Claude's Discretion in 05-CONTEXT.md.
