---
phase: 03-self-review-report
plan: 05
subsystem: self-review
tags: [orchestrator, command, cli-wiring, slice-1]
dependency_graph:
  requires:
    - "src/core/reviews.js#resolveReviewWindow (plan 03-04)"
    - "src/core/reviews.js#loadPriorCycleReview (plan 03-04)"
    - "src/core/reviews.js#loadInCycleTopicPages (plan 03-04)"
    - "src/core/reviews.js#buildSelfReviewPrompt (plan 03-04)"
    - "src/core/reviews.js#SELF_REVIEW_PROMPT_PATH (plan 03-04)"
    - "src/core/config.js#writeVaultConfig (Phase 1; deep-merges review sub-object)"
    - "src/core/claude.js#hasClaudeCli + claudeHeadless (existing)"
    - "src/utils/format.js#monthsInRange + weeksInMonth + datesInMonth (existing)"
    - "src/utils/paths.js#getReviewFilePath + getReportFilePath + ensureParentDir (existing)"
  provides:
    - "self-wiki self-review CLI subcommand (slice 1 end-to-end)"
    - "selfReviewOrchestrator export from src/core/reviews.js"
    - "selfReviewCommand export from src/commands/self-review.js"
    - "Bash(self-wiki self-review*) permissions rules"
  affects:
    - "src/cli.js (subcommand registry)"
    - "src/templates/permissions.json (skill/auto-mode permission surface)"
    - "vault config review.lastReviewedAt + review.lastReviewedCycle (writeback on success)"
tech_stack:
  added: []
  patterns:
    - "orchestrator + writer in the same module (CLAUDE.md mandate: only reviews.js writes Reviews/<*>.md)"
    - "soft-fail-to-dry-run on missing claude (divergent from report.js exit-2 behavior)"
    - "refuse-without-force gate (NEW pattern; report.js silently overwrites)"
    - "vault-config writeback on success (REVIEW-07 + D-02)"
key_files:
  created:
    - "src/commands/self-review.js (51 lines)"
    - "test/self-review.test.js (271 lines, 13 tests)"
  modified:
    - "src/core/reviews.js (+216 lines: imports + orchestrator + writer + 3 helpers)"
    - "src/cli.js (+13 lines: import + subcommand registration)"
    - "src/templates/permissions.json (+2 lines: allow rules)"
decisions:
  - "Reused existing private todayISO() helper rather than re-defining todayUTC() — same semantics; cleaner."
  - "Writer attached to selfReviewOrchestrator inside reviews.js (CLAUDE.md compliance)."
  - "Soft-fail-to-dry-run divergence from report.js documented inline so future readers understand the asymmetry."
metrics:
  duration: "~5 minutes (parallel-executor wall time)"
  completed_date: "2026-05-11"
  tasks_completed: 3
  files_touched: 5
  insertions: 554
  deletions: 4
requirements:
  completed: [REVIEW-01, REVIEW-03, REVIEW-04, REVIEW-06, REVIEW-07, REVIEW-08, REVIEW-09]
---

# Phase 03 Plan 05: Self-Review Slice-1 End-to-End Wire-Up Summary

## One-liner

Composes plan 03-04's four building blocks into a working `self-wiki self-review` command with refuse-without-force, soft-fail-to-dry-run, vault-config writeback, and a 13-test suite — slice 1 ships independently demoable.

## What changed

- **`src/core/reviews.js`** gains `selfReviewOrchestrator(opts)` plus three internal helpers (`resolveOutPath`, `weeksInRange`, `datesInRange`). The orchestrator composes `resolveReviewWindow` → in-cycle monthly/weekly/topic-page reads → `loadPriorCycleReview` → `buildSelfReviewPrompt` → write/skip/soft-fail branches → `writeVaultConfig`. The writer is intentionally co-located with the orchestrator in `reviews.js` because CLAUDE.md mandates that only this module may write to `<vault>/Reviews/<*>.md`. Imports extended: `writeFile`, `access`, `sep`, `readVaultConfig`, `writeVaultConfig`, `hasClaudeCli`, `claudeHeadless`, `getReportFilePath`, `ensureParentDir`, `monthsInRange`, `weeksInMonth`, `datesInMonth`.
- **`src/commands/self-review.js`** (new) — Commander action handler. Runs the standard preamble (`applyUserConfig` + `ensureVaultConfigured`), validates the `--since` / `--cycle` / `--last-cycle` mutex, validates `--since` against `^\d{4}-\d{2}-\d{2}$`, then delegates to `selfReviewOrchestrator`. Catches `invalid --cycle value` rejections from `resolveReviewWindow` and surfaces them as exit-1 usage errors.
- **`src/cli.js`** — new import line for `selfReviewCommand`; new subcommand block with the full slice-1 flag set (`--since`, `--cycle`, `--last-cycle`, `--prior-review`, `--dry-run`, `--force`, `-o, --out`).
- **`src/templates/permissions.json`** — two new allow rules (`Bash(self-wiki self-review)` and `Bash(self-wiki self-review *)`) so `self-wiki init` propagates them into `~/.claude/settings.json` and the wiki skill / auto-mode classifier doesn't block invocation.
- **`test/self-review.test.js`** (new) — 13 tests covering the slice-1 envelope, mutex validation, refuse-without-force, soft-fail-to-dry-run, prior-review override, and three structural grep guardrails over `src/core/reviews.js`.

## Slice boundary

Slice 1 ships:

- Bare invocation works (D-01 default cycle).
- `--cycle` / `--last-cycle` / `--since` / `--prior-review` flag handling works (resolveReviewWindow already covered this in plan 03-04).
- `--dry-run` prints the prompt envelope without invoking `claude -p`.
- `--force` / refuse-without-force on existing file works (D-03).
- `--out` mirrors monthly's pattern with the outside-vault stderr warning.
- Soft-fail to dry-run on missing `claude` CLI (REVIEW-08 + ROADMAP criterion 5) — **divergent** from report.js (which exits 2).
- Vault-config writeback on every successful generation (REVIEW-07 + D-02).

Slice 1 does NOT ship (deferred to plan 03-06):

- Auto-backfill of missing monthlies (D-05). Slice 1 surfaces missing monthlies as a `WINDOW_NOTE: Missing monthlies (...)` hint and continues; the cascade loop is plan 03-06's responsibility.
- Preflight stderr summary (D-05) — same.
- `--internal` flag plumbing on `reportMonthOrchestrator` — same.

## Divergence from report.js (intentional)

`reportMonthOrchestrator` exits 2 when `claude` is missing on PATH. `selfReviewOrchestrator` does **not** — it prints a stderr notice (`warn: `claude` CLI not found on PATH; printing prompt to stdout instead (dry-run mode).`) and falls through to the dry-run code path (exit 0). Rationale: review-time is high-friction; a user who runs `self-wiki self-review` at end-of-cycle wants the prompt either way, even if their `claude` binary is misconfigured. The prompt is the actionable artifact; they can pipe it manually. The asymmetry is documented inline in `reviews.js` and locked by the `Without --dry-run, missing claude soft-fails to dry-run with stderr notice` test.

## Requirements traceability

| Requirement | Implementation |
|-------------|----------------|
| REVIEW-01 | `selfReviewOrchestrator` produces a draft at `Reviews/<YYYY>-cycle<N>.md` |
| REVIEW-03 | Section 1 value-tag clauses — enforced by the prompt header (already in plan 03-04) and verified by the envelope test |
| REVIEW-04 | `cycleEndMonths` read from vault config in `selfReviewOrchestrator` (with `[5,9,12]` default) |
| REVIEW-06 | Orchestrator consumes monthlies (primary) + weeklies (secondary) + topic pages (ground truth); no raw daily logs |
| REVIEW-07 | `writeVaultConfig({ review: { lastReviewedAt, lastReviewedCycle } })` on every successful generation |
| REVIEW-08 | `--dry-run` strict + soft-fail-to-dry-run on missing claude |
| REVIEW-09 | `SOURCES_LINE` always emitted by `buildSelfReviewPrompt` (plan 03-04); orchestrator passes all required inputs |

## Decisions tracked from CONTEXT.md

| Decision ID | Implementation |
|-------------|----------------|
| D-01 | Bare invocation defaults to most-recently-ended of `{current, previous}` (in `resolveReviewWindow`, plan 03-04) |
| D-02 | `lastReviewedAt` + `lastReviewedCycle` written on every successful generation, including `--since` runs (off-boundary `--since` stores the enclosing cycle name per D-04) |
| D-03 | Refuse-without-force on existing file; `--force` prepends `<!-- regenerated YYYY-MM-DD -->` marker |
| D-07 | `--dry-run` never invokes `claude -p` — refuse-without-force gate is skipped under dry-run |
| D-13 | `--out` symmetry with monthly; outside-vault paths warn to stderr but don't block |

## Verification

- `node --test test/self-review.test.js` exits 0 — 13/13 pass.
- `node --test test/*.test.js` exits 0 — full suite 218/218 (was 205 baseline; +13 from this plan).
- `self-wiki self-review --help` lists all 7 flags.
- Smoke test against a scaffolded tmp vault: `self-wiki self-review --cycle 2026-cycle1 --dry-run` produces an envelope containing `CYCLE:`, `MONTHLIES:`, `## 1.`, `## 2.`, `## 3.` (confirmed).
- `grep -c "Bash(self-wiki self-review" src/templates/permissions.json` → 2.
- `grep -c "selfReviewOrchestrator" src/core/reviews.js` → 1 (definition); referenced 3× in `src/commands/self-review.js`.
- `cli.js` registers `self-review` subcommand.

## Deviations from Plan

None — plan executed exactly as written, with two minor judgment calls:

1. **Reused existing `todayISO()` private helper rather than re-defining `todayUTC()`.** The plan's `<action>` block defined a new `todayUTC()` function with identical semantics to the existing `todayISO()` (lines 41-43 of reviews.js post-plan-04). Re-using avoids duplication. No acceptance criterion required the `todayUTC` name. This is documented at the call site (just a normal function call; no inline comment needed since the helper is right above).

2. **`mutually exclusive` appears twice in `src/commands/self-review.js`** rather than the one match the acceptance criterion implied — once in the doc comment (`// mutually exclusive among themselves`) and once in the error message string. The comment is intentional documentation. The intent of the criterion (the error message is wired) is met; tests confirm via `assert.match(r.stderr, /mutually exclusive/)`.

## Authentication Gates

None — `claude -p` invocation is gated by `hasClaudeCli()` and the slice deliberately soft-fails when claude is missing.

## Known Stubs

None. The slice is intentionally read-only on missing monthlies (slice 2 will add backfill); this is documented in the prompt's `WINDOW_NOTE: Missing monthlies (...)` line, not stubbed.

## Threat Flags

No new threat surface beyond what `<threat_model>` in `03-05-PLAN.md` already documented. The five threats (T-03-05-01 through T-03-05-05) are all addressed:

- **T-03-05-01 (refuse-without-force gate)** — locked by the `refuse-without-force on existing Reviews/<cycle>.md (D-03)` test.
- **T-03-05-02 (--out outside vault)** — `resolveOutPath` warns to stderr; mirrors report.js behavior.
- **T-03-05-03 (claude subprocess hang)** — accepted; inherited from existing claude.js timeout layer (5 min default).
- **T-03-05-04 (permissions wildcard)** — `Bash(self-wiki self-review *)` matches arguments to this subcommand only; CLI validates `--since` / `--cycle` / `--prior-review` formats at the command layer.
- **T-03-05-05 (vault-config writeback)** — `writeVaultConfig` deep-merges only the `review` sub-object; cycleEndMonths and other fields survive (locked by Phase 1's `writeVaultConfig deep-merges review sub-object` test).

## Self-Check: PASSED

Verified after writing this SUMMARY:

- `src/commands/self-review.js` exists.
- `test/self-review.test.js` exists.
- `src/core/reviews.js` contains `selfReviewOrchestrator` export.
- Commits exist: `d16269e` (Task 1), `fbfcd14` (Task 2), `c62dd62` (Task 3).
- Full test suite green: 218/218.
