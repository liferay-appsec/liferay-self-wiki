# Phase 3: Self-Review Report - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `self-wiki self-review` — a `claude -p`–synthesized Liferay-self-review
draft written to `Reviews/<YYYY>-cycle<N>.md`. The output is shaped to
Liferay's three review questions (accomplishments + values, would-have-done-
differently, Grow & Get Better focus), built from monthly reports (primary
spine), weekly reports (secondary detail), and topic pages (ticket-level
ground truth). It does NOT consume raw daily logs (too granular for a
4-month window). Successful generation writes back `review.lastReviewedAt`
and `review.lastReviewedCycle` to vault config so subsequent runs default
to "since the last one I generated."

Phase 3 is the milestone's headline artifact — every prior phase (cycle
calendar, vault scaffold, monthly report) was built so this command works
on day one of a Liferay review month with one keystroke.

Phase 3 introduces:

1. **One CLI surface change.** `self-wiki self-review` subcommand with
   `--since <YYYY-MM-DD>`, `--cycle <YYYY-cycleN>`, `--last-cycle`,
   `--prior-review <path>`, `--dry-run`, `--force`, `--out <path>` flags.
2. **One new prompt.** `src/templates/prompts/self-review.md` — Liferay-
   form-shaped, embeds inline definitions of Liferay's 5 values, mandates
   per-accomplishment value tagging with multi-value support.
3. **One auto-backfill chain.** Missing monthlies for the cycle window
   trigger `reportMonthOrchestrator` per missing month (which itself
   cascades to weeklies). Default-on with a preflight stderr summary.
4. **One vault-config writeback.** On success, `lastReviewedAt` (today's
   ISO date) + `lastReviewedCycle` (e.g. `2026-cycle1`) via
   `writeVaultConfig({ review: { ... } })`.
5. **One Phase 1 prerequisite fix.** `src/core/cycles.js` cycle-boundary
   semantics are wrong as-shipped (cycle ending in month M ends on day M-1
   instead of M, producing non-uniform 3/4/5-month cycles instead of
   uniform 4-month). Fix lands in Phase 3 wave 1 before any self-review
   code consumes it. See `<spec_lock>` and decision D-PREREQ.

Out of scope for Phase 3: year-over-year trend reports (v2 TREND-01),
per-value coverage metrics across cycles (v2 TREND-02), mid-cycle preview
mode (v2 TREND-03), Liferay-form export tooling (v2 TOOL-01), self-review
diff between cycles (v2 TOOL-02).

</domain>

<decisions>
## Implementation Decisions

### Cycle-Boundary Prerequisite (Phase 1 Fix)

- **D-PREREQ:** **Fix Phase 1 cycles.js semantics as a Phase 3 wave-1
  plan.** The shipped `resolveCycle` defines `end = lastDayOfMonth(year,
  endMonth - 1)`, producing for `[5, 9, 12]`:
  - 2026-cycle1: Dec 1 2025 → Apr 30 2026 (5 months)
  - 2026-cycle2: May 1 → Aug 31 2026 (4 months)
  - 2026-cycle3: Sep 1 → Nov 30 2026 (3 months)

  This contradicts both PROJECT.md ("cycle is currently 4 months long")
  and the user's mental model that December's work belongs to the cycle
  whose review happens in December (i.e., 2025-cycle3 should cover
  through Dec 31 2025, not stop at Nov 30). The fix:
  ```diff
  - const end = lastDayOfMonth(reviewYear, endMonth - 1);
  + const end = lastDayOfMonth(reviewYear, endMonth);
  ```
  Yields uniform 4-month cycles:
  - 2026-cycle1: Jan 1 → Apr 30 2026 (4 months — review written in May)
  - 2026-cycle2: May 1 → Aug 31 2026 (4 months — review written in Sep)
  - 2026-cycle3: Sep 1 → Dec 31 2026 (4 months — review written in
    early Jan / late Dec)

  The `cycleEndMonths` field name now matches its semantic literally:
  the months in which cycles END (inclusive). Naming year stays "year in
  which the review month falls" — so the December 2026 cycle is named
  `2027-cycle1` because its review happens in May 2027? No: under fixed
  semantics the cycle ending Dec 2026 is `2026-cycle3` (review in
  Dec/early Jan 2027 — naming year remains the review-month year for
  the May/Sept cycles, but for the December cycle we keep the
  end-of-cycle calendar year for clarity). **Planner must resolve this
  naming question** as part of D-PREREQ; the cleanest path is to keep
  the existing rule "name year = review-month year" and accept that
  cycle3 reviews effectively span Dec→early-Jan, which is how it
  works in practice anyway.

  D-PREREQ touches: `src/core/cycles.js`, `test/cycles.test.js`,
  `.planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md` (D-03
  and D-04 retro-amendment with a 2026-05-08 corrigendum block),
  `.planning/PROJECT.md` (CYCLE-PHASE1 validated note — append a
  corrigendum line). No code outside `cycles.js` and its tests
  consumes the boundary semantics yet (Phase 2 uses calendar months,
  not cycles), so the blast radius is contained.

  D-04 of Phase 1 ("when m equals a non-first entry, advance to next
  slot") may also need revision under fixed semantics — the planner
  decides; the goal is `resolveCycle(2026-05-15, [5,9,12]).previous`
  returns `2026-cycle1` (ended Apr 30) on May 15.

### Window Resolution & Re-run Safety (Area 1)

- **D-01:** **Bare `self-wiki self-review` defaults to the most recently
  completed cycle.** Concretely: pick whichever of `resolveCycle().current`
  or `resolveCycle().previous` has `.end ≤ today`, preferring `current`
  when both have ended. Under fixed semantics, on 2026-05-08 this
  yields `2026-cycle1` (ended Apr 30). Matches REVIEW-02's "fall back
  to the most recently completed cycle from cycleEndMonths." The
  precedence `--since` → `lastReviewedAt` → this default still
  applies; this decision pins the third tier.
- **D-02:** **`review.lastReviewedAt` and `review.lastReviewedCycle`
  written on every successful generation.** Includes `--since` runs.
  When `--since` is off-boundary, `lastReviewedCycle` = the enclosing
  cycle's name (per D-04). Simple mental model; no
  "is-this-a-real-run-or-exploration" state machine. Mirrors REVIEW-07
  wording verbatim.
- **D-03:** **Re-run policy: refuse without `--force`.** Reviews are
  hand-edited after generation (unlike weekly/monthly which are
  regenerated routinely), so silent overwrite costs the user real
  work. First write succeeds. Subsequent runs without `--force` error
  with: `error: Reviews/<file>.md already exists. Use --force to
  regenerate (your edits will be lost; recover via 'git restore
  Reviews/<file>.md' if needed).` `--force` writes with a
  `<!-- regenerated YYYY-MM-DD -->` marker prepended (matching
  monthly's regeneration pattern but only on explicit request).
- **D-04:** **Off-boundary `--since` snaps filename to the enclosing
  cycle.** When `--since` doesn't equal a cycle's start date,
  filename = `Reviews/<enclosing-cycle>.md` where enclosing = the
  cycle whose `[start, end]` contains the `--since` date. The prompt
  receives a header note: `WINDOW_NOTE: Custom window <since> →
  <end>; report covers a partial slice of <cycle-name>.` Keeps
  Reviews/ tidy (one file per cycle) and ensures `lastReviewedCycle`
  always has a real cycle name to write back. The model is
  responsible for honoring the partial-window framing in its prose.

### Auto-Backfill Chain (Area 2)

- **D-05:** **Default-on auto-backfill of missing monthlies, with
  preflight stderr summary.** Mirror Phase 2's pattern: missing
  monthlies trigger `reportMonthOrchestrator(month, ...)` per missing
  month (which itself cascades to weeklies via existing Phase 2
  logic). Single `hasClaudeCli()` upstream gate before the chain
  starts (Phase 2 invariant: no partial state from a mid-loop crash).
  Before invoking, emit a stderr block:
  ```
  Resolving 2026-cycle1 (2026-01-01 → 2026-04-30)…
  Monthlies needed: 2026-01, 2026-02, 2026-03, 2026-04
    ✓ Reports/2026-04.md exists
    will generate: 2026-01, 2026-02, 2026-03 (3)
    cascades to backfill ~12 weekly reports
  ```
  Non-interactive; the user can Ctrl-C if surprised by the cascade
  size. No `--no-backfill` flag — if the user wants to opt out they
  can pre-generate the monthlies they want and `--force` will not
  retrigger missing-detection (existing files short-circuit).
- **D-06:** **Stale monthlies treated as canonical.** If
  `Reports/<YYYY-MM>.md` exists, use it as-is. No mtime comparison,
  no auto-refresh. Aligns with CLAUDE.md's "daily logs are source of
  truth" — if the user wants a refreshed monthly, they re-run
  `self-wiki report --month <YYYY-MM>` themselves before
  `self-review`. Self-review never silently regenerates existing
  monthlies. No `--refresh-monthlies` flag in v1; defer until a real
  workflow demands it.
- **D-07:** **`--dry-run` is strict: no `claude -p` invocation, ever.**
  Mirror Phase 2 D-02 / CONTEXT.md `<specifics>`. The dry-run prompt
  prints the self-review envelope with placeholder text where
  monthlies are missing:
  ```
  CYCLE: 2026-cycle1 (2026-01-01 → 2026-04-30)
  WINDOW_NOTE: missing monthlies (would be backfilled in non-dry-run):
    2026-01, 2026-02, 2026-03
  MONTHLIES:
  ## --- 2026-04 ---
  [contents of existing 2026-04 monthly]
  ## --- 2026-01 ---
  (would be backfilled)
  [...]
  ```
  No file writes; no side effects. The `hasClaudeCli` soft-fail-to-
  dry-run pattern still applies for non-dry-run runs (missing claude
  + non-dry-run = automatic dry-run mode with stderr notice, per
  ROADMAP success criterion 5).

### Section 1: Accomplishments + Value Tagging (Area 3)

- **D-08:** **Inputs: monthlies (primary spine) + weeklies (secondary
  detail) + topic pages (ticket/component ground truth).** Prompt
  envelope labels each block with a role hint:
  ```
  MONTHLIES: (primary — use as the spine)
  WEEKLIES:  (secondary — for detail when monthly is thin)
  TOPIC_PAGES: (ticket/component ground truth)
  ```
  Per REVIEW-05. Topic-page selection mirrors Phase 2's
  `loadInMonthTopicPages` (`^## <date>\b` anchored, all in-cycle
  dates) but expanded to the cycle window — the planner extracts
  this into a shared helper or duplicates inline; both consistent
  with codebase conventions.
- **D-09:** **Inline definitions for the 5 Liferay values in the
  prompt template.** Bake into `src/templates/prompts/self-review.md`
  as a versioned, iterable block. Initial wording:
  ```
  ## Liferay values (use exactly these names; tag accomplishments below)
  - **Produce Excellence** — deliver high-quality, well-engineered work
  - **Lead by Serving** — enable teammates; mentor; unblock; hand off cleanly
  - **Value People** — treat colleagues with care; collaborate over compete
  - **Grow & Get Better** — learn deliberately; expand expertise; reflect
  - **Stay Nerdy** — dive deep; explore; bring playful curiosity
  ```
  The user can iterate the wording later by editing the prompt
  template; no code change needed (matches the "versioned prompt
  template" pattern from weekly/monthly).
- **D-10:** **Multi-value tagging mandatory on every accomplishment.**
  Format: `- **<accomplishment>** — <Value>[, <Value>]` per
  REVIEW-04. Multi-value when work genuinely spans (e.g., complex
  refactor delivered cleanly = Produce Excellence + Stay Nerdy).
  Every Section 1 accomplishment must carry at least one value tag —
  forces the model to make the mapping explicit, which is the whole
  point of the section. The prompt rule reads: "Every accomplishment
  MUST end with a value-tag clause; multi-value when work genuinely
  spans; never omit the dash and value list."

### Q2/Q3 Evidence + Prior Continuity + Sources (Area 4)

- **D-11:** **Q2 strict no-invention; Q3 strict but synthesis-friendly
  across multiple sources.** Q2 (would-have-done-differently) must
  cite specific lessons / decisions / mistakes from monthlies'
  `## Lessons learned` and weekly equivalents — same evidence rule
  as the weekly prompt. Q3 (Grow & Get Better focus) stays strict
  (must be backed by recurring patterns in lessons + decisions —
  e.g., "three monthlies mention testing gaps → Q3 focus on TDD")
  but explicitly allows cross-source synthesis to identify the
  pattern. The prompt distinguishes:
  - Q2: "Cite the specific monthly / weekly lesson (file + section)
    each item came from."
  - Q3: "Synthesize a focus area from RECURRING patterns across
    multiple monthlies; cite the supporting evidence for each focus."
  No pure speculation in either section.
- **D-12:** **Prior-review continuity: auto-detect file + manual
  override.** Two paths into the prompt:
  - **Auto-detect:** if `Reviews/<YYYY>-cycleN-1.md` exists (the
    immediately prior cycle by name), read it, extract its Q3
    section, and feed as `PRIOR_GROWTH_FOCUS`. The prompt invites
    the model to annotate Q1 accomplishments that show follow-
    through on the prior cycle's stated focus (e.g., `*(follow-
    through on 2025-cycle3 growth focus)*` italics).
  - **Manual override:** `--prior-review <path>` reads the given
    file (any markdown — could be a Liferay-form copy-paste into a
    `.md`, an old gdoc-export, etc.) and feeds the **full body**
    as `PRIOR_REVIEW`. Lets first-time users provide continuity
    from a review made before self-wiki existed. Manual flag wins
    on collision with auto-detect.
  - **Soft-fail:** if neither file exists, omit both inputs
    silently (no warning).
- **D-13:** **Per-question inline source attribution + final
  aggregated `## Sources` block.** Each Q1/Q2/Q3 item carries a
  `*(source: <file>[, <file>])*` italic clause. Final `## Sources`
  block at the bottom aggregates by type (Monthly / Weekly /
  Topic / Prior). Inline attribution serves REVIEW-09's "spot-check
  provenance" goal directly — the user can refine underlying notes
  when a specific section reads weak. Aggregated block serves the
  auditable-provenance goal. Sources granularity: file-level for
  the inline (`Reports/2026-02.md`) and file-level for the
  aggregate. Section-level anchors (`§Theme 1`) deferred — adds
  parsing complexity for marginal gain.

### Claude's Discretion

- **Cycle-name year for the December cycle under fixed semantics**
  (D-PREREQ). Cleanest path: keep "name year = review-month year"
  rule, accept that cycle3 reviews effectively span Dec→early-Jan.
  Alternative: name by end-of-cycle calendar year. Planner picks
  and documents in the cycles.js fix plan.
- **Phase 1 D-04 retro-amendment scope.** The "advance to next
  slot when m equals a non-first entry" rule may not need to
  exist under fixed semantics. Planner verifies the resolveCycle
  test matrix and either deletes the rule or rewrites it.
- **Whether the auto-backfill preflight summary requires interactive
  confirmation** (default per D-05: just print, trust user to
  Ctrl-C). Planner may add `--yes` / `-y` flag for CI symmetry but
  the default stays non-interactive.
- **Whether to lift `loadInMonthTopicPages` into a shared helper**
  (e.g., `src/core/topic-loader.js`) consumed by both monthly and
  self-review, or duplicate inline in the new self-review code.
  Both are consistent with codebase conventions (`src/core/<area>.js`
  rule). The planner picks based on the diff cost.
- **Exact CLI shape for `--cycle`, `--last-cycle`, `--since`,
  `--prior-review` mutual exclusion.** Mirror Phase 2's
  `--week`/`--month` mutex pattern (validate at the command,
  `process.exit(1)` with a clear message). Planner picks the
  exact validation matrix.
- **Whether `--out <path>` is added** (mirrors monthly's
  `--out` flag). Default expectation: yes, add it for symmetry;
  the existing `resolveOutPath` warns when the path leaves the
  vault.
- **Inline source-ref format.** D-13 suggests
  `*(source: <file>)*` italics. Planner may prefer
  `[source: <file>]` brackets or `— source: <file>` em-dash; any
  format the model can be made to follow consistently is fine.
  Italic markdown survives Liferay-form paste better than HTML
  comments would.
- **Whether `--prior-review` body length is capped.** A 3000-line
  manually-pasted prior review could blow context. Default
  expectation: accept as-is; document in `--help` that very long
  prior reviews may degrade synthesis. No truncation logic in v1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone (locked context)

- `.planning/PROJECT.md` — Milestone context (4-month Liferay self-
  review, Liferay's 5 values, three review questions); Key Decisions
  table (review-boundary precedence, cycle calendar in vault config,
  output to `Reviews/`, accomplishments tagged with values); Out of
  Scope (no Liferay-form API integration, no multi-user, no ratings).
- `.planning/REQUIREMENTS.md` §"Self-Review Report" — REVIEW-01
  through REVIEW-09; the nine requirements that drive this phase.
- `.planning/ROADMAP.md` §"Phase 3" — goal and five success criteria
  (criterion 1: Reviews/<YYYY>-cycle<N>.md + value-tagging format;
  criterion 2: precedence; criterion 3: vault writeback; criterion
  4: Sources footer; criterion 5: dry-run + cycle/last-cycle flags +
  soft-fail).

### Architectural Rules (project-wide)

- `CLAUDE.md` — autonomy boundary at the hook (irrelevant for Phase
  3, no hook changes); deterministic-vs-model split (no model-side
  arithmetic; `lastReviewedAt`/`lastReviewedCycle` writeback values
  computed in code); soft dependencies degrade silently (`claude`
  missing → dry-run with notice); daily logs are source of truth (so
  topic-page touches anchored on parsed structure, not generated
  metric blocks); no `obsidian-cli`.
- `CLAUDE.md` §"Adding a new self-wiki subcommand the skill or
  model is expected to invoke" — adds `Bash(self-wiki self-review *)`
  rule to `src/templates/permissions.json`.

### Phase 1 Hand-off (with prerequisite fix per D-PREREQ)

- `.planning/phases/01-cycle-config-vault-scaffold/01-CONTEXT.md` —
  cycle helper context. **NOTE:** D-03 and D-04 are factually wrong
  per D-PREREQ; the Phase 3 wave-1 cycles.js fix corrects them.
  Append a 2026-05-08 corrigendum block; do NOT delete the historic
  decisions (the fix plan needs the diff context).
- `src/core/cycles.js` — `resolveCycle(date, cycleEndMonths)`.
  Modified by Phase 3 wave 1 per D-PREREQ.
- `src/core/reviews.js#ensureReviewsDir(vaultPath)` — call before
  any `Reviews/<...>.md` write. Already shipped; extend this module
  with the review writer per CLAUDE.md's "no other module may write
  to Reviews/<...>.md" rule.
- `src/core/config.js` — `VAULT_DEFAULTS.review` already seeded
  (`{cycleEndMonths: [5,9,12], lastReviewedAt: null,
  lastReviewedCycle: null}`); `writeVaultConfig({review: {...}})`
  deep-merge already lifts the latent shared-ref hazard.
- `test/cycles.test.js` — must update to lock the new boundary
  semantics; expand the test matrix to verify uniform 4-month
  cycles for `[5,9,12]` and arbitrary other configurations.

### Phase 2 Hand-off (auto-backfill pattern + monthly skeleton)

- `.planning/phases/02-monthly-report/02-CONTEXT.md` — auto-backfill
  semantics (D-02/D-03), prompt envelope (D-05), `hasClaudeCli`
  upstream gate (D-08), partial-window header note pattern (D-15).
  Phase 3 mirrors all of these for the cycle window.
- `src/commands/report.js` — direct precedent. Patterns to mirror:
  - `reportCommand` orchestration with `opts.month` branch — Phase
    3 adds `selfReviewCommand` as a sibling, NOT another flag on
    `report` (the milestone is review-shaped, not report-shaped).
  - `reportMonthOrchestrator` (lines 265–384): template for
    `selfReviewOrchestrator` — auto-backfill loop, single
    `hasClaudeCli` upstream gate, `--dry-run` short-circuit, soft-
    fail on `claude` missing, `<!-- regenerated YYYY-MM-DD -->`
    marker on `--force` overwrite.
  - `loadPriorMonthReport` (lines 214–227): direct analog for
    self-review's `loadPriorCycleReview` (D-12).
  - `loadInMonthTopicPages` (lines 229–263): expand the in-month
    date matching to in-cycle (or lift into a shared
    `loadTopicPagesInRange(dates)` helper — Claude's discretion
    per D-08).
  - `buildMonthlyPrompt` (lines 386–441): structural template for
    `buildSelfReviewPrompt`. Substitute `MONTH:` with `CYCLE:`,
    add `WINDOW_NOTE:` (D-04, D-07), `MONTHLIES:` block, optional
    `WEEKLIES:` block, `TOPIC_PAGES:` block, optional
    `PRIOR_GROWTH_FOCUS:` / `PRIOR_REVIEW:` blocks per D-12.
  - `resolveOutPath` (lines 24–32): reuse for `--out` flag (D-13
    Claude's discretion).
- `src/templates/prompts/monthly-report.md` — skeleton + rules to
  mirror in `self-review.md`: untrusted-data treatment, no
  invention, no echoing, ticket-IDs over prose, terse-bullets-not-
  paragraphs, output-only-the-report.
- `src/templates/prompts/weekly-report.md` — also useful for the
  `## Lessons learned` extraction patterns Q2 of self-review will
  consume.

### Codebase Maps (refreshed 2026-05-07; still current)

- `.planning/codebase/STRUCTURE.md` §"Where to Add New Code" —
  pattern for new subcommand under `src/commands/<name>.js`,
  matching `src/core/<area>.js` rule for the cycle helper / review
  writer, test convention, CLI flag wiring through `src/cli.js`.
- `.planning/codebase/ARCHITECTURE.md` §"Layers" — confirms
  `src/core/reviews.js` is the right home for the cycle-window
  resolution + writer; `src/commands/self-review.js` is the
  command-layer entry. §"Anti-Patterns" — no model-side arithmetic
  (cycle bounds + dates computed in `resolveCycle`/format helpers,
  fed to the prompt).
- `.planning/codebase/STACK.md` — Node 20+, ESM, Commander,
  `node --test`. No new tooling; no transpile step.

### Existing Code Touched, Lifted, or Extended by Phase 3

- `src/cli.js` (lines 85–92) — current `report` subcommand wiring.
  Phase 3 adds a sibling `self-review` subcommand around this
  registration block.
- `src/templates/permissions.json` — add
  `Bash(self-wiki self-review *)` rule (CLAUDE.md project-
  conventions section is explicit about this).
- `src/core/reviews.js` — currently exports
  `ensureReviewsDir(vaultPath)` only; Phase 3 extends with cycle-
  window resolution, file-name resolution, and the
  selfReviewOrchestrator entry point. Per CLAUDE.md: no other
  module may write to `Reviews/<*>.md`.
- `src/core/cycles.js` + `test/cycles.test.js` — modified per
  D-PREREQ in Phase 3 wave 1, BEFORE any self-review code consumes
  the helper.
- `src/utils/format.js` — UTC-arithmetic patterns (`isoDate`,
  `priorMonth`, `datesInMonth`, `weeksInMonth`). Phase 3 may need
  a `monthsInRange(startDate, endDate)` helper (returning
  `YYYY-MM` strings overlapping the cycle window) to drive the
  monthly auto-backfill loop. Mirrors the existing `weeksInMonth`
  pattern.
- `src/utils/paths.js` — `getReportFilePath(weekStr)` already
  handles arbitrary string filenames against `Reports/`. Phase 3
  needs `getReviewFilePath(cycleName)` returning
  `<vault>/Reviews/<cycleName>.md` — sibling helper following
  the same pattern. Add to the existing exports list.
- `src/core/config.js` — `writeVaultConfig({review: {
  lastReviewedAt, lastReviewedCycle }})` for the success
  writeback. The existing deep-merge for the `review` key (Phase
  1) handles this without modification.
- `src/core/claude.js` — `claudeHeadless`, `hasClaudeCli`. Reused
  for self-review synthesis + the soft-fail-to-dry-run gate.
- `src/core/metrics.js` — `buildMetrics(dates, {shape, components})`.
  The cycle window is dates-driven (4 months × ~30 days). The
  planner decides whether to add a `shape: 'cycle'` branch (e.g.,
  cycle-specific metric like "PRs landed this cycle") or pass
  `shape: 'month'` and accept slight rephrasing. Default
  expectation: pass `shape: 'month'` for v1; add a cycle shape
  later if a Liferay reviewer specifically asks for it.

### Existing Tests to Preserve / Mirror

- `test/cycles.test.js` — must be updated for fixed semantics.
- `test/report.test.js` — patterns for command-layer testing
  (XDG_*_HOME isolation, temp-dir vault, `claude` mocked or
  bypassed via `--dry-run`).
- `test/format.test.js`, `test/paths.test.js`, `test/config.test.js`
  — patterns for new helper tests.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`reportMonthOrchestrator` in `src/commands/report.js:265-384`** —
  closest possible precedent. The auto-backfill loop, single
  `hasClaudeCli` upstream gate, dry-run short-circuit, soft-fail on
  missing claude, and partial-window header note all transfer
  directly. Phase 3 builds `selfReviewOrchestrator` as a sibling
  with the same shape, substituting "monthly" with "cycle" and
  adding the prior-review-continuity branch.
- **`loadPriorMonthReport` in `src/commands/report.js:214-227`** —
  direct template for `loadPriorCycleReview` (D-12 auto-detect
  branch). Soft-fail on absent file.
- **`loadInMonthTopicPages` in `src/commands/report.js:229-263`** —
  direct template; expand the date set from in-month to in-cycle.
  The `^## <date>\b` anchor and the `Tickets`/`Components` walk
  carry over verbatim.
- **`buildMonthlyPrompt` in `src/commands/report.js:386-441`** —
  envelope structure. Phase 3 substitutes `MONTH:` with `CYCLE:`,
  adds `WINDOW_NOTE:` (D-04 + D-07), structures inputs as
  `MONTHLIES: / WEEKLIES: / TOPIC_PAGES: / PRIOR_GROWTH_FOCUS: /
  PRIOR_REVIEW:`. The `Sources:` line stays.
- **`resolveOutPath` in `src/commands/report.js:24-32`** — handles
  the out-of-vault warning. Reuse for `--out`.
- **`hasClaudeCli` + dry-run short-circuit pattern (lines 290–294,
  357–360)** — exactly the soft-fail-to-dry-run behavior REVIEW-08 +
  ROADMAP success criterion 5 require.
- **`writeVaultConfig({review: {...}})` deep-merge** — already
  shipped in Phase 1 with `getVaultDefaults` returning a
  structuredClone. The success writeback is one call.
- **`ensureReviewsDir(vaultPath)`** — already shipped in Phase 1.
  Self-review calls this before any write.
- **`applyUserConfig()` + `ensureVaultConfigured()` boilerplate** —
  every command preamble; the new self-review path inherits it.
- **`escapeRegex` in `src/utils/regex.js`** — used by topic-page
  date matching; reuse if the loader is duplicated inline.

### Established Patterns

- **Versioned prompt templates** in `src/templates/prompts/<name>.md`,
  read at runtime via `readFile` against `MONTHLY_PROMPT_PATH`-style
  resolved paths. Phase 3 follows REVIEW-06 by adding
  `self-review.md` next to `monthly-report.md` and a
  `SELF_REVIEW_PROMPT_PATH` constant alongside the existing two.
- **UTC date arithmetic** in `src/utils/format.js` — every cycle-
  window date computation must use `Date.UTC` per the existing
  `datesInMonth`/`weeksInMonth` precedent.
- **Soft-fail external CLIs** (`gh`, JIRA, `claude`) — Phase 3
  inherits the `claude` soft-fail via `hasClaudeCli`.
- **One test file per source module** — new helpers
  (`monthsInRange`, `getReviewFilePath`, `loadPriorCycleReview`,
  `selfReviewOrchestrator`) get tests in their respective
  `test/<name>.test.js` or extend an existing test file when they
  ride on `format.js` / `paths.js`.
- **Mutually exclusive flags validated at the command** — existing
  `--week` + `--month` mutex (lines 43–47) is the template for
  `--since` / `--cycle` / `--last-cycle` mutex.
- **`--out <path>` with vault-boundary warning** — existing
  `report --out` pattern (line 121, 365). Phase 3 mirrors.

### Integration Points

- **`src/cli.js` `self-review` subcommand wiring** — new
  registration block; flags: `--since <YYYY-MM-DD>`,
  `--cycle <YYYY-cycleN>`, `--last-cycle`, `--prior-review <path>`,
  `--dry-run`, `--force`, `-o, --out <path>`.
- **`src/templates/permissions.json`** — add
  `Bash(self-wiki self-review *)` so the skill or the model can
  invoke it under the auto-mode classifier.
- **`src/commands/self-review.js`** (new) — orchestration entry
  point; mirrors `report.js`'s monthly path structurally.
- **`src/core/reviews.js`** (extended) — owns
  `resolveReviewWindow(opts)`,
  `loadPriorCycleReview(cycleName, manualPath?)`,
  `selfReviewOrchestrator(opts)`, and the writer. Per CLAUDE.md,
  no other module touches `Reviews/<*>.md`.
- **`src/templates/prompts/self-review.md`** (new) — versioned
  prompt; mirrors monthly's structural rules + adds the 5-values
  block + the per-question evidence rules + the per-item source-
  attribution + the multi-value tagging mandate.
- **`src/utils/format.js`** — new `monthsInRange(start, end)`
  helper for the cycle's month-walk; mirrors `weeksInMonth`.
- **`src/utils/paths.js`** — new `getReviewFilePath(cycleName)`
  sibling to `getReportFilePath`.
- **`src/core/cycles.js`** — fixed per D-PREREQ before Phase 3
  consumes the boundary semantics.
- **`src/core/config.js#writeVaultConfig`** — used for the
  success writeback (`{review: {lastReviewedAt, lastReviewedCycle}}`).
  No code change.

### Things Phase 3 Does NOT Touch

- Hooks (`src/templates/hooks.json`) — no new hook events.
- Daily-log writers (`src/core/logger.js`) — self-review reads
  monthlies/weeklies/topic-pages, never writes to dailies.
- Topic-page writers (`src/core/topics.js`) — read-only on topic
  pages.
- Session lifecycle (`src/commands/session.js`) — no session
  interactions.
- `src/core/state.js` — no state-file changes; vault config holds
  all review-related persistent state.

</code_context>

<specifics>
## Specific Ideas

- **Mirror Phase 2, don't reinvent.** The auto-backfill loop, the
  prompt envelope, the dry-run + soft-fail behavior, the
  `<!-- regenerated -->` marker, the partial-window header note —
  all are direct ports from `reportMonthOrchestrator`. The
  intentional differences are: cadence (cycle vs month), input
  set (monthlies + weeklies + topic pages instead of weeklies +
  topic pages), the prior-review-continuity branch (D-12), the
  re-run safety policy (D-03 refuse-without-force, asymmetric
  with monthly's silent overwrite), and the per-item source-
  attribution requirement (D-13).
- **The cycles.js prerequisite is wave 1 and load-bearing.** Phase
  3's window resolution, filename construction, and auto-backfill
  range all depend on the boundary fix landing first. The planner
  must structure waves so the cycles.js fix + its tests are
  green before any self-review code merges.
- **Section 1 is the critical-path output.** It's the section the
  user pastes most directly into Liferay's review form. The
  multi-value tagging mandate (D-10) and the inline value
  definitions (D-09) exist to make that paste mechanical.
  Decisions D-08 / D-09 / D-10 should be tested with at least one
  real-vault dry-run before Phase 3 closes.
- **Q3 synthesis is the most ambitious section.** D-11 explicitly
  permits cross-source pattern synthesis for Q3 (forward-looking)
  while staying strict on Q2 (backward-looking). The prompt
  template wording is delicate — the planner should plan to
  iterate it after a real-vault dry-run.
- **Liferay-specific defaults are non-negotiable.** Five values,
  three review questions, May/Sept/Dec cadence, 4-month cycle —
  all hardcoded in the prompt or seeded as `cycleEndMonths`
  defaults. The "users at other companies fork" clause in
  PROJECT.md's Out of Scope means we do not need to abstract any
  of these for portability.
- **The user runs this once a cycle.** Cost-of-cascade matters but
  not as much as for the weekly/monthly path. A 16-`claude -p`-call
  fresh-vault-on-cycle-end run is acceptable; the preflight
  summary (D-05) gives the user agency without forcing an
  interactive prompt.

</specifics>

<deferred>
## Deferred Ideas

- **`--refresh-monthlies` flag** — force-regenerate every in-cycle
  monthly before synthesis. Useful when the user has retroactively
  edited dailies. Defer until a real workflow demands it (D-06).
- **mtime-based stale detection for monthlies** — auto-detect
  edited dailies vs older monthly mtime. Fragile (touch /
  vault-sync invalidates mtimes); defer indefinitely (D-06
  alternative).
- **Section-level source anchors** (`Reports/2026-02.md §Theme 1`)
  — finer-grained provenance than file-level. Adds parsing
  complexity for marginal gain at v1 scale; defer.
- **HTML-comment-wrapped Sources block** for paste-friendliness
  (so the Sources block doesn't go into Liferay's form on paste).
  Counter-argument: the user wants to SEE sources locally to
  spot-check. Defer; the user can manually delete the Sources
  block before pasting if needed.
- **Single-value tagging mode** — if Liferay's actual form ever
  requires single-value selection, add `--single-value` flag.
  Speculative until confirmed.
- **Vault-config-driven value definitions** for non-Liferay users
  — explicitly out of milestone scope per PROJECT.md.
- **Year-over-year diff** (v2 TREND-01) — full prior-review
  comparison; partially seeded by D-12's `PRIOR_GROWTH_FOCUS`
  follow-through annotations, but the diff/comparison feature
  itself is v2.
- **Per-value coverage metric across cycles** (v2 TREND-02) —
  "you haven't claimed Lead by Serving in 3 cycles." v2.
- **Mid-cycle preview** (v2 TREND-03) — `self-wiki self-review
  --preview` mid-cycle. D-02's "always write back" rule was
  chosen over the alternative "only complete-cycle runs" partly
  because adding preview later is easy if we relax write-back
  rules; and partly because preview is an explicit v2 candidate.
- **Liferay-form export tooling** (v2 TOOL-01) — section-by-
  section clipboard helper. v2.
- **Self-review diff between two cycles** (v2 TOOL-02) — what
  got better, what stayed the same. v2.
- **Cycle-shape metric helper** (`shape: 'cycle'` in
  `buildMetrics`) — cycle-specific aggregate metrics (PRs
  landed across cycle, distinct components touched, etc.).
  Default expectation per D-08 Claude's Discretion: pass
  `shape: 'month'` and accept the rephrasing for v1.
- **`--auto-confirm` / `-y` flag for the preflight summary** —
  CI symmetry. Default per D-05 is non-interactive (just
  print). Add `-y` only if a real workflow demands it.
- **Cap on `--prior-review` body length** — defer; document
  in `--help` that very long manual prior reviews may degrade
  synthesis. No truncation logic in v1.

</deferred>

---

*Phase: 03-self-review-report*
*Context gathered: 2026-05-08*
