# Phase 3: Self-Review Report — Discussion Log

**Date:** 2026-05-08
**Mode:** discuss (default; auto-mode active for execution choices)
**Phase number:** 3

This document is a human-readable audit trail of the Phase 3 discussion.
It is NOT consumed by downstream agents — they read `03-CONTEXT.md`. Use
this for retrospectives, audits, or when reviewing how a decision was
reached.

---

## Initial Selection — Areas to Discuss

**Question:** "Phase 3 is the self-review report. Which areas do you
want to discuss?"

**Options presented:**
1. Window resolution & re-run safety
2. Auto-backfill chain depth
3. Section 1: accomplishments + value tagging
4. Prompt rules: Q2/Q3 evidence + prior-review continuity + Sources
   footer

**User selection:** All four.

---

## Area 1 — Window Resolution & Re-run Safety

### Q1.1: Bare-run default cycle

**Options presented:**
- Most recently COMPLETED cycle (recommended)
- Current cycle (in-progress preview)
- Refuse with hint

**User selection:** Most recently COMPLETED cycle.

**Note:** During the preview rendering of this question, the
Phase 1 cycles.js boundary semantics surfaced as a concrete date
range (2026-cycle1 = Dec 1 2025 → Apr 30 2026). This triggered a
side-thread (see "Cycle-Boundary Discrepancy" below) that
became D-PREREQ.

### Q1.2: `lastReviewedAt` writeback timing

**Options presented:**
- Every successful generation (recommended)
- Only complete-cycle runs
- Only when target cycle is fully past

**User selection:** Every successful generation.

### Q1.3: Re-run policy

**Options presented:**
- Mirror monthly: silent overwrite + regenerated marker
- Refuse without `--force`; print git-restore hint (recommended)
- Sidecar second variant (`<file>.regenerated-N.md`)

**User selection:** Refuse without `--force`; print git-restore hint.

**Rationale captured:** Reviews are hand-edited after generation
(unlike weekly/monthly). Silent overwrite would cost real work.

### Q1.4: Off-boundary `--since` filename

**Options presented:**
- Snap to enclosing cycle name (recommended)
- Synthetic name `<since>--<end>.md`
- Refuse off-boundary `--since`

**User selection:** Snap to enclosing cycle name + header note.

### Cycle-Boundary Discrepancy (side-thread → D-PREREQ)

**User correction:** "you are including 2025-12 here, this is taken
care by the review of the last cycle of 2025, not 2026 cycle 1."

**Investigation:** Phase 1 cycles.js implements
`end = lastDayOfMonth(year, endMonth - 1)`, producing for `[5,9,12]`:
- 2026-cycle1: Dec 1 2025 → Apr 30 2026 (5 months)
- 2026-cycle2: May 1 → Aug 31 2026 (4 months)
- 2026-cycle3: Sep 1 → Nov 30 2026 (3 months)

This contradicts PROJECT.md ("cycle is currently 4 months long")
and the user's mental model.

**Question presented:**
- Fix Phase 1 cycles.js as a Phase 3 dependency (recommended)
- Keep Phase 1 as-is; document in Phase 3 prompt
- Make boundary semantic configurable

**User selection:** Fix Phase 1 cycles.js as a Phase 3 dependency.

**Captured as:** D-PREREQ — fix lands in Phase 3 wave 1 before any
self-review code consumes the helper.

---

## Area 2 — Auto-Backfill Chain Depth

### Q2.1: Backfill default

**Options presented:**
- Default-on with preflight summary (recommended)
- Default-on, silent (matches Phase 2 monthly exactly)
- Opt-in `--backfill` flag

**User selection:** Default-on with preflight stderr summary.

### Q2.2: Stale-monthly handling

**Options presented:**
- Use as-is; trust monthlies as canonical (recommended)
- Add `--refresh-monthlies` opt-in flag
- Auto-detect via mtime comparison

**User selection:** Use as-is.

**Deferred:** `--refresh-monthlies` flag, mtime-based detection.

### Q2.3: `--dry-run` semantics with auto-backfill

**Options presented:**
- Strict: dry-run never invokes anything (recommended)
- Permissive: only short-circuits the FINAL self-review call

**User selection:** Strict.

---

## Area 3 — Section 1: Accomplishments + Value Tagging

### Q3.1: Inputs + weighting

**Options presented:**
- All three (monthlies + weeklies + topic pages); monthlies primary
  (recommended)
- Monthlies + topic pages only
- Monthlies only

**User selection:** All three with monthlies as primary spine.

### Q3.2: Liferay value definitions in prompt

**Options presented:**
- Inline definitions for each value (recommended)
- Just list the 5 names; trust the model
- Definitions live in vault config

**User selection:** Inline definitions in the prompt template.

### Q3.3: Multi-value tags + mandatory tagging

**Options presented:**
- Multi-value allowed; mandatory on every accomplishment (recommended)
- Multi-value allowed; tagging optional when no clear mapping
- Single-value only; mandatory

**User selection:** Multi-value allowed; mandatory on every
accomplishment.

---

## Area 4 — Q2/Q3 Evidence + Prior Continuity + Sources Footer

### Q4.1: Q2/Q3 evidence rules

**Options presented:**
- Q2 strict; Q3 strict but synthesis-friendly (recommended)
- Q2 strict; Q3 permissive
- All three sections strict; treat like weekly/monthly

**User selection:** Q2 strict; Q3 strict but synthesis-friendly.

### Q4.2: Prior-review continuity (first attempt)

**Options presented:**
- Auto-detect file → extract Q3 only (recommended)
- Auto-detect file → full body
- Defer to v2 TREND-01

**User feedback:** "there should be an option for the user feed
manually a prior review made outside of the self-wiki scope (think
about users doing the review here for the first time)."

**Question reformulated.**

### Q4.2 (reformulated): Prior-review continuity

**Options presented:**
- Auto-detect file + `--prior-review <path>` override; Q3 extraction
  (recommended)
- Auto-detect file + manual override; full body in both cases
- Manual flag only; no auto-detect
- No prior-review support; defer to v2 TREND-01

**User selection:** Auto-detect file + `--prior-review <path>` manual
override; Q3 extraction for auto-detect, full body for manual flag.

### Q4.3: Sources footer granularity

**Options presented:**
- Single trailing `## Sources` block; group by type (recommended)
- Per-question attribution + final aggregated `## Sources`
- HTML-comment-wrapped (invisible on paste)

**User selection:** Per-question inline attribution + final
aggregated `## Sources` block.

**Note:** This is the single deviation from "mirror Phase 2"
across the entire phase — Phase 2 used a single trailing block.
Captured as D-13 with the inline-italic format `*(source: …)*` as
the planner's likely starting point.

---

## Decisions At a Glance

| ID | Area | Decision |
|----|------|----------|
| D-PREREQ | Cycles fix | Fix `cycles.js` semantics in Phase 3 wave 1 (cycle ends on last day of cycleEndMonth, not M-1) |
| D-01 | Window | Bare run → most recently completed cycle |
| D-02 | Window | Always write `lastReviewedAt`/`lastReviewedCycle` on success |
| D-03 | Window | Refuse re-run without `--force`; git-restore hint |
| D-04 | Window | Off-boundary `--since` snaps filename to enclosing cycle |
| D-05 | Backfill | Default-on with preflight summary; single `hasClaudeCli` gate |
| D-06 | Backfill | Stale monthlies treated as canonical (use as-is) |
| D-07 | Backfill | `--dry-run` strict — never invokes `claude -p` |
| D-08 | Section 1 | Inputs: monthlies (primary) + weeklies + topic pages |
| D-09 | Section 1 | Inline 5-value definitions in prompt |
| D-10 | Section 1 | Multi-value tags allowed; mandatory on every accomplishment |
| D-11 | Q2/Q3 | Q2 strict; Q3 strict-but-synthesis-friendly |
| D-12 | Q2/Q3 | Auto-detect prior file + `--prior-review <path>` override |
| D-13 | Q2/Q3 | Per-question inline source attribution + aggregate `## Sources` |

---

## Claude's Discretion (handed to planner)

- Cycle-name year for the December cycle under fixed semantics
  (D-PREREQ).
- Whether Phase 1 D-04's "advance to next slot" rule survives the
  semantic fix.
- Whether the auto-backfill preflight needs interactive
  confirmation (default: no, just print).
- Whether to lift `loadInMonthTopicPages` into a shared helper
  vs duplicating inline.
- Exact CLI mutex matrix for `--since` / `--cycle` / `--last-cycle`
  / `--prior-review`.
- Whether to add `--out <path>` (default expectation: yes).
- Inline source-ref format (D-13: italic markdown is the
  starting point).
- Whether `--prior-review` body length is capped (default: no).

---

## Deferred Ideas

- `--refresh-monthlies` flag (D-06 alternative)
- mtime-based stale detection (D-06 alternative)
- Section-level source anchors (D-13 finer granularity)
- HTML-comment-wrapped Sources block (paste-friendly)
- Single-value tagging mode (`--single-value`)
- Vault-config-driven value definitions (multi-company)
- v2 TREND-01: year-over-year diff (`PRIOR_GROWTH_FOCUS` partial seed)
- v2 TREND-02: per-value coverage metric across cycles
- v2 TREND-03: mid-cycle preview
- v2 TOOL-01: Liferay-form export tooling
- v2 TOOL-02: self-review diff between cycles
- Cycle-shape metric helper (`shape: 'cycle'` in `buildMetrics`)
- `--auto-confirm` / `-y` flag for preflight summary
- Cap on `--prior-review` body length

---

*Discussion gathered: 2026-05-08*
