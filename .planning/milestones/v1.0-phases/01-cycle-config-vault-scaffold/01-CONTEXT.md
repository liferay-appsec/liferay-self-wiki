# Phase 1: Cycle Config & Vault Scaffold - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Foundation layer for the Liferay self-review milestone. Phase 1 delivers three
internal capabilities consumed by Phases 2 and 3:

1. **Vault config schema extension.** Add a `review` section to vault config
   defaults (`cycleEndMonths`, `lastReviewedAt`, `lastReviewedCycle`).
2. **Cycle-boundary helper.** A pure utility (`src/core/cycles.js`) that, given
   a date and `cycleEndMonths`, returns the current and previous cycle as
   `{name, start, end}` triples.
3. **`Reviews/` directory scaffold.** `init` creates the directory for new
   vaults; an `ensureReviewsDir(vaultPath)` helper covers pre-existing vaults
   so Phase 3 can call it on first `self-wiki self-review` run.

Phase 1 has no user-facing CLI surface change. No new subcommands. No new
flags. Every artifact is internal plumbing for Phase 2 (monthly report) and
Phase 3 (self-review report) to consume.

</domain>

<decisions>
## Implementation Decisions

### Cycle Helper API

- **D-01:** Single exported function `resolveCycle(date, cycleEndMonths)`
  living in `src/core/cycles.js`. Returns `{ current: {name, start, end},
  previous: {name, start, end} }`. One call answers every question Phases
  2 and 3 need; no companion exports.
- **D-02:** Cycle names use the format `<YYYY>-cycle<N>` where `N` is the
  1-indexed position of the matching `cycleEndMonth` in the sorted
  `cycleEndMonths` array. Example for `[5, 9, 12]`: cycle ending May =
  `cycle1`, cycle ending Sept = `cycle2`, cycle ending Dec = `cycle3`.
  The year prefix is the year in which the cycle's review month falls
  (so `2026-cycle1` is the cycle whose review happens in May 2026).

### Cycle Boundary Semantics

- **D-03:** **Contiguous coverage.** Each cycle starts the day after the
  previous cycle ended. Every calendar day belongs to exactly one cycle —
  no gaps, no overlaps. Concretely, for `[5, 9, 12]` in 2026:
  - `2026-cycle1`: `2025-12-01` → `2026-04-30` (5 months)
  - `2026-cycle2`: `2026-05-01` → `2026-08-31` (4 months)
  - `2026-cycle3`: `2026-09-01` → `2026-11-30` (3 months)

  The cycle whose review happens in month `M` ends on the last day of
  month `M-1` and starts the day after the prior cycleEndMonth's
  matching boundary (with year-wrap when the prior end-month is the
  last entry in `cycleEndMonths`).
- **D-04:** Resolution rule for `current`: given today's date with month
  `m`, `current` is the cycle whose `cycleEndMonth` is the smallest
  entry `≥ m`. So during May (the review month for `cycle1`), `current`
  remains `cycle1` — the user is writing the review for that cycle, not
  yet living in `cycle2`. On June 1, `current` rolls forward to
  `cycle2`.
- **D-05:** Date format is `YYYY-MM-DD` ISO strings (no time component).
  Internal arithmetic uses `Date.UTC` to avoid DST/timezone surprises —
  matches the existing pattern in `src/utils/format.js#datesInWeek`.
  Phase 3 needs strings for filename construction; returning Date
  objects would force every consumer to format.
- **D-06:** Invalid `cycleEndMonths` throws with a clear message:
  `cycleEndMonths must be a non-empty sorted array of integers 1–12`.
  Empty array, non-array, out-of-range values (≤0 or >12),
  duplicates, or non-monotonic input all throw. Internal-contract
  violations should be loud; the codebase's "soft-fail" rule applies
  to external CLIs (`gh`, JIRA, `claude`), not config schema.

### Migration Strategy for Pre-Existing Vaults

- **D-07:** **Lazy-merge via `VAULT_DEFAULTS`.** Phase 1's only config
  change is adding the `review` block to `VAULT_DEFAULTS` in
  `src/core/config.js`. Because `readVaultConfig()` already shallow-merges
  defaults into the on-disk config, every old vault transparently sees
  the new section on every read — zero migration code required. The
  physical disk write happens naturally when Phase 3's `self-review`
  command stamps `lastReviewedAt`/`lastReviewedCycle` via
  `writeVaultConfig()`. This matches REQUIREMENTS-CONFIG-01's wording
  ("migrated on first self-review") exactly without writing a separate
  migration helper.
- **D-08:** Defaults seed: `{ cycleEndMonths: [5, 9, 12], lastReviewedAt:
  null, lastReviewedCycle: null }`. Matches REQUIREMENTS-CONFIG-02 and
  Liferay's current cadence.

### Reviews/ Directory Scaffold Ownership

- **D-09:** **Both** layers ship in Phase 1 (belt-and-suspenders):
  1. `src/commands/init.js` adds `'Reviews'` to its scaffold-dir list so
     new vaults get `Reviews/` alongside `Reports/`, `Tickets/`,
     `Components/`. `init` is already idempotent — re-running on an old
     vault upgrades it.
  2. A new helper module exports `ensureReviewsDir(vaultPath)` for
     Phase 3 to call before writing any `Reviews/<YYYY>-cycle<N>.md`
     file. This covers users who never re-run `init`.
- **D-10:** The `ensureReviewsDir` helper lives in **a new
  `src/core/reviews.js`** module. Justification: `src/core/topics.js`
  owns `Tickets/` and `Components/` writers; `Reviews/` is a different
  artifact lifecycle (rarely regenerated, cycle-shaped, not session-shaped)
  and warrants its own module. Phase 3 will grow `reviews.js` with the
  self-review writer; Phase 1 seeds the file with just `ensureReviewsDir`
  so it has a home to grow into.

### Test Coverage

- **D-11:** Phase 1 ships `test/cycles.test.js` covering the
  ROADMAP success criteria explicitly:
  - Liferay default `[5, 9, 12]` boundary cases for each cycle and a
    range of input dates including year-boundary previousCycle (e.g.,
    `Jan 5 2026` → previous = `2025-cycle3`).
  - Semi-annual `[6, 12]` (success criterion 4).
  - Annual `[12]` (single cycle).
  - Invalid inputs (empty, non-array, out-of-range, duplicates,
    non-monotonic) all throw the documented message.
  - Boundary days exactly: last day of `cycleEndMonth - 1` is in
    current; first day of `cycleEndMonth` rolls forward.

  Test isolation follows the existing convention — `XDG_*_HOME` env
  override + temp dirs.

### Claude's Discretion

- Exact wording of the throw message for `D-06` — keep it actionable
  ("...edit `<vault>/.self-wiki/config.json`") if Phase 3's command
  catches and prints it.
- Whether `resolveCycle` accepts `Date` objects, ISO strings, or both
  as the `date` parameter. Default expectation: accept both, normalize
  internally; the Phase 3 caller will likely pass `new Date()`.
- Whether to also export a small named helper from `cycles.js`
  (e.g., `cycleNameFor(year, ordinal)`) for testability — fine as long
  as `resolveCycle` remains the canonical export.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone

- `.planning/PROJECT.md` — Milestone goal (Liferay self-review), Liferay
  values, 4-month cadence context, distribution model, Out of Scope.
- `.planning/REQUIREMENTS.md` §"Vault Config & Cycle Calendar" and
  §"Vault Scaffold" — CONFIG-01/02/03, SCAFFOLD-01/02 (the five
  requirements mapped to this phase).
- `.planning/ROADMAP.md` §"Phase 1" — goal, success criteria, acceptance
  list.

### Architectural Rules (project-wide)

- `CLAUDE.md` — autonomy boundary at the hook; daily-logs-as-source-of-truth;
  deterministic-vs-model split; soft dependencies degrade silently;
  no `obsidian-cli`. **Phase 1 doesn't change any of these — but the
  cycle helper is "deterministic", so it lives in code, never in a
  prompt.**

### Codebase Maps (refreshed 2026-05-07)

- `.planning/codebase/STACK.md` — Node 20+, ESM, Commander, no
  TypeScript, `node --test`. Confirms Phase 1's tooling.
- `.planning/codebase/STRUCTURE.md` §"Where to Add New Code" — pattern
  for new core modules (`src/core/<area>.js`), test convention
  (`test/<module>.test.js`), `init` extension pattern.
- `.planning/codebase/ARCHITECTURE.md` §"Layers" — confirms `core` is
  the right layer for `cycles.js` and `reviews.js`. §"Anti-Patterns"
  — calling `claude -p` for arithmetic is forbidden (relevant: cycle
  computation must stay in code).

### Existing Code Touched by Phase 1

- `src/core/config.js` — `VAULT_DEFAULTS` lives here (lines 16-21 per
  STACK.md). Phase 1's lazy-migration strategy (D-07) hinges on the
  shallow-merge behavior of `readVaultConfig()`.
- `src/commands/init.js` — extends to add `Reviews/` to scaffold-dir
  list (D-09). Idempotent merge pattern preserved.
- `src/utils/format.js#datesInWeek` — reference implementation for UTC
  date arithmetic that `cycles.js` should mirror (D-05).
- `src/templates/vault/.self-wiki/config.json` — vault-config seed used
  by `init`; may need the `review` block added if `init` writes
  defaults explicitly (TBD by planner depending on how the seed
  template is consumed vs. computed from `VAULT_DEFAULTS`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`VAULT_DEFAULTS` shallow-merge** in `src/core/config.js` — every
  `readVaultConfig()` call already merges defaults into the on-disk
  config. This is what enables the zero-migration strategy (D-07).
- **`datesInWeek` UTC pattern** in `src/utils/format.js` — proven UTC
  date arithmetic to crib for `cycles.js` boundary math (D-05).
- **Idempotent `init` scaffolding** in `src/commands/init.js` —
  re-running `init` doesn't duplicate. Adding `'Reviews'` to the dir
  list is a one-line, idempotent change.
- **Test convention `test/<module>.test.js`** with `XDG_*_HOME`
  isolation — directly reusable for `test/cycles.test.js`.

### Established Patterns

- **Core module layout** (per `.planning/codebase/STRUCTURE.md`):
  `src/core/<area>.js` for domain logic, one file per concern. New
  modules `src/core/cycles.js` and `src/core/reviews.js` slot in
  cleanly.
- **Pure utilities throw on bad input; external CLIs soft-fail.**
  `src/core/detect.js` swallows errors from `git`/`gh`/JIRA; pure
  utilities like `src/utils/format.js` and `src/utils/log-parser.js`
  don't try to "fix" malformed input. Phase 1's `resolveCycle` follows
  the pure-utility convention (D-06).
- **No model-side arithmetic** — `cycles.js` is the canonical example
  of the deterministic side of the codebase. Phases 2 and 3 must
  pre-compute cycle boundaries and pass them into the prompt as plain
  strings; never ask `claude -p` to compute a date.

### Integration Points

- **`src/core/config.js` VAULT_DEFAULTS extension** — the only config
  edit in Phase 1.
- **`src/commands/init.js` `scaffoldVault()` (or equivalent)** — add
  `Reviews/` to the dir list.
- **Phase 2 (monthly) hook**: Phase 2 may not need `cycles.js` directly
  (monthly reports are calendar-month, not cycle-shaped) — but a
  partial-window monthly report at the *end* of a cycle could
  cross-reference cycle boundaries for the report header. Decide in
  Phase 2.
- **Phase 3 (self-review) hook**: Phase 3 calls `resolveCycle()` to
  pick the review window when no `--since` and no `lastReviewedAt`
  exists, calls `ensureReviewsDir()` before writing, and calls
  `writeVaultConfig()` with the new `review.lastReviewedAt` /
  `review.lastReviewedCycle` after a successful run.

</code_context>

<specifics>
## Specific Ideas

- **Liferay defaults are non-negotiable**: `cycleEndMonths: [5, 9, 12]`.
  Defaults are part of the milestone identity — semi-annual `[6, 12]`
  must work for portability (success criterion 4) but Liferay's
  current cadence is the seed.
- **Cycle name format `<YYYY>-cycle<N>`** (no padding on `N`,
  1-indexed). Confirmed via decision D-02 and matches REQUIREMENT
  REVIEW-07.

</specifics>

<deferred>
## Deferred Ideas

- **`self-wiki cycle status` user-facing command** — could surface
  `current`/`previous` to the user without invoking self-review. Not
  scoped here. If genuinely useful, candidate for a future phase or
  the v2 backlog (TREND-03's "preview" feature is adjacent).
- **Validating the on-disk `lastReviewedCycle` matches the calendar**
  on read (e.g., catching a manual edit that put `2026-cycle9`).
  Defensive but probably unnecessary; defer until a regression bites.
- **Migrating an *existing* `lastReviewedAt` from a hypothetical
  pre-milestone manual setup** — N/A; the milestone is greenfield for
  this user. Skip.
- **Year-rollover edge: cycle whose `start` is in year `Y-1` and `end`
  is in year `Y` (e.g., `2026-cycle1` starts `2025-12-01`)** — the
  helper handles this correctly per D-03; just noting that Phase 3's
  filename uses the *end* year (`2026-cycle1.md`), not the start year.

</deferred>

---

*Phase: 1-cycle-config-vault-scaffold*
*Context gathered: 2026-05-07*

---

## CORRIGENDUM (2026-05-08, retro-amendment per Phase 3 D-PREREQ)

D-03 and D-04 (above) shipped with a cycle-boundary calculation that
chained cycle1.start back to cycle3-of-prior-year.end + 1 day, yielding
a 5/4/3-month split for `[5, 9, 12]` (cycle1 = Dec 1 2025 → Apr 30 2026,
cycle2 = May 1 → Aug 31, cycle3 = Sep 1 → Nov 30). This contradicted
PROJECT.md ("cycle is currently 4 months long") and the user's mental
model that the December cycle covers Sep-Dec, not Sep-Nov.

**Fixed semantic (Phase 3 wave 1, Option B — user-confirmed):**
`cycleEndMonths[i]` is read as the REVIEW month of cycle (i+1). Two
special cases reshape the year-boundary seam:

1. **Cycle 1 always starts Jan 1 of `reviewYear`** (does NOT chain
   back to the prior cycle's end + 1 day).
2. **The LAST cycle of the year always ends Dec 31 of `reviewYear`**
   (does NOT end at month-before-its-own-review-month).

Under `[5, 9, 12]` for review-year 2026 the cycles become:
- 2026-cycle1: 2026-01-01 → 2026-04-30 (4 months — review in May)
- 2026-cycle2: 2026-05-01 → 2026-08-31 (4 months — review in Sep)
- 2026-cycle3: 2026-09-01 → 2026-12-31 (4 months — review in late Dec / early Jan)

Coverage stays contiguous: cycle3-of-2026.end (2026-12-31) + 1 day =
cycle1-of-2027.start (2027-01-01).

**Tradeoff: alternate cadences are no longer guaranteed-uniform.** Phase
1 success criterion 4 ("`[6, 12]` semi-annual yields a 6-month cadence")
is implicitly softened — under Option B, `[6, 12]` produces a 5mo + 7mo
split (cycle1 = Jan-May, cycle2 = Jun-Dec). The user explicitly accepted
this when choosing Option B over Option A on 2026-05-08. Uniformity now
requires evenly-spaced review months whose last entry is 12 — and even
that does not always yield uniform cycles (`[4, 8, 12]` becomes 3/4/5
under Option B). The helper still computes correct, contiguous cycle
boundaries for any sorted input; uniformity is the user's responsibility
to encode in their cycleEndMonths choice. For Liferay's `[5, 9, 12]`
the fix yields uniform 4-month cycles, which is the design target.

Naming year stays "calendar year of the cycle's end-date" — under Option
B this equals `reviewYear` for every cycle (since cycles never span a
year boundary), so the rule is unambiguous.

Implementation: see `src/core/cycles.js` (Phase 3 wave 1 rewrite of
`cycleAt` and `resolveCycle`) and `test/cycles.test.js` for the
Option B oracle matrix.

Historic D-03 and D-04 above are PRESERVED for the diff context — do
NOT delete them. Treat them as "what shipped originally"; this
corrigendum block as "what is true after Phase 3 wave 1".
