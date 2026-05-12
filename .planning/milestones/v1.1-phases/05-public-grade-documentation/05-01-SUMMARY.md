---
phase: 05-public-grade-documentation
plan: 01
subsystem: documentation
tags: [docs, examples, scrubbed-artifacts, storyline]

requires:
  - phase: 04-legal-contributor-onboarding
    provides: "no-`Liferay, Inc.`-anywhere rule (D-LEG-01-OVERRIDE) inherited by every `docs/examples/*.md` file"
provides:
  - "First docs/ subtree in the repo (docs/examples/)"
  - "Four scrubbed reference artifacts on the EXAMPLE-001/002/003 storyline (daily, weekly, monthly, self-review)"
  - "Canonical link targets the Wave-2 README rewrite (plan 05-02) points at"
affects: [05-02, 06, 07]

tech-stack:
  added: []
  patterns:
    - "Per-file HTML-comment disclaimer pattern (D-EXAMPLES-SELF-DESCRIBE) for every file under docs/examples/"
    - "Literal-placeholder dates (`YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`, `YYYY-cycle1`) so examples never go stale"

key-files:
  created:
    - "docs/examples/daily-log.md"
    - "docs/examples/weekly-report.md"
    - "docs/examples/monthly-report.md"
    - "docs/examples/self-review.md"
  modified: []

key-decisions:
  - "Storyline anchored on EXAMPLE-001 (multi-week OAuth provider refactor), EXAMPLE-002 (one-day cross-tab session-expiry race fix), and EXAMPLE-003 (late-month CI coverage signal). Same fictional engineer narrates all four."
  - "PR refs (#421/#422/#423/#427/#428/#431/#436) and force-push counts are self-consistent across the four files so the monthly's Quick metrics line up with the underlying weekly/daily evidence."
  - "Week YYYY-W16 is intentionally missing from the monthly's Sources line — demonstrates the prompt's `Note any missing weeks` behaviour without breaking the storyline."

patterns-established:
  - "EXAMPLE-NNN as the fictional-ticket prefix (D-EXAMPLES-PREFIX) — chosen over `LPD-99xxx` to remove any brief-mistaken-for-real risk."
  - "All five Liferay values (`Produce Excellence`, `Lead by Serving`, `Value People`, `Grow & Get Better`, `Stay Nerdy`) tagged at least once across the self-review's Section 1 accomplishments."

requirements-completed: [DOCS-05]

duration: ~25min
completed: 2026-05-11
---

# Plan 05-01: docs/examples/ scrubbed reference artifacts — Summary

**Four fictional reference artifacts land under `docs/examples/`, anchored on the EXAMPLE-001/002/003 storyline; satisfies DOCS-05 and unblocks the Wave-2 README rewrite to link to canonical examples.**

## Performance

- **Tasks:** 2 (Task 1 = daily + weekly; Task 2 = monthly + self-review)
- **Files created:** 4
- **Lines:** 195 total across the four files (32 / 45 / 70 / 48)
- **Completed:** 2026-05-11

## Accomplishments

- `docs/examples/daily-log.md` — fictional one-day log with three sessions (one completed, one interrupted, one open with sentinel) demonstrating the real `src/core/logger.js` block shape, ticket detection via the `<!-- vault config: { ticketRegex: 'EXAMPLE-\d+' } -->` comment, and note/PR/force-push evidence.
- `docs/examples/weekly-report.md` — mirrors `src/templates/prompts/weekly-report.md` section-for-section (Theme of the week with Ticket→Layer→Outcome table, Notable architectural decisions, Process / tooling improvements, Lessons learned, Risks / carry-over, Quick metrics with PR refs and force-push count).
- `docs/examples/monthly-report.md` — mirrors `src/templates/prompts/monthly-report.md`. Two themes (auth refactor + CI tooling), one missing week (`YYYY-W16`) flagged in Sources, final `## Sources` block grouped by type (weekly reports / topic pages).
- `docs/examples/self-review.md` — mirrors `src/templates/prompts/self-review.md`. Three numbered review questions verbatim as `##` headings, every Section 1 accomplishment carries `*(source: …)*` italics and a `— <Value>[, <Value>]` clause, all five Liferay values present, final `## Sources` block grouped by type (monthly reports / weekly reports / topic pages).

## Task Commits

1. **Task 1: daily-log.md + weekly-report.md** — `a9380a0` (feat)
2. **Task 2: monthly-report.md + self-review.md** — `41f86e4` (feat)

## Files Created

- `docs/examples/daily-log.md` — fictional daily log demonstrating session lifecycle (Started / Note / Switched / Last activity / Ended / Duration / Completed-or-Interrupted), open-sentinel, and ticket detection via the regex-config HTML comment.
- `docs/examples/weekly-report.md` — fictional weekly synthesis output. Same EXAMPLE-NNN tickets recurring; Quick metrics line up with the daily's PR refs and force-push count.
- `docs/examples/monthly-report.md` — fictional monthly synthesis output. Two themes, one missing week (`YYYY-W16`) intentionally flagged, final `## Sources` block grouped by type.
- `docs/examples/self-review.md` — fictional self-review draft. Three review questions verbatim, all five Liferay values tagged, source-italics on every accomplishment / lesson / focus-area sub-bullet.

## Deviations

- None. Every locked decision from `05-CONTEXT.md` (D-EXAMPLES-SOURCE, D-EXAMPLES-CONTINUITY, D-EXAMPLES-PREFIX, D-EXAMPLES-DATES, D-EXAMPLES-REGEX-DEMO, D-EXAMPLES-SELF-DESCRIBE) was honoured.

## Verification

Every grep in both task acceptance-criteria blocks passed:
- 4 files exist; each opens with the HTML-comment fictional-example disclaimer.
- EXAMPLE-001 in all four files (storyline continuity).
- All seven monthly H2s present (`## Theme(s) of the month` through `## Sources`).
- All three numbered review-question H2s present in `self-review.md`, verbatim.
- All five Liferay values present in `self-review.md`.
- 10 `*(source:` italics in `self-review.md` (≥5 required); 7 `- **` accomplishment bullets (≥3 required).
- Zero matches for `\b(LPD|LPP|LPS|LRELEASE)-[0-9]+\b` across the four files.
- Zero matches for `Liferay, Inc.` (case-insensitive) across the four files.

## Notes for downstream phases / plans

- **Plan 05-02 (README rewrite)** links to each of the four files by literal name. The key-link patterns from 05-02's frontmatter (`\[→ Full example: docs/examples/daily-log\.md\]`, etc.) are now satisfiable on the receiver side.
- **Phase 07 (Launch Kit)** can lean on these artifacts as the "see real output" proof the Slack post needs.
- **Phase 06 (Install UX)** will likely produce a `self-wiki doctor` sample output; landing it as a fifth `docs/examples/doctor.md` would extend this pattern naturally but is not required by Phase 06's scope.
