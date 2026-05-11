# Phase 2: Monthly Report - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 2-monthly-report
**Areas discussed:** Source mix & fallback, Output structure, Deterministic metrics scope, Continuity & regeneration safety

---

## Source mix & fallback

### Q1 — Primary source mix for a normal month with full weekly coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly reports only | Pure already-themed input. Cleanest prompt, most compressed. Loses session-level signal that hadn't bubbled up to weekly themes. | |
| Weekly + topic pages | PROJECT.md's stated mix. Weekly gives narrative arc; topic pages give ticket-by-ticket ground truth. Larger prompt, richer evidence base. | ✓ |
| Weekly + topic pages + dailies | Maximum context. Risks the two-dimensional compression problem PROJECT.md warned about (within-month + cross-week at once). Bigger prompt, slower. | |

**User's choice:** Weekly + topic pages
**Notes:** Matches PROJECT.md key decision — monthly is the intermediate compression layer, not a third raw-evidence pass.

### Q2 — Behavior when target month has zero weekly reports

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate weeklies first | Detect missing weeks for the month and run weekly synthesis before monthly. Most thorough; couples commands tightly; multiplies `claude -p` calls. | ✓ |
| Degrade to dailies + topic pages | Fall back to raw daily logs for that month (with topic pages), add a header note. Keeps the command independent. Soft-fail spirit. | |
| Refuse with helpful error | Print 'no weekly reports for YYYY-MM — run `self-wiki report --week ...` first' and exit. Most rigid. | |

**User's choice:** Auto-generate weeklies first
**Notes:** Personal tool — running multiple `claude -p` calls in series is acceptable cost for never-having-to-think-about-it ergonomics. Implication: backfill semantics in Q3.

### Q3 — Partial coverage (some weeklies present, others missing)

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill every overlapping ISO week | Walk every ISO week touching the month; for any missing weekly, run `report --week` first. Complete coverage; deterministic re-run. | ✓ |
| Only backfill if zero weeklies exist | All-or-nothing trigger. Simpler logic. Mixed coverage falls through to 'use whatever weeklies exist'. | |
| Backfill only when --backfill flag passed | Make it explicit and opt-in. Default monthly run uses whatever weeklies exist. | |

**User's choice:** Backfill every overlapping ISO week
**Notes:** Symmetric with Q2. The auto-backfill is now the single most novel piece of Phase 2 — flagged in CONTEXT.md specifics.

### Q4 — Month-window boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Any ISO week with ≥1 day in the month | Include W14–W18 for April 2026. Weekly reports come whole; no slicing. Same week may appear in two adjacent monthlies. | ✓ |
| Only weeks fully inside the month | April = W15–W17 only. Cleanest non-overlap. Loses real work in straddle weeks. | |
| Calendar-day strict + per-day daily-log slices | Mixes signals; metrics and prose disagree on boundary. | |

**User's choice:** Any ISO week with ≥1 day in the month
**Notes:** Two-monthly straddle is acceptable — the prompt frames "monthly themes," not exclusive ownership.

---

## Output structure

### Q1 — Dominant organizational shape

| Option | Description | Selected |
|--------|-------------|----------|
| Themes-led, mirroring weekly | Same skeleton as weekly, zoomed out. Self-review gets a familiar shape to consume. | ✓ |
| Threads-and-recurring-tickets-led | Top-level sections are recurring threads. Optimizes for ticket-level continuity; harder to surface cross-thread themes. | |
| Hybrid: theme overview + thread deep-dives | Richest but biggest output. | |

**User's choice:** Themes-led, mirroring weekly
**Notes:** "Mirror weekly" became the recurring pattern across all four areas.

### Q2 — Carry over weekly's `## Risks / carry-over` to monthly

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, mirror weekly's carry-over rules | `### Resolved since last month` + `(carrying from <prior-month>)` prefixes. Consistent UX with weekly. | ✓ |
| Skip carry-over for monthly | Smaller prompt; one less hallucination vector. | |
| Carry-over only for items spanning multiple months | Reduces noise; harder to specify cleanly. | |

**User's choice:** Yes, mirror weekly's carry-over rules
**Notes:** Forces D-14 (PRIOR_REPORT for monthly) — settled in Area 4.

### Q3 — Metrics block placement

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom: `## Quick metrics` | Mirrors weekly exactly. Narrative first, numbers as appendix. | ✓ |
| Top, before prose | Up-front context. Slightly less natural reading flow. | |
| Both: top one-liner + bottom full block | Some duplication. Easier scan. | |

**User's choice:** Bottom: `## Quick metrics`
**Notes:** —

### Q4 — Sources footer

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, dedicated `## Sources` section at the bottom | Lists every consumed file. Sets the precedent Phase 3's REVIEW-09 will follow. | ✓ |
| Inline 'Sources' line near the top, like weekly | Same pattern; less prominent for monthly's longer artifact. | |
| No sources block | Smaller artifact; Phase 3 still adds its own. | |

**User's choice:** Dedicated `## Sources` section at the bottom
**Notes:** Slight divergence from weekly (which has an inline Sources line). Justified by monthly being longer and being consumed by Phase 3.

---

## Deterministic metrics scope

### Q1 — Metric set

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly's set + Days-with-logs + Components touched | ROADMAP success criterion 1 explicitly names sessions / tickets / components / active days. Adds Days-with-logs for partial-month signal; Components distinguishes monthly from weekly. | ✓ |
| Exact weekly parity | Smallest delta; loses Components and Active days. | |
| Weekly's set + everything | Maximum signal; bigger metrics block; some signals require extra parsing work. | |

**User's choice:** Weekly's set + Days-with-logs + Components touched
**Notes:** —

### Q2 — Helper reuse vs duplicate

| Option | Description | Selected |
|--------|-------------|----------|
| Extract `buildMetrics` into a shared core/utility, parametrized | Lift to a shared place; weekly and monthly call the same helper with different shapes. DRY. | ✓ |
| Copy-and-extend in monthly | Simpler, no refactor risk. Two places to maintain. | |
| Keep buildMetrics in report.js, monthly calls it then post-processes | Awkward coupling; commands shouldn't import from each other. | |

**User's choice:** Extract `buildMetrics` into a shared core/utility, parametrized
**Notes:** Implies a small refactor to weekly. Weekly's behavior must be preserved exactly.

### Q3 — Components-touched derivation

| Option | Description | Selected |
|--------|-------------|----------|
| Keyword match against vault config `components` list | Case-insensitive whole-word; aligns with `update-topics.js` attribution. | ✓ |
| Distinct components from `Components/<slug>.md` topic-page activity | More authoritative — touched = section in target month. | |
| Skip components metric for now | Defer. ROADMAP names them but doesn't gate the phase on them. | |

**User's choice:** Keyword match against vault config `components` list
**Notes:** —

### Q4 — Source-of-truth for metrics

| Option | Description | Selected |
|--------|-------------|----------|
| Raw daily logs | Mirror weekly's pattern — `parseDailyFile(date)` per date in month. Most accurate. Honours CLAUDE.md's "daily logs are source of truth". | ✓ |
| Weekly reports (already-aggregated) | Faster; no daily re-parse. Risks drift if weeklies aged out. | |
| Both — dailies for counts, weeklies for cross-validation | Most defensive; meaningful complexity for personal tool. | |

**User's choice:** Raw daily logs
**Notes:** Locks the deterministic-vs-model boundary cleanly; metrics never reference rendered model output.

---

## Continuity & regeneration safety

### Q1 — Re-run overwrite policy

| Option | Description | Selected |
|--------|-------------|----------|
| Always overwrite | MONTH-03 says "overwrites the prior file" with `<!-- regenerated -->` marker. Matches weekly. Vault is git-backed. | ✓ |
| Overwrite only if marker present (else require --force) | First-write needs `--force`. Adds a flag and a check. | |
| Append regen-block, never destroy prior content | File grows with each run. Easier to forensic-compare; messier. | |

**User's choice:** Always overwrite
**Notes:** —

### Q2 — PRIOR_REPORT continuity

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, mirror weekly | Read `Reports/<YYYY-(MM-1)>.md` if present; soft-fail when missing. Drives the "Resolved since last month" semantics. | ✓ |
| No, monthlies stand alone | Self-review does cross-month synthesis explicitly. Conflicts with Area 2's carry-over decision. | |
| Yes, plus year-rollover | Same as Recommended; explicit about Jan → prior Dec read. | |

**User's choice:** Yes, mirror weekly
**Notes:** Year-rollover handling is implicit (computing prior `<YYYY-MM>` is the planner's job; soft-fail keeps Jan-on-fresh-vault safe).

### Q3 — Partial-month detection

| Option | Description | Selected |
|--------|-------------|----------|
| Partial if today ≤ last day of target month | Simple rule; the header note text adapts to the sub-case. | ✓ |
| Partial if any week in the month has zero daily logs | Empirical; flags PTO months as partial. | |
| Partial if dailies start mid-month OR target is current month | Combines the two real cases ROADMAP success criterion 3 calls out. | |

**User's choice:** Partial if today ≤ last day of target month
**Notes:** Header note wording is Claude's discretion (D-15 / Discretion list).

### Q4 — Default `--month` value

| Option | Description | Selected |
|--------|-------------|----------|
| Current month (parity with weekly) | `--month` with no value = current calendar month. Always partial mid-month. | ✓ |
| Prior (most-recently-completed) month | Default produces a non-partial report. Asymmetric with weekly. | |
| Require explicit --month, no default | Most explicit; out of step with weekly's ergonomics. | |

**User's choice:** Current month (parity with weekly)
**Notes:** —

---

## Claude's Discretion

- Exact home of the lifted `buildMetrics` helper (`src/core/metrics.js` vs extending `src/utils/log-parser.js`).
- Exact wording of the partial-month header note (in-progress vs vault-first-run sub-cases).
- Whether `Components touched` matching honours aliases vs literal whole-word case-insensitive only.
- Whether `--month` accepts shortcuts (`last`, `last-month`) in addition to `YYYY-MM`.
- Whether to add `--month` as a flag on the existing `report` subcommand or introduce a sibling `report-month` subcommand.

## Deferred Ideas

- `--cycle <YYYY-cycleN>` monthly batch — Phase 3 / v2.
- Per-component coverage metric across the month (TREND-02 territory).
- `--regenerate` / `--force` flag for safer overwrite (revisit if regressions).
- Cycle-aware partial-month header note (Phase 3 cosmetic, not load-bearing).
- Auto-running `update-topics` before monthly (only matters with sessions open mid-monthly run).
- Caching of `parseDailyFile` across backfilled weeklies + monthly (perf — defer).
- `self-wiki report --year <YYYY>` annual synthesis — v2 candidate.
