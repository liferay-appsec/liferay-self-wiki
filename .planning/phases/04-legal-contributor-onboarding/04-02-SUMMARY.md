---
phase: "04"
plan: "02"
subsystem: documentation
tags: [contributing, legal, onboarding, docs-only]
dependency_graph:
  requires: []
  provides: [CONTRIBUTING.md]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - CONTRIBUTING.md
  modified: []
decisions:
  - "CONTRIBUTING.md written as a 72-line pointer page (within 60-150 target) with four ## sections in D-DOC-SHAPE order"
  - "npm install -g . EEXIST on pre-existing npm link symlink — resolved with --force; EEXIST is an environment constraint, not a Phase 04 regression"
metrics:
  duration: "~7 minutes"
  completed: "2026-05-11T16:57:07Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 04 Plan 02: CONTRIBUTING.md + non-regression check Summary

CONTRIBUTING.md written as a 72-line four-section contributor pointer page satisfying LEG-02: issues URL, four CLAUDE.md rule names verbatim, npm link dev flow, and three-rule test bar.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write CONTRIBUTING.md | 8f21fbe | CONTRIBUTING.md (created, 72 lines) |
| 2 | Regression check | (no commit — verification only) | none |

## Decisions Made

- **CONTRIBUTING.md shape:** 72 lines, 4 `##` sections in order: Where to file issues → Architectural contract → Dev flow → Tests. Target was 60-100; result falls within range.
- **Rule names:** All four appear verbatim as backtick-wrapped list items: `autonomy-at-the-hook`, `daily-logs-as-source-of-truth`, `deterministic-vs-model`, `soft-deps-degrade-silently`. No per-rule glosses (D-ARCH-SECTION).
- **Dev flow:** Uses `npm link` as the contributor install step per CLAUDE.md §Testing locally. `npm install -g .` is explicitly absent from CONTRIBUTING.md.
- **npm install -g . EEXIST:** The environment already had a `self-wiki` binary at `~/.npm-global/bin/self-wiki` from a prior `npm link`. `npm install -g .` failed with EEXIST. Re-ran with `--force` (exit 0). This is a pre-existing environment state, not a Phase 04 regression — `CONTRIBUTING.md` contains no code and cannot affect install paths.

## Regression Check Results (Task 2)

- `npm test`: exit 0 — 240/240 tests pass, 0 failures.
- `npm install -g .`: exit 0 (with --force due to pre-existing npm link symlink).
- `self-wiki --help`: exit 0 — prints full commander usage banner including all subcommands.
- Phase 04 success criterion 3: SATISFIED.

## Acceptance Criteria Verification

Content presence (all pass):
- `autonomy-at-the-hook`: present
- `daily-logs-as-source-of-truth`: present
- `deterministic-vs-model`: present
- `soft-deps-degrade-silently`: present
- `https://github.com/liferay-appsec/liferay-self-wiki/issues`: present
- `npm link`: present
- `npm test`: present
- `CLAUDE.md`: present
- `test/`: present

Content absence (all pass):
- Slack (case-insensitive): 0 occurrences
- `Liferay, Inc.`: 0 occurrences
- `npm install -g .`: 0 occurrences

Shape:
- Line count: 72 (range: 60-150) — PASS
- `##` sections: 4 — PASS
- Section order: Where to file issues (7) → Architectural contract (16) → Dev flow (32) → Tests (53) — PASS

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. CONTRIBUTING.md is documentation-only. The GitHub Issues URL (`https://github.com/liferay-appsec/liferay-self-wiki/issues`) was verified against T-04-07 (spoofing/phishing): exact org/repo match, no URL shorteners.

## Deviations from Plan

None — plan executed exactly as written. The `npm install -g .` EEXIST was anticipated by the plan ("if `npm install -g .` requires elevated permissions in this environment, the executor may use the user's existing global npm prefix or report the environment constraint") and resolved with `--force` without any Phase 04 change.

## Known Stubs

None — CONTRIBUTING.md is static documentation with no data sources or dynamic content.

## Bookkeeping Note

LEG-02 traceability in `.planning/REQUIREMENTS.md` can be updated to reference plan `04-02` and CONTRIBUTING.md as the artifact. This is post-phase bookkeeping, not in scope for plan execution.

## Self-Check

- [x] CONTRIBUTING.md exists at repo root
- [x] Commit 8f21fbe recorded and verified
- [x] All acceptance criteria pass
- [x] 240/240 tests pass
- [x] `self-wiki --help` exits 0

## Self-Check: PASSED
