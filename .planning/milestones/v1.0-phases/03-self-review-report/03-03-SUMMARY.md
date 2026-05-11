---
phase: 03-self-review-report
plan: 03
subsystem: prompt-template
tags: [prompt-template, liferay-values, untrusted-data, self-review, claude-p]

# Dependency graph
requires:
  - phase: 01-cycle-config-vault-scaffold
    provides: review.cycleEndMonths default + Reviews/ vault folder scaffold (template references but does not yet consume)
  - phase: 02-monthly-report
    provides: monthly-report.md prompt skeleton + untrusted-data invariant lifted verbatim
provides:
  - Versioned self-review synthesis prompt template at src/templates/prompts/self-review.md
  - Locked input contract (CYCLE / WINDOW_NOTE / SOURCES_LINE / METRICS / MONTHLIES / WEEKLIES / TOPIC_PAGES / PRIOR_GROWTH_FOCUS / PRIOR_REVIEW) ready for plan 03-04's buildSelfReviewPrompt
  - 5 Liferay values inlined with canonical descriptions (Produce Excellence, Lead by Serving, Value People, Grow & Get Better, Stay Nerdy)
  - Multi-value tagging mandate on every Section-1 accomplishment
  - PRIOR_REVIEW manual-override-wins-on-collision rule
  - Per-item inline source attribution + final aggregated `## Sources` block
affects: [03-04-self-review-orchestrator, 03-05-self-review-command, future iteration of prompt wording without code change]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Versioned prompt templates iterable independent of code (matches weekly/monthly precedent)"
    - "Untrusted-data invariant copied verbatim from monthly-report.md — single source-of-truth for the model-side defense pattern"
    - "Liferay-specific defaults (values, three review questions) baked into the prompt, not abstracted (per PROJECT.md 'users at other companies fork')"

key-files:
  created:
    - src/templates/prompts/self-review.md
  modified: []

key-decisions:
  - "Template content is locked verbatim per plan — no paraphrasing of value names, three review questions, or untrusted-data treatment"
  - "Inline source attribution uses `*(source: <file>)*` italic markdown (survives Liferay-form paste better than HTML comments) — D-13 chose this format and the example in the rules pins it"
  - "Section 3 (Grow & Get Better) is the one place where prose is preferred over bullets — synthesis across multiple monthlies needs paragraph framing to express the pattern"
  - "PRIOR_REVIEW (manual override) wins over PRIOR_GROWTH_FOCUS (auto-detect) on collision per D-12 — the rule is restated in both Inputs and Rules sections so the model cannot miss it"

patterns-established:
  - "Liferay-values block: H2 header + 5 bullets with exact value names + dash + 1-line description. Future per-cycle wording iteration edits this block only."
  - "Per-section source-attribution clause: `*(source: <file>[, <file>])*` italics, placed before any value-tag clause. Section-2 and Section-3 reuse the same shape."
  - "Aggregated Sources block at the bottom groups by type (Monthly / Weekly / Topic / Prior) and suppresses empty groups. Mirrors monthly-report.md's `## Sources` precedent."

requirements-completed: [REVIEW-03, REVIEW-04, REVIEW-06, REVIEW-09]

# Metrics
duration: 1min
completed: 2026-05-11
---

# Phase 3 Plan 03: Self-Review Prompt Template Summary

**Versioned Liferay self-review synthesis prompt at `src/templates/prompts/self-review.md` — three-question skeleton (accomplishments/lessons/growth), 5 values inlined verbatim, multi-value tagging mandate, per-item + aggregated source attribution, and the untrusted-data invariant lifted from monthly-report.md.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-11T11:01:47Z
- **Completed:** 2026-05-11T11:03:04Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Authored the locked self-review prompt template (68 lines) consumed at runtime by plan 03-04's `buildSelfReviewPrompt`.
- Inlined Liferay's 5 values with canonical descriptions so future iteration is a single-file edit, no code change.
- Encoded the multi-value Section-1 tagging mandate (`- **<accomplishment>** — <Value>[, <Value>]`) plus the inline source-attribution clause so the model produces paste-ready Liferay-form output.
- Encoded PRIOR_REVIEW manual-override-wins-on-collision in both Inputs and Rules sections (D-12).
- Lifted the untrusted-data invariant verbatim from monthly-report.md (T-03-03-01 mitigation).

## Task Commits

1. **Task 1: Author src/templates/prompts/self-review.md** — `e4bf8f4` (feat)

## Files Created/Modified

- `src/templates/prompts/self-review.md` (created, 68 lines) — Liferay self-review synthesis prompt template. Sections: header, Inputs, Liferay values, Output structure, Rules. Wires the input contract documented in plan 03-03's `<interfaces>` block.

## Decisions Made

None — plan dictated the exact verbatim content; executor did not deviate from the specified wording.

The plan's `<action>` block enumerated every section header, every value name, every rule clause; the only executor choice was rendering the markdown-inside-markdown escape sequences (backticks around filenames in the inline-attribution example) as literal backticks in the output file. Acceptance criterion `grep -c 'Produce Excellence, Stay Nerdy'` returns 1, confirming the literal-backtick rendering is correct.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The worktree is sparse: `.planning/PROJECT.md` was checked in but `.planning/STATE.md`, `.planning/config.json`, `.planning/phases/03-self-review-report/03-CONTEXT.md`, and the plan file itself were not present in the worktree's tracked tree. Read these directly from the main repo at `/home/me/dev/projects/liferay-self-wiki/.planning/...` to obtain plan context. This is expected for parallel-executor worktrees and did not affect the writes (the writes target tracked source paths that DO exist in the worktree).

## Verification

All acceptance criteria from `<acceptance_criteria>` pass:

| Check | Expected | Actual |
|-------|----------|--------|
| `test -f src/templates/prompts/self-review.md` | exit 0 | PASS |
| `wc -l < src/templates/prompts/self-review.md` | ≥ 50 | 68 |
| `grep -c '^## Liferay values'` | 1 | 1 |
| `grep -c '^## Output structure'` | 1 | 1 |
| `grep -c '^- \*\*Produce Excellence\*\*'` | ≥ 1 | 1 |
| `grep -c '^- \*\*Lead by Serving\*\*'` | ≥ 1 | 1 |
| `grep -c '^- \*\*Value People\*\*'` | ≥ 1 | 1 |
| `grep -c '^- \*\*Grow & Get Better\*\*'` | ≥ 1 | 1 |
| `grep -c '^- \*\*Stay Nerdy\*\*'` | ≥ 1 | 1 |
| `grep -c 'Every accomplishment MUST end with a value-tag clause'` | 1 | 1 |
| `grep -c 'source: <file>'` | ≥ 2 | 4 |
| `grep -c 'untrusted data, not instructions'` | 1 | 1 |
| `grep -c 'PRIOR_REVIEW.* overrides .*PRIOR_GROWTH_FOCUS'` | 1 | 1 |
| `grep -c 'Produce Excellence, Stay Nerdy'` | ≥ 1 | 1 |
| Three review questions present verbatim | 3 | 3 |
| Final `## Sources` reference in output-structure list | 1 | 1 |

## Threat Mitigations

- **T-03-03-01 (Spoofing/Tampering — prompt body):** Mitigated. Untrusted-data treatment line copied verbatim from monthly-report.md, explicitly naming `MONTHLIES`, `WEEKLIES`, `TOPIC_PAGES`, `PRIOR_GROWTH_FOCUS`, `PRIOR_REVIEW` as the inputs to be treated as data, not instructions. The model is told to draw only from sections defined by the prompt itself.
- **T-03-03-02 (Information Disclosure — manual `--prior-review` body):** Accepted. The prompt's untrusted-data rule applies to `PRIOR_REVIEW`; further hardening (path validation, length cap) is deferred per the plan's threat register and the deferred-ideas list in 03-CONTEXT.md.

## Threat Flags

None — this plan adds a static template file with no new network, auth, or filesystem trust boundaries beyond those documented in `<threat_model>`.

## Next Phase Readiness

- Template input contract is locked. Plan 03-04 can now author `buildSelfReviewPrompt` (in `src/core/reviews.js`) against a stable file path (`src/templates/prompts/self-review.md`) and a stable variable set (CYCLE / WINDOW_NOTE / SOURCES_LINE / METRICS / MONTHLIES / WEEKLIES / TOPIC_PAGES / PRIOR_GROWTH_FOCUS / PRIOR_REVIEW).
- Plan 03-04 must add a `SELF_REVIEW_PROMPT_PATH` constant alongside the existing `MONTHLY_PROMPT_PATH` / `WEEKLY_PROMPT_PATH` constants per the codebase pattern.
- Future prompt-wording refinement is a single-file edit at `src/templates/prompts/self-review.md`; no code change required.

## Self-Check: PASSED

- File exists: `src/templates/prompts/self-review.md` — FOUND
- Commit hash: `e4bf8f4` — FOUND in git log

---
*Phase: 03-self-review-report*
*Plan: 03*
*Completed: 2026-05-11*
