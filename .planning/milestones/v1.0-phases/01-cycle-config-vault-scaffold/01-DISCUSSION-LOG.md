# Phase 1: Cycle Config & Vault Scaffold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 1-cycle-config-vault-scaffold
**Areas discussed:** Cycle helper API shape, Cycle boundary semantics, Migration strategy for old vaults, Reviews/ scaffold ownership

---

## Cycle helper API shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single `resolveCycle(date, cfg)` | Default export returning `{current, previous}: {name, start, end}`. One call answers everything Phases 2/3 need. | ✓ |
| Multiple small exports | `currentCycle`, `previousCycle`, `cycleName`, `cycleBoundary`. Composable, but Phase 3 needs 2–3 calls. | |
| Object-shaped per success criterion 3 | Returns flat `{currentCycleStart, currentCycleEnd, previousCycle, currentCycleName}` to mirror ROADMAP wording. | |

**User's choice:** Single `resolveCycle(date, cfg)`.
**Notes:** Cycle-name format `<YYYY>-cycle<N>` confirmed. `N` is 1-indexed position in sorted `cycleEndMonths`.

---

## Cycle boundary semantics

Discussed in two parts: (a) coverage rule, (b) datatype/format and bad-input handling.

### Part A — coverage rule

| Option | Description | Selected |
|--------|-------------|----------|
| Contiguous: start = day after prior cycle's end | Every day in exactly one cycle. May review covers Jan–Apr (well: prior-end + 1 → end-of-month-before-cycleEndMonth). With `[5,9,12]` in 2026, cycle1 = Dec 1 2025 → Apr 30 2026 (5 months) so Dec is not lost. | ✓ |
| Strict 4-month look-back from end-of-cycle | Each cycle is exactly 4 months. With `[5,9,12]`: Aug appears in BOTH cycle2 and cycle3. Double-counted. | |
| Calendar-anchored: start = first day of prior end-month + 1 | May=Jan–Apr, Sept=Jun–Aug, Dec=Oct–Nov. Months 5/9/12 fall in a gap; only 9 months/year covered. | |

**User's choice:** Contiguous coverage.
**Notes:** User clarified end-of-cycle is the *month prior to* the cycleEndMonth: "the review cycle is throughout May, but it reviews the 4 months prior (Jan–Apr)". This corrected my initial off-by-one (where I'd had cycle1 ending May 31). Contiguous coverage was preferred over strict 4-month look-back to avoid double-counting and the calendar-anchored option's 3-month-per-year gap.

### Part B — datatype and bad input

| Question | Option | Description | Selected |
|----------|--------|-------------|----------|
| Date format | ISO date strings (YYYY-MM-DD), UTC math | Mirrors `src/utils/format.js#datesInWeek`. Phase 3 needs strings for filenames. | ✓ |
| Date format | Date objects | More flexible but every consumer formats. | |
| Date format | Both | Belt-and-suspenders; overkill. | |
| Bad input | Throw with clear message | Internal-contract violation; soft-fail rule applies to external CLIs only. | ✓ |
| Bad input | Sort + dedupe silently, throw on out-of-range | Permissive on order, strict on range. | |
| Bad input | Fall back to `[5, 9, 12]` defaults | Easy UX but masks config typos. | |

**User's choice:** ISO strings + throw on invalid input.
**Notes:** None.

---

## Migration strategy for old vaults

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy via `VAULT_DEFAULTS` — disk write deferred to Phase 3 | Add `review` block to `VAULT_DEFAULTS` only. `readVaultConfig()` already merges defaults. Disk write happens naturally when Phase 3's `self-review` stamps `lastReviewedAt`. Zero migration code. Matches REQUIREMENTS-CONFIG-01 wording exactly. | ✓ |
| Eager: write on next any-command bootstrap | `ensureVaultConfigured()` detects missing section and writes. Adds a write to the hot path. | |
| Eager via init re-run | `init` adds the section idempotently; user must re-run `init`. | |

**User's choice:** Lazy via `VAULT_DEFAULTS`.
**Notes:** None.

---

## Reviews/ scaffold ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Both: `init` creates forward + helper as Phase 3 safety net | `init` adds `Reviews/` to scaffold dirs (idempotent); new `src/core/reviews.js` exports `ensureReviewsDir(vaultPath)` for Phase 3. Belt-and-suspenders matches SCAFFOLD-01 + SCAFFOLD-02. | ✓ |
| `init` only | Just add `Reviews/` to `init`'s scaffold list; require old-vault users to re-run `init`. SCAFFOLD-02 becomes Phase 3's problem. | |
| Helper only | Skip `init` changes; Phase 3 mkdir-on-demand. Doesn't satisfy SCAFFOLD-01. | |

**User's choice:** Both.
**Notes:** New module `src/core/reviews.js` chosen over adding to `src/core/topics.js` because Reviews/ is a different artifact lifecycle (cycle-shaped, rarely regenerated) and Phase 3 will grow `reviews.js` further with the self-review writer.

---

## Claude's Discretion

- Exact wording of the throw message for invalid `cycleEndMonths` (D-06).
- Whether `resolveCycle` accepts both `Date` objects and ISO strings as the `date` parameter.
- Whether to also export named test helpers (e.g., `cycleNameFor(year, ordinal)`) alongside `resolveCycle`.

## Deferred Ideas

- `self-wiki cycle status` user-facing command — defer; v2 backlog candidate (adjacent to TREND-03 preview).
- Validating on-disk `lastReviewedCycle` against the calendar on read — defensive, defer until a regression bites.
- Year-rollover noted but handled by D-03; just call out that Phase 3 filenames use the cycle's *end* year (e.g., `2026-cycle1.md` even though it starts 2025-12-01).
