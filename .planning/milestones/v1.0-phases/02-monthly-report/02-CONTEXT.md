# Phase 2: Monthly Report - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `self-wiki report --month <YYYY-MM>` — a themed monthly-synthesis report
written to `Reports/<YYYY-MM>.md`. Functionally parallel to the weekly
report: deterministic metrics computed in code, prose synthesized through
`claude -p` against a versioned prompt template. The monthly report is
intentionally a *building block* for Phase 3's self-review, not a standalone
deliverable — it gives the self-review prompt already-themed monthly inputs
so the model isn't doing within-month + cross-month compression at once.

Phase 2 introduces:

1. **One CLI surface change.** `report --month <YYYY-MM>` (mutually exclusive
   with `--week`); plus `--dry-run` parity, plus a current-month default
   when `--month` is omitted with no value.
2. **One new prompt.** `src/templates/prompts/monthly-report.md` — themed
   synthesis, mirrors the weekly skeleton (Theme(s) / Decisions / Process /
   Lessons / Risks) zoomed out to a month.
3. **One refactor.** Lift weekly's `buildMetrics`/`loadPriorReport`/
   `buildPrompt` patterns into shared, parametrized helpers so the weekly
   command keeps working unchanged and the monthly command consumes the
   same plumbing.
4. **Auto-backfill of missing weekly reports.** Before synthesizing the
   month, the command walks every ISO week overlapping the month and
   runs `report --week` for any week that has dailies but no
   `Reports/<YYYY-Www>.md` on disk yet.

Out of scope for Phase 2: Phase 3's self-review prompt and `Reviews/`
output, year-over-year trend analysis (TREND-*), per-component coverage
metrics, the cycle-shaped (not month-shaped) windowing that Phase 3 will
need.

</domain>

<decisions>
## Implementation Decisions

### Source Mix & Fallback (Area 1)

- **D-01:** Primary source mix is **weekly reports + topic pages** (per
  PROJECT.md key decisions). Raw daily logs are NOT fed into the monthly
  prompt during the normal path — that compression problem is what the
  monthly layer exists to solve. Topic pages provide ticket-by-ticket
  ground truth alongside the already-themed weekly narrative.
- **D-02:** **No-weeklies fallback: auto-generate weeklies first.** When
  the target month has zero `Reports/<YYYY-Www>.md` files but daily logs
  exist, the monthly command generates the missing weeklies before
  synthesizing the month. Keeps the consumer-side prompt clean (always
  themed input); user runs one command instead of N.
- **D-03:** **Partial coverage = backfill every overlapping ISO week.**
  When some weeklies exist and some don't, walk every ISO week that
  overlaps the month; for each missing week with at least one daily log,
  invoke the weekly synthesis path before continuing. Complete coverage,
  deterministic re-runs, no special "all-or-nothing" gate.
- **D-04:** **Month-window boundary: any ISO week with ≥1 day in the
  month.** For `--month 2026-04`, the in-scope weeks are W14 (Mar 30 –
  Apr 5) through W18 (Apr 27 – May 3). Weekly reports are consumed whole
  — no slicing. The same straddle-week may appear in two adjacent
  monthlies; this is acceptable because the prompt frames "monthly
  themes," not exclusive ownership of work.

### Output Structure (Area 2)

- **D-05:** **Themes-led shape, mirroring weekly's skeleton.** Sections
  in order: H1 title with the month range, top-of-file `Sources:` line,
  `## Theme(s) of the month` (numbered themes when multiple), `##
  Notable architectural decisions`, `## Process / tooling improvements`,
  `## Lessons learned`, `## Review feedback addressed` (if applicable),
  `## Risks / carry-over`, `## Quick metrics`, `## Sources`. Same
  evidence rules as the weekly prompt — no invention; sections omit when
  empty.
- **D-06:** **Carry-over mirrors weekly's `PRIOR_REPORT` rules.** When a
  prior-month report exists, items resolved this month go under
  `### Resolved since last month` (with closing PR/commit cited); items
  still in flight get a `(carrying from <prior-month>)` prefix. When no
  prior report exists, omit the sub-section.
- **D-07:** **Metrics block sits at the bottom** as `## Quick metrics`,
  exactly like weekly's pattern. The reader gets the narrative first,
  numbers as appendix.
- **D-08:** **Sources footer is a dedicated `## Sources` section at the
  bottom** listing every weekly report, topic page, and (in fallback
  paths) daily log that fed the synthesis. Sets the precedent Phase 3's
  REVIEW-09 will follow.

### Deterministic Metrics Scope (Area 3)

- **D-09:** **Metric set:** weekly's `Sessions / Tickets / PRs /
  Force-pushes` + `Days-with-logs` + `Components touched`. ROADMAP
  success criterion 1 explicitly names *session counts, distinct
  tickets, components touched, total active days* — D-09 covers all
  four and adds force-pushes/PRs from weekly parity.
- **D-10:** **Lift `buildMetrics` into a shared helper** (the planner
  picks the exact home — likely `src/core/metrics.js`, possibly an
  extension of `src/utils/log-parser.js` aggregator surface). The
  helper takes a list of dates + a render shape ("week" vs "month")
  and returns the metric block. Weekly and monthly call it; weekly's
  current behavior must be preserved exactly.
- **D-11:** **Components touched derived by keyword match against vault
  config `components`.** For each component name in
  `<vault>/.self-wiki/config.json#components`, scan all in-month
  daily-log notes for case-insensitive whole-word matches; surface
  components with at least one hit. Aligns with how `update-topics.js`
  attributes Components/ pages today.
- **D-12:** **Metrics computed from raw daily logs**, not from the
  compressed weekly reports. `parseDailyFile(date)` for every date
  in-scope; counts come from there. Honours CLAUDE.md's "daily logs
  are the source of truth" rule and avoids re-parsing model-generated
  metric strings (which could drift if a weekly was generated long
  ago and dailies have since been edited).

### Continuity & Regeneration Safety (Area 4)

- **D-13:** **Always overwrite on re-run**, with a `<!-- regenerated
  YYYY-MM-DD -->` marker prepended to the file body — exactly as
  REQUIREMENTS-MONTH-03 specifies and matching weekly's behavior. The
  vault is git-backed; the marker is the audit trail.
- **D-14:** **Pass prior month's report as `PRIOR_REPORT`.** Compute
  the prior `<YYYY-MM>` (with year-rollover for January), read
  `Reports/<YYYY-MM>.md` if it exists, pass into the prompt. Soft-fail:
  if absent, omit silently like weekly does. Drives the
  `### Resolved since last month` semantics from D-06.
- **D-15:** **Partial-month rule:** the report is partial if today's
  date is on or before the last day of the target month. Past months
  are treated as complete. Header note when partial: a one-liner
  describing the in-progress window (e.g. "Partial month — 12 days in"
  or "Partial month — first daily log on YYYY-MM-DD"). The exact
  wording is Claude's discretion (see below); the *condition* is
  fixed.
- **D-16:** **Default `--month` value is the current calendar month**
  when `--month` is passed with no value (parity with `--week`'s
  current-week default in the existing `report` command). Always
  produces a partial when used in the middle of a month — that's
  expected.

### Claude's Discretion

- The exact home of the lifted `buildMetrics` helper
  (`src/core/metrics.js` vs extending `src/utils/log-parser.js`) — the
  planner decides; both are consistent with `.planning/codebase/STRUCTURE.md`.
- The exact wording of the partial-month header note. The condition is
  fixed (D-15); two phrasings (`in-progress` vs `vault first run on …`)
  may both be appropriate depending on which sub-case fires. The planner
  may choose to detect both sub-cases or use a single generic phrasing.
- Whether `Components touched` matching honours aliases or only literal
  names from `components`. Default expectation: literal whole-word
  case-insensitive; revisit if the metric is empty in practice.
- Whether `--month` accepts shortcuts like `last`/`last-month` in
  addition to `YYYY-MM`. Default expectation: strict `YYYY-MM`; defer
  shortcuts unless the planner spots a clean way to add them.
- The exact CLI shape — whether to introduce a `--month <YYYY-MM>` flag
  on the existing `report` subcommand (mutually exclusive with
  `--week`) or a separate `report-month` subcommand. Default
  expectation: single command + flag; the user-facing `report --week …`
  pattern stays.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone

- `.planning/PROJECT.md` — Milestone context (4-month Liferay self-review),
  Key Decisions table (themed-synthesis prompt, monthly-as-intermediate,
  output destinations), Out of Scope.
- `.planning/REQUIREMENTS.md` §"Monthly Report" — MONTH-01 through
  MONTH-06; the six requirements that drive this phase.
- `.planning/ROADMAP.md` §"Phase 2" — goal and four success criteria
  (success criterion 1 names the metric set; criterion 4 mentions the
  `claude` soft-fail to dry-run).

### Architectural Rules (project-wide)

- `CLAUDE.md` — autonomy boundary at the hook (irrelevant for Phase 2,
  no hook changes); deterministic-vs-model split (the metric block
  must come from code, not the prompt); soft dependencies degrade
  silently (`claude` missing → dry-run); no `obsidian-cli`.

### Phase 1 Hand-off

- `.planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md` —
  Phase 1 cycle helper context. Phase 2 does NOT use `resolveCycle()`
  for its month windowing (months are calendar-shaped, not
  cycle-shaped), but the helper is available if a future variant
  needs cycle-aware month metadata.

### Codebase Maps (refreshed 2026-05-07; still current)

- `.planning/codebase/STRUCTURE.md` §"Where to Add New Code" — pattern
  for command extension, the `src/core/<area>.js` rule, test
  convention, the CLI flag wiring path through `src/cli.js`.
- `.planning/codebase/ARCHITECTURE.md` §"Layers" — confirms `src/core/`
  is the right home for the lifted metrics helper. §"Anti-Patterns" —
  reinforces "no model-side arithmetic" (already obeyed by D-12).
- `.planning/codebase/STACK.md` — Node 20+, ESM, Commander, `node --test`.
  Confirms the tooling Phase 2 inherits.

### Existing Code Touched or Lifted by Phase 2

- `src/commands/report.js` — direct precedent. Functions to lift /
  generalize:
  - `buildMetrics` (lines 70–106): becomes the parametrized shared
    helper per D-10/D-12.
  - `loadPriorReport` (lines 108–121): direct analog for monthly's
    `PRIOR_REPORT` continuity (D-14).
  - `buildPrompt` (lines 123–147): generalize the
    `WEEK/SOURCES_LINE/METRICS/DAILIES/PRIOR_REPORT` framing.
  - `reportCommand` orchestration (lines 20–68): the `--week` path
    must keep working unchanged.
- `src/templates/prompts/weekly-report.md` — skeleton to mirror in the
  new monthly prompt (themes table, decisions/lessons rules, "no
  invention", PRIOR_REPORT continuity rules).
- `src/utils/log-parser.js#parseDailyFile` — canonical daily-log
  parser; reused for D-12 metric computation.
- `src/utils/format.js` — has `isoWeek`, `priorIsoWeek`, `datesInWeek`,
  UTC patterns. Phase 2 needs new sibling helpers: `priorMonth(YYYY-MM)`,
  `datesInMonth(YYYY-MM)`, `weeksInMonth(YYYY-MM)` (returning the ISO
  weeks overlapping the month per D-04). Mirror the existing UTC
  pattern.
- `src/utils/paths.js#getReportFilePath` (lines 54–56) — already takes
  a string and writes to `Reports/<str>.md`; reusable as-is for
  monthly because filename shape is identical (parameter is just a
  different format). Planner may add `getMonthlyReportFilePath` for
  clarity, or rely on the existing function with `<YYYY-MM>` strings.
- `src/core/claude.js` — `claudeHeadless`, `hasClaudeCli`. Same
  soft-fail pattern as weekly per ROADMAP success criterion 4.
- `src/core/config.js` — vault config; `components` array consumed by
  D-11.

### Existing Tests to Preserve / Mirror

- `test/log-parser.test.js`, `test/config.test.js`, `test/format.test.js`,
  `test/paths.test.js` — patterns for `XDG_*_HOME` isolation +
  temp-dir vault. New tests for monthly date helpers and the
  parametrized metrics helper should follow the same convention.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`buildMetrics` in `src/commands/report.js:70-106`** — closest possible
  precedent. Computes Sessions / Tickets / PRs / Force-pushes from
  parsed daily files. Phase 2 lifts and parametrizes it (D-10) without
  altering weekly's output.
- **`loadPriorReport` in `src/commands/report.js:108-121`** — soft-fail
  pattern (returns `null` if prior file absent) directly translates to
  monthly's `loadPriorMonthReport` (D-14).
- **`buildPrompt` framing in `src/commands/report.js:123-147`** — the
  `--- / WEEK: / SOURCES_LINE: / METRICS: / DAILIES: / PRIOR_REPORT:`
  envelope structure is the proven template. Monthly substitutes
  `MONTH:` and `WEEKLIES:` (and a topic-pages block) but keeps the
  envelope.
- **`hasClaudeCli` + `--dry-run` short-circuit in `report.js:51-59`** —
  exactly the soft-fail-to-dry-run behavior MONTH-06 + ROADMAP
  criterion 4 require.
- **`parseDailyFile`** — already returns the structured shape
  `buildMetrics` consumes. No parser work needed for D-12.
- **`applyUserConfig()` + `ensureVaultConfigured()` boilerplate** —
  every command preamble; the new monthly path inherits it.
- **Idempotent `init` scaffold** — already creates `Reports/`. No
  scaffold work for Phase 2.

### Established Patterns

- **Versioned prompt templates** in `src/templates/prompts/<name>.md`.
  Read at runtime via `readFile`. Phase 2 follows MONTH-02 by adding
  `monthly-report.md` next to `weekly-report.md`.
- **UTC date arithmetic** in `src/utils/format.js`. New month helpers
  must use the same `Date.UTC` pattern (`datesInMonth`, `priorMonth`,
  `weeksInMonth`).
- **Soft-fail external CLIs.** `gh`, JIRA, `claude` — all degrade
  silently to the next signal. Monthly inherits this for `claude` via
  the existing `hasClaudeCli` gate.
- **One test file per source module.** New helpers get
  `test/metrics.test.js` (or extension of an existing test file when
  helpers ride on `format.js`/`log-parser.js`); the new monthly
  command path gets `test/report-month.test.js` or extends
  `test/report.test.js`.
- **`buildMetrics` reads from dailies, not from rendered weekly
  metric blocks** — the precedent for D-12. Monthly stays consistent.

### Integration Points

- **`src/cli.js` `report` subcommand wiring** — adds the `--month
  <YYYY-MM>` flag (mutually exclusive with `--week`) or, alternatively,
  a sibling subcommand. Either preserves `report --week` ergonomics.
- **`src/templates/permissions.json`** — confirm
  `Bash(self-wiki report *)` covers `--month`. If a sibling subcommand
  is chosen, add the matching rule per the project conventions.
- **`src/commands/report.js` (or a new `report-month.js`)** — the
  monthly orchestration: walk overlapping ISO weeks, backfill
  missing weeklies (D-02/D-03), build prompt, synthesize, write
  output, soft-fail to dry-run if `claude` missing.
- **`src/templates/prompts/monthly-report.md`** — new versioned
  prompt; cloned-and-adjusted from `weekly-report.md` per D-05.
- **`src/utils/format.js`** — new helpers per D-04 (month-window
  semantics) and D-14 (`priorMonth` for continuity).
- **Phase 3 hook**: Phase 3's self-review will read
  `Reports/<YYYY-MM>.md` files for its primary narrative source per
  REQUIREMENTS-REVIEW-05. Phase 2 must therefore produce a
  consistently-shaped, machine-readable artifact (predictable
  section headings, deterministic Sources block).

</code_context>

<specifics>
## Specific Ideas

- **Mirror weekly, don't reinvent.** Every option chosen across the four
  areas was the "matches weekly" option. The implication for the
  planner: lean into the symmetry. If weekly does X, monthly should do
  X unless explicitly noted. The intentional differences are: cadence
  (`<YYYY-MM>` vs `<YYYY-Www>`), the auto-backfill behavior (D-02/D-03,
  no weekly analog), the metric set (D-09 adds Components and
  Days-with-logs), and the carry-over phrasing ("last month" vs
  "last week").
- **The auto-backfill is the most novel piece of Phase 2.** It's the
  one decision that doesn't have a weekly precedent — D-02/D-03
  produce a chain of `claude -p` invocations (one per missing week +
  one for the month). Plan deserves explicit attention to: error
  handling when one weekly fails, ordering, and the `--dry-run`
  semantics (dry-run should print the monthly prompt only, not
  silently invoke weeklies).
- **Liferay-specific defaults are non-negotiable.** Daily logs and
  weekly report shape are already in production; the monthly report
  must reuse them faithfully so the user's existing vault renders
  meaningful monthlies on first run.

</specifics>

<deferred>
## Deferred Ideas

- **`--cycle <YYYY-cycleN>` shortcut for monthly** — could resolve a
  cycle to its constituent months and emit one monthly per month.
  Belongs in Phase 3 (self-review) or v2; out of scope here.
- **Per-component coverage metric across the month** — count how many
  notes touched each component, not just whether at least one did.
  Tracks the v2 TREND-02 idea; defer.
- **`--regenerate` / `--force` flag for safer overwrite** — the chosen
  policy is unconditional overwrite (D-13). If a future regression
  shows the user editing monthly reports by hand, revisit then.
- **Cycle-aware partial-month header note** — when generating a
  monthly during the review-month of a Liferay cycle, the header
  note could surface cycle context. Cute, not load-bearing; defer to
  Phase 3 if Phase 3 wants it.
- **Auto-running `update-topics` before monthly** — for a maximally
  fresh topic-page corpus. Not done today (sessions fold into topics
  on close); only relevant if monthly is invoked while sessions are
  open. Defer.
- **Caching of `parseDailyFile` between the backfilled weeklies and
  the monthly synthesis** — performance optimization. Personal-tool
  scale; defer until measurably slow.
- **`self-wiki report --year <YYYY>` annual synthesis** — the next
  zoom-out level. Out of milestone scope; v2 candidate.

</deferred>

---

*Phase: 2-monthly-report*
*Context gathered: 2026-05-08*
