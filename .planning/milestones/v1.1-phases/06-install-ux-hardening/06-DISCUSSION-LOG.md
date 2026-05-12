# Phase 06: Install UX Hardening — Discussion Log

**Date:** 2026-05-11
**Mode:** default (discuss-phase, 4 areas selected by user, 3 questions per area)
**Prior context:** Phase 05 CONTEXT.md (demo-first README structure), Phase 04 CONTEXT.md (repo-root single-file artifact convention, no-`Liferay, Inc.` rule), PROJECT.md (v1.1 milestone — "fresh dev can trust it within their first hour"), REQUIREMENTS.md INST-01..03, ROADMAP.md §Phase 06 success criteria.

## Areas selected by the user

All four gray areas presented were selected for discussion:
1. Hook/permission check depth
2. Doctor output line stability + README keying
3. Remediation hint depth
4. Troubleshooting section shape

---

## Area 1: Hook/permission check depth

### Q1.1 — Hook check strictness

**Options presented:**
- (a) Exact-match against templates — catches drift, breaks on template evolution
- (b) Substring match per hook event — forgiving, misses real bugs
- (c) Two-tier: presence ✓ + drift ⚠ — informational drift line, exit code unaffected

**User selected:** (c) Two-tier: presence ✓ + drift ⚠

**Captured as:** D-WIRING-TIER (hooks half).

### Q1.2 — Permissions check strictness

**Options presented:**
- (a) Mirror hooks: presence ✓ + drift ⚠
- (b) Critical-only (4 of 9 entries)
- (c) All 9 required, no tier-2

**User selected:** (a) Mirror hooks — symmetric two-tier.

**Captured as:** D-WIRING-TIER (permissions half).

### Q1.3 — Drift line cardinality

**Options presented:**
- (a) Separate: one drift line per category
- (b) Combined: one drift info line
- (c) Verbose: list each drift item

**User selected:** (a) Separate — one drift line per category.

**Rationale captured:** Lets the README symptom→drift mapping stay precise; "permission prompts during turns" maps directly to the permissions drift line.

**Captured as:** D-DRIFT-LINES.

---

## Area 2: Doctor output line stability + README keying

### Q2.1 — Output anchor

**Options presented:**
- (a) Stable English check labels
- (b) Bracketed check IDs (`[node-version]`, `[hooks-merged]`)
- (c) Hybrid: ID + label

**User selected:** (a) Stable English check labels — load-bearing strings.

**Captured as:** D-OUTPUT-LABELS. Planner picks the exact seven strings; once chosen, they are load-bearing across doctor's output and the README table.

### Q2.2 — Section grouping

**Options presented:**
- (a) Grouped into 3 sections (Runtime / Vault / Claude Code wiring)
- (b) Flat 7-item list
- (c) Flat list + summary footer

**User selected:** (a) Grouped into 3 sections.

**Captured as:** D-OUTPUT-GROUPED. Three section headers in fixed order; Tier 2 drift lines surface inside the Claude-Code-wiring section after the ✓/✗ lines.

### Q2.3 — Summary line

**Options presented:**
- (a) Yes, terse final summary (`summary: 7/7 passing` / `summary: 5/7 passing — 2 ✗ — fix the items above and re-run`)
- (b) No, sections speak for themselves

**User selected:** (a) Yes, terse final summary.

**Captured as:** D-SUMMARY-LINE.

---

## Area 3: Remediation hint depth

### Q3.1 — Hint depth

**Options presented:**
- (a) Single-command pointer (describe-only)
- (b) Copy-pasteable JSON snippets for settings.json fixes
- (c) Single command + introduce narrower `init --hooks-only` / `--permissions-only` flags

**User selected:** (c) Single command + add narrower flags.

**Captured as:** D-NARROW-FLAGS + D-HINT-SHAPE. Three new flags ship in Phase 06: `--hooks-only`, `--permissions-only`, `--skill-only` (skill-only added in Q3.2 below). Each fixes one wiring step without re-scaffolding the vault.

### Q3.2 — `--skill-only` symmetry

**Options presented:**
- (a) Yes, add `init --skill-only`
- (b) No, `--skill-only` is overkill
- (c) Make flags composable (`init --hooks --permissions --skill`)

**User selected:** (a) Yes, add `--skill-only` — three matching narrower flags.

**Captured as:** D-NARROW-FLAGS (third flag).

### Q3.3 — Hints for unfixable checks

**Options presented:**
- (a) Bare install pointer (`nvm install 20`, Claude Code setup URL)
- (b) Soft pointer without commands/URLs
- (c) Pointer + cite README §Troubleshooting

**User selected:** (a) Bare install pointer.

**Captured as:** D-EXTERNAL-HINTS. `nvm install 20` for Node; `https://docs.claude.com/en/docs/claude-code/setup` for the Claude Code install URL.

---

## Area 4: Troubleshooting section shape

### Q4.1 — Symptom rows

**Options presented:**
- (a) 3 symptom-rows (REQ minimum)
- (b) Expanded symptom-rows (covering more checks)
- (c) Two-section: symptoms + doctor-output reference

**User selected:** (a) 3 symptom-rows — REQ-INST-03 minimum.

**Captured as:** D-SYMPTOM-ROWS. The 3 REQ-named symptoms map to specific doctor check labels in Column 2.

### Q4.2 — Section placement

**Options presented:**
- (a) Between Upgrading and License
- (b) Right after Install
- (c) Right before Configuration

**User selected:** (a) Between Upgrading and License.

**Captured as:** D-PLACEMENT. Phase 07 (LAUNCH-02) Support/Feedback appends after License.

### Q4.3 — Doctor output sample in README

**Options presented:**
- (a) Just point at the command (no inlined sample)
- (b) Inline a happy-path doctor sample
- (c) Inline a failure-mode sample

**User selected:** (a) Just point at the command.

**Rationale captured:** Lightest weight; immune to doctor-output drift; aligns with the "no sync risk between README and source" principle.

**Captured as:** D-NO-SAMPLE.

---

## Deferred ideas surfaced during discussion

- `docs/examples/doctor-output.md` happy-path sample — ROADMAP conjectured one but neither REQ nor any selected decision requires it. Phase 06 ships none.
- `--json` mode for doctor — Claude's discretion; recommend deferring to v1.2.
- Exit-code stratification — Claude's discretion; recommend single exit-1 for v1.1.
- Tier 2 drift detection for the wiki skill file — symmetric with hooks/permissions; rejected for skill because the fix path (`--skill-only`) is the same with or without the drift signal.
- One-row-per-check Troubleshooting table — rejected by D-SYMPTOM-ROWS.
- Inlined doctor sample in README — rejected by D-NO-SAMPLE.
- INST-04 (Fresh-user dry-run on clean machine) — already deferred in REQUIREMENTS.md; doctor reduces the need.

## Claude's discretion items

- `--json` mode for doctor (recommend defer to v1.2).
- Exit-code stratification (recommend single exit-1).
- Vault path "exists on disk" check depth — `fs.access(path)` minimum; planner discretion to extend to writability.
- Skill-file content drift detection — recommend omit (asymmetric vs hooks/permissions; same fix path).
- `--hooks-only` + `--permissions-only` combinability — recommend collapse rather than error.
- Plan ordering — recommend bundling the three `--X-only` flags into the doctor plan (avoids a window where doctor hints reference unimplemented flags).
- Doctor test coverage depth — pattern matches existing per-command test files in `test/`.

---

*Phase: 06-install-ux-hardening*
*Discussion log: 2026-05-11*
