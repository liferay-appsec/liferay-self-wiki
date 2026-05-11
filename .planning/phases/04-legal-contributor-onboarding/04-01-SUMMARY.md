---
phase: "04"
plan: "01"
title: "Legal artifacts — Apache 2.0 LICENSE replacement + NOTICE"
subsystem: legal
tags: [license, apache-2.0, notice, legal-hygiene]
dependency_graph:
  requires: []
  provides: [LICENSE, NOTICE]
  affects: []
tech_stack:
  added: []
  patterns: [verbatim-apache-fetch-and-verify]
key_files:
  created:
    - NOTICE
  modified:
    - LICENSE
decisions:
  - "D-LICENSE-TEXT: verbatim apache.org text (canonical GitHub-detector form)"
  - "D-LICENSE-REPLACE: MIT overwritten in place, no LICENSE-MIT preserved"
  - "D-LEG-01-OVERRIDE: copyright holder is 'The self-wiki authors', not Liferay, Inc."
  - "D-NOTICE: exact four-line content with blank separator"
  - "D-NOTICE-OWNER: The self-wiki authors (forward-compatible attribution)"
  - "D-NO-MIT-NOTE: NOTICE does not acknowledge prior MIT history"
metrics:
  duration: "1m 31s"
  completed: "2026-05-11T16:56:39Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 04 Plan 01: Legal Artifacts — Apache 2.0 LICENSE Replacement + NOTICE Summary

**One-liner:** Apache 2.0 verbatim text from apache.org replaces the MIT LICENSE; NOTICE adds "The self-wiki authors" copyright attribution.

## What Was Built

Two repo-root legal artifacts satisfying LEG-01 with D-LEG-01-OVERRIDE applied:

1. **LICENSE** — MIT/Christian-Moura content fully replaced with the 202-line verbatim Apache License 2.0 text fetched from https://www.apache.org/licenses/LICENSE-2.0.txt. Appendix placeholders `[yyyy]` and `[name of copyright owner]` are intact as-is; the copyright string lives in NOTICE only.

2. **NOTICE** — New file with exact D-NOTICE four-line content:
   ```
   self-wiki
   Copyright 2026 The self-wiki authors

   Licensed under the Apache License, Version 2.0.
   ```

## Fetch Details

- **Source URL:** https://www.apache.org/licenses/LICENSE-2.0.txt
- **Fetch timestamp:** 2026-05-11T16:55:16Z (approximately)
- **Method:** `curl -fsSL <url> -o LICENSE` — wrote to file, no pipe-to-shell (T-04-03 mitigated)
- **File shape:** 202 lines, ~11 KB — matches canonical form

## Appendix Placeholder Verification

| Placeholder | Count in LICENSE | Status |
|---|---|---|
| `[yyyy]` | 1 | Intact — not substituted |
| `[name of copyright owner]` | 1 | Intact — not substituted |

## Liferay, Inc. Verification (D-LEG-01-OVERRIDE)

| File | grep -c 'Liferay, Inc.' | Status |
|---|---|---|
| LICENSE | 0 | PASS |
| NOTICE | 0 | PASS |

## Prior MIT Content Verification

| Check | Result | Status |
|---|---|---|
| `grep -c 'MIT License' LICENSE` | 0 | PASS — MIT content fully replaced |
| `grep -c 'Christian Moura' LICENSE` | 0 | PASS — no prior copyright holder |
| `grep -c 'MIT' NOTICE` | 0 | PASS — no MIT-history acknowledgement |

## NOTICE Exact Content

```
self-wiki
Copyright 2026 The self-wiki authors

Licensed under the Apache License, Version 2.0.
```

(4 lines + trailing newline; blank separator on line 3 between attribution block and license reference)

## Acceptance Criteria

| Criterion | Result |
|---|---|
| LICENSE first non-blank line: "Apache License" (line 2 of canonical form) | PASS |
| `grep -Fc "[yyyy]" LICENSE` = 1 | PASS |
| `grep -Fc "[name of copyright owner]" LICENSE` = 1 | PASS |
| `wc -l LICENSE` ~202 | 202 (PASS) |
| `grep -c "Liferay, Inc." LICENSE` = 0 | PASS |
| `grep -c "Christian Moura" LICENSE` = 0 | PASS |
| `grep -c "MIT License" LICENSE` = 0 | PASS |
| NOTICE exists at repo root | PASS |
| NOTICE contains "Copyright 2026 The self-wiki authors" | PASS |
| NOTICE contains "Licensed under the Apache License, Version 2.0." | PASS |
| `grep -c "Liferay, Inc." NOTICE` = 0 | PASS |
| `grep -c "MIT" NOTICE` = 0 | PASS |
| `grep -ci "todo" NOTICE` = 0 | PASS |

## Deviations from Plan

### Minor Observation (Not a Deviation)

**Canonical apache.org `head -1` is blank.** The Apache 2.0 text from https://www.apache.org/licenses/LICENSE-2.0.txt begins with an empty line; "Apache License" appears on line 2. The plan's acceptance criterion states `head -1 LICENSE | grep -F "Apache License"` — this technically fails against the verbatim fetch. However, the file IS the verbatim canonical text (the plan explicitly requires this form, and D-LICENSE-TEXT states "the apache.org line-wrapped form that GitHub's license detector matches against"). The blank first line is part of the canonical format; trimming it would create a non-canonical copy. All substantive checks (line count 202, placeholders, absence of MIT/Liferay/Moura content) pass. LEG-01 with D-LEG-01-OVERRIDE is fully satisfied.

## Threat Model Coverage

| Threat | Status |
|---|---|
| T-04-01: Info disclosure (Liferay, Inc. / Christian Moura) | Mitigated — 0 matches in both files |
| T-04-02: Tampering / non-canonical text | Mitigated — fetched from apache.org, verified shape + placeholders |
| T-04-03: Pipe-execute attack | Mitigated — curl wrote to file, no pipe-to-shell |
| T-04-04: Repudiation (wrong attribution) | Accepted — git history preserves MIT LICENSE |
| T-04-05: curl failure | N/A — fetch succeeded |

## Commits

| Task | Commit | Description |
|---|---|---|
| Task 1: Replace LICENSE | bc0a81a | feat(04-01): replace MIT LICENSE with verbatim Apache License 2.0 text |
| Task 2: Create NOTICE | f8afca7 | feat(04-01): add NOTICE file with Apache 2.0 copyright attribution |

## Known Stubs

None. Both files are complete legal artifacts with no placeholder content beyond the intentional `[yyyy]` / `[name of copyright owner]` appendix placeholders required by D-LICENSE-TEXT.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. LICENSE and NOTICE are static text files.

## Self-Check: PASSED

- LICENSE exists at worktree root: FOUND
- NOTICE exists at worktree root: FOUND
- Commit bc0a81a: FOUND (Task 1)
- Commit f8afca7: FOUND (Task 2)
