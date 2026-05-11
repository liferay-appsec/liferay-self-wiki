# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Self-Review Report

**Shipped:** 2026-05-11
**Phases:** 3 | **Plans:** 15 | **Commits:** 129 | **Timeline:** 14 days (2026-04-27 → 2026-05-11)

### What Was Built

- `self-wiki self-review` — Liferay-form-shaped quarterly draft generator with 3-question sections, value-tagged accomplishments, and a `## Sources` provenance footer. End-to-end flag matrix (`--cycle`, `--last-cycle`, `--since`, `--prior-review`, `--dry-run`, `--force`, `--out`), refuse-without-force semantics, soft-fail-to-dry-run on missing `claude`, vault-config writeback of `lastReviewedAt` + `lastReviewedCycle`.
- `self-wiki report --month [YYYY-MM]` — themed monthly synthesis as the primary input to self-review. Shape-parametrized `buildMetrics` lifted into `src/core/metrics.js` so monthly and weekly share the same primitives byte-for-byte.
- Pure-UTC cycle calendar — `resolveCycle(date, cycleEndMonths)` supports any cadence with year-boundary safety. Phase 3 D-PREREQ rewrote Option A → Option B (cycle1=Jan 1; last cycle=Dec 31) to restore uniform 4-month cycles for Liferay's `[5,9,12]`.
- Auto-backfill cascade — single hoisted `hasClaudeCli` preflight guards a two-level cascade (self-review → missing monthlies → missing weeklies). Stderr "Monthlies needed:" summary keeps the cascade debuggable; dry-run never backfills.

### What Worked

- **Wave-based parallelization with disjoint file-modified sets.** Phase 3 plans 03-02 and 03-03 ran in parallel; Plan 03-01 (the D-PREREQ cycles.js fix) was kept solo to avoid touching `cycles.js` from two waves at once. Zero merge conflicts in the milestone.
- **Versioned prompts at `src/templates/prompts/<name>.md`.** Iterating the self-review prompt structurally (3 questions, 5 values inlined, Sources block, untrusted-data invariant) without touching code held up under structural-guard tests.
- **Deterministic-vs-model split.** Counts and dates computed in code; only prose goes through `claude -p`. The 240-test suite ran fast and deterministically because no test path invokes the model.
- **Surrogate-vault acceptance + real-vault human UAT split.** Phase 3 closed under auto-mode using a hermetic `/tmp` vault for structural guarantees, then the user verified 3 paste-readiness questions against the real Obsidian vault. The surrogate caught every structural defect; the human pass caught the model-compliance dimension a hermetic test couldn't.

### What Was Inefficient

- **Phase 1 cycle boundary defect surfaced in Phase 3.** `resolveCycle` chained cycle1 across the year boundary, producing 5/4/3-month splits for `[5,9,12]`. Caught only when Plan 03-02 started consuming it. Added a Wave-1 D-PREREQ to Phase 3 plus corrigendum docs in PROJECT.md and `01-CONTEXT.md`. Lesson: even pure-UTC arithmetic helpers need their oracle matrix exercised on the *consuming* phase's window math before being declared shipped.
- **REVIEW.md flagged 1 BLOCKER + 6 warnings post-execution.** TOCTOU race on refuse-without-force, mutex-predicate over-permissiveness, dry-run filesystem side-effect, missing weekly-cascade inside present monthlies, etc. All real items. Three WR-* fixups landed before close (WR-04/05/06); the remainder were retroactively reasoned about as single-user-acceptable. Code review at *plan* boundaries (not phase boundaries) would have caught these earlier.
- **Multiple summary one-liners came back blank.** `summary-extract` produced empty/odd output for 5/15 SUMMARY.md files — the milestone-archive accomplishments list pulled by `milestone.complete` was a wall of plan-level detail, not a milestone-level summary. Had to rewrite MILESTONES.md by hand.

### Patterns Established

- **D-PREREQ first.** When a downstream phase discovers a defect in an upstream phase's locked artifact, codify the fix as Wave-1 D-PREREQ in the current phase rather than retrofitting the upstream phase. Keeps the upstream's "shipped" claim honest in the retrospective and concentrates the corrigendum surface.
- **Hoisted preflight gates.** When a cascade has soft-fail semantics (`hasClaudeCli`), gate it once at the top of the orchestrator instead of inside every call site. Lets dry-run be a pure printf path and keeps the soft-fail boundary co-located with the cascade origin.
- **Structural prompt-shape guards.** Prompt templates are model inputs but their contracts (3 questions present, 5 values inlined, Sources block emitted) are testable as strings. Locking them with structural tests catches accidental template drift without needing live `claude` calls.

### Key Lessons

1. **Verify upstream invariants on the *consuming* phase, not the *producing* phase.** Phase 1's tests proved `resolveCycle` was internally consistent; Phase 3 proved it was *wrong* against Liferay's actual calendar. Both can be true. Acceptance gates should include the consuming-phase use-case.
2. **`commit_docs=false` projects still want milestones/ committed.** The default rule "everything GSD generates stays local" needs a carve-out for the milestone archive — that's the persistent record. Either the gitignore should whitelist `milestones/`, or `milestone.complete` should `git add -f` the archive files. Currently a manual step.
3. **Run code review per-plan, not per-phase.** Retroactive code review (`/gsd-code-review` after execution) is too coarse — by the time CR-01 surfaced, four downstream plans were already written against the same flawed pattern. Plan-level review would have killed the TOCTOU at first sight.

### Cost Observations

- Model mix: Predominantly Opus 4.6/4.7 (planner + executor + verifier), Haiku for `summary-extract`-style structured extracts.
- Sessions: ~60 self-wiki sessions across the milestone (per Daily/ log inspection — exact count rebuildable via `self-wiki rebuild-topics`).
- Notable: The wave-based parallelization made the longest-running phase (Phase 3, 7 plans) finish in ~3 days. Single-threaded plan-by-plan execution would have taken ~7.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 15 | Initial GSD adoption; established wave-parallel plans, structural prompt-shape guards, hoisted preflight gates, D-PREREQ pattern. |

### Cumulative Quality

| Milestone | Tests | LOC (src/test) | Zero-Dep Additions |
|-----------|-------|----------------|--------------------|
| v1.0 | 240 | 4,128 / 3,757 | All — Node stdlib + Commander only |

### Top Lessons (Verified Across Milestones)

1. _(verified once at v1.0)_ Verify upstream invariants on the *consuming* phase, not the *producing* phase.
2. _(verified once at v1.0)_ Run code review per-plan, not per-phase.
3. _(verified once at v1.0)_ `commit_docs=false` needs a milestone-archive carve-out.
