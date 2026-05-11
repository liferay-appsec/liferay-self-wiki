---
status: partial
phase: 03-self-review-report
source: [03-VERIFICATION.md, 03-ACCEPTANCE.md]
started: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
mode: auto-approved-surrogate
context: |
  03-07's checkpoint:human-verify was auto-approved via /tmp surrogate vault
  (workflow.auto_advance=true). Three paste-readiness questions the surrogate
  could not answer remain for the user to run against their real Obsidian
  vault with `claude` on PATH.
---

## Current Test

[awaiting human testing — run `self-wiki self-review --last-cycle` against real vault when ready]

## Tests

### 1. Real-vault Section-1 value-tag compliance
expected: "Every bullet in Section 1 ends with `— <Value>[, <Value>]` using one of the 5 canonical names (Produce Excellence, Lead by Serving, Value People, Grow & Get Better, Stay Nerdy)."
why_human: "Surrogate vault had only 1 thin monthly; structural guard locks the prompt mandate but cannot verify model compliance under real load."
how_to_run: "self-wiki self-review --last-cycle  (against your real vault, with claude on PATH)"
result: [pending]

### 2. Real-vault Section-3 cross-source synthesis (D-11)
expected: "Section 3 opens with a 3-6 sentence prose paragraph identifying a recurring focus area; sub-bullets each cite ≥2 supporting monthlies/weeklies in `*(source: <file>[, <file>])*` italics."
why_human: "Cross-source pattern synthesis can only be exercised against the real corpus (≥2 monthlies)."
how_to_run: "Same run as Test 1; read Section 3 of the resulting Reviews/<cycleName>.md"
result: [pending]

### 3. Source-attribution accuracy spot-check
expected: "For 3 random Section-1 bullets, the cited `*(source: <file>)*` files actually contain the supporting evidence."
why_human: "Non-dry-run only; requires `claude` and produces real synthesis output. Skipped under auto-mode."
how_to_run: "Same run as Test 1; pick 3 bullets, open the cited source files, verify the evidence is present"
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
