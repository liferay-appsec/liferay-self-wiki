---
phase: 05-public-grade-documentation
plan: 02
subsystem: documentation
tags: [docs, readme, demo-first, privacy-posture]

requires:
  - phase: 04-legal-contributor-onboarding
    provides: "LICENSE + NOTICE + CONTRIBUTING.md to link to; D-LEG-01-OVERRIDE no-`Liferay, Inc.`-anywhere rule"
  - phase: 05-public-grade-documentation (intra-phase)
    provides: "docs/examples/{daily-log,weekly-report,monthly-report,self-review}.md from plan 05-01 — the canonical link targets the snippets point at"
provides:
  - "Demo-first README that leads with value (`What you get`) and privacy (`What gets logged in your vault`) before install"
  - "Real clone URL https://github.com/liferay-appsec/liferay-self-wiki.git (placeholder gone)"
  - "Three inline `**Example output:**` snippets + four `[→ Full example: …]` link lines pointing at docs/examples/"
  - "Captured / Not captured lists grounded in src/core/{logger,topics,detect}.js"
  - "License section linking LICENSE + NOTICE; Install section linking CONTRIBUTING.md"
affects: [06 README Troubleshooting append, 07 README Support/Feedback append]

tech-stack:
  added: []
  patterns:
    - "Demo-first README ordering — value-prop and privacy posture above the install fold"
    - "Literal `**Example output:**` label as the audit-anchor for DOCS-03 success criterion 3"

key-files:
  created: []
  modified:
    - "README.md (full rewrite — hook lines 1-5 preserved; section order, install URL, snippets, privacy posture, license link all new)"

key-decisions:
  - "Single atomic commit for the rewrite — the README is one file and the three task acceptance criteria interlock (the example snippets reference filenames the directory tree placeholders also use). Splitting into three commits would have created a half-rewritten state with stale stubs."
  - "Directory tree collapsed to single-line paths (`Daily/YYYY-MM-DD.md`) instead of the original two-line `Daily/` + indented filename form — needed so the plan's `grep -q 'Daily/YYYY-MM-DD.md'` acceptance pattern matches on a single line."
  - "Integration-dependent bullets formatted as `(only if <integration> is configured)` with the supplementary auth detail moved into the explanatory clause that follows — matches the plan's literal `\\(only if .* is configured\\)` regex while keeping the user-facing prerequisites visible."
  - "Captured bullet text starts lowercase (`- branch name detected …`) so the plan's `grep -q 'branch name'` and `grep -q 'force-push'` literal checks match — markdown bullets don't require sentence case."

patterns-established:
  - "README order: What you get → What gets logged → Install → How sessions get framed → Daily commands → Weekly reports → Topic pages → Optional integrations → Configuration → Parallel sessions → Upgrading → License (12 H2 sections, ending at License for stable Phase 07 append behavior)."
  - "Snippet shape: H3 artifact name, 1-2 sentences of prose, `**Example output:**`, fenced `markdown` block, blank line, `[→ Full example: docs/examples/<file>.md](docs/examples/<file>.md)` link line."

requirements-completed: [DOCS-01, DOCS-02, DOCS-03, DOCS-04]

duration: ~30min
completed: 2026-05-11
---

# Plan 05-02: README demo-first rewrite — Summary

**Demo-first README rewrite ships; value-prop and privacy posture lead, real clone URL in install, three inline `**Example output:**` snippets + monthly link point at docs/examples/, LICENSE/NOTICE/CONTRIBUTING.md wired.**

## Performance

- **Tasks:** 3 (interlocked — produced in one atomic edit)
- **Files modified:** 1 (README.md, +150 / −52)
- **Completed:** 2026-05-11

## Accomplishments

- README hook preserved (lines 1-5 byte-identical) per D-README-HOOK.
- Twelve H2 sections in the exact D-README-ORDER sequence; no Phase 06 Troubleshooting stub, no Phase 07 Support stub (D-NO-P07-STUB).
- `<this-repo-url>` placeholder eliminated; replaced with the real `https://github.com/liferay-appsec/liferay-self-wiki.git` clone URL.
- Directory tree under `## What you get` uses placeholder filenames (`Daily/YYYY-MM-DD.md`, `Tickets/EXAMPLE-NNN.md`, `Reviews/YYYY-cycleN.md`) consistent with docs/examples/ discipline; adds Reviews/ subtree (v1.0 cycle-output) which was missing from the prior tree.
- Three inline `**Example output:**` snippets — daily-log, weekly-report, self-review — each followed by the literal `[→ Full example: docs/examples/<file>.md]` link line. Monthly is paragraph + link only per D-SNIPPET-MONTHLY.
- `## What gets logged in your vault` privacy section: `### Captured` and `### Not captured` lists, scrub pointer, `**Nothing leaves your machine automatically.**` paragraph (D-PRIVACY-EXTERNAL). The two integration-dependent bullets carry the literal `(only if <integration> is configured)` annotation.
- New `## License` section links LICENSE + NOTICE; new line inside Install links CONTRIBUTING.md.

## Task Commits

1. **Tasks 1+2+3 (rewrite)** — `a91be52` (feat)

## Files Modified

- `README.md` — Full rewrite (+150 / −52). Hook preserved, body reordered, snippets and privacy section added, License section appended.

## Deviations

- **Single commit instead of three.** The plan modeled three sequential tasks each ending in a commit, but the three tasks all hit the same file and interlock through cross-section content (directory tree placeholders mirror the snippets' filenames; the snippet link lines depend on Task 1's section structure). Splitting would have left intermediate commits in a half-rewritten state with `<!-- filled in by 05-02 Task 2 -->` stubs. The single atomic commit avoided that bisect-hostile half-state. All three tasks' acceptance criteria verified against the final file state.
- **Directory-tree formatting trim.** The original two-line form (`Daily/` + indented `2026-04-27.md`) was collapsed to single-line paths so the plan's `grep -q 'Daily/YYYY-MM-DD.md'` literal pattern matches. Visual clarity preserved.
- **Captured-list bullets start lowercase** (`- branch name detected …`). Aligns with the plan's literal `grep -q 'branch name'` / `grep -q 'force-push'` patterns. Standard markdown allows bullet items to start lowercase.

## Verification

All three task acceptance-criteria blocks pass:

**Task 1 (structure):**
- Hook H1 + paragraphs preserved.
- 12 H2 sections in correct order; no Support / Troubleshooting H2.
- `<this-repo-url>` count = 0; real URL present; LICENSE / NOTICE / CONTRIBUTING.md links all present.
- No `Liferay, Inc.` string.

**Task 2 (snippets):**
- Exactly 3 `**Example output:**` literals (one each for Daily log / Weekly report / Self-review draft).
- Four H3 subsections in the correct order: `### Daily log`, `### Weekly report`, `### Monthly report`, `### Self-review draft`.
- All four `[→ Full example: docs/examples/<file>.md]` link patterns present; monthly section has 0 inline snippets.

**Task 3 (privacy posture):**
- `### Captured` / `### Not captured` H3s present.
- `**Nothing leaves your machine automatically.**` paragraph present.
- All required Captured bullets: branch name, ticket, self-wiki note, force-push, PR title, JIRA.
- All required Not-captured bullets: file diff, prompt, responses.
- 2 `(only if <integration> is configured)` annotations.
- `claude -p` mentioned in the closing paragraph.

## Notes for downstream phases

- **Phase 06 (Install UX Hardening)** will append `## Troubleshooting` after `## Upgrading` and before `## License`. The current `## License` ends the file at line ~275; Phase 06's plan should insert before License rather than at end-of-file.
- **Phase 07 (Launch Kit)** will append `## Support / Feedback` after `## License` (or just before — Phase 07's plan decides). The README's current bottom is `## License`, a stable anchor.
- **Snippet drift risk.** If `docs/examples/*.md` are ever updated, the inline snippets in README.md may drift out of sync. Mitigation today: the snippets contain the literal phrase `...` for truncation, so they read as excerpts not full copies; small drift is acceptable. If the storyline changes (e.g., a different fictional ticket set), the README snippets need to be re-trimmed from the new docs/examples/ files.
