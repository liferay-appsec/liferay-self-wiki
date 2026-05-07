---
phase: 01-cycle-config-vault-scaffold
plan: 02
subsystem: vault-config
tags:
  - vault-config
  - schema-extension
  - deep-merge
  - structuredClone
  - lazy-migration
requirements:
  - CONFIG-01
  - CONFIG-02
dependency_graph:
  requires:
    - "Node 20+ (structuredClone global, per .planning/codebase/STACK.md)"
    - "Existing VAULT_DEFAULTS shallow-merge in readVaultConfig (D-07 lazy-migration substrate)"
  provides:
    - "vault config `review` block with Liferay defaults (cycleEndMonths: [5,9,12], lastReviewedAt: null, lastReviewedCycle: null) — Phase-2 monthly + Phase-3 self-review consume this"
    - "writeVaultConfig deep-merge for `patch.review` — Phase-3 can stamp lastReviewedAt without clobbering cycleEndMonths"
    - "getVaultDefaults deep-clone semantics — defaults are safe to mutate without polluting subsequent reads"
  affects:
    - "src/core/config.js (VAULT_DEFAULTS, writeVaultConfig, getVaultDefaults)"
    - "test/config.test.js (+4 tests)"
tech_stack:
  added: []
  patterns:
    - "structuredClone replaces shallow `{ ...VAULT_DEFAULTS }` for nested-object safety"
    - "Mirror writeUserConfig's `if (patch.jira)` deep-merge precedent for review key"
key_files:
  created: []
  modified:
    - src/core/config.js
    - test/config.test.js
decisions:
  - "Keep readVaultConfig untouched: its shallow-spread `{ ...VAULT_DEFAULTS, ...JSON.parse(raw) }` is what makes D-07 lazy migration transparent for pre-existing vaults — replacing it with a deep-merge would override user-set on-disk review blocks (T-01-02-02 accept disposition)."
  - "Deep-clone via structuredClone in getVaultDefaults (not just JSON.parse(JSON.stringify(...))) — Node 20+ native, no import, handles nested arrays + future Date/Map values correctly."
  - "writeVaultConfig deep-merge added in Phase 1, not deferred to Phase 3 — 3-line addition mirroring the proven writeUserConfig + jira pattern; closes the Phase-3 ambush window before it opens."
metrics:
  duration_seconds: 175
  tasks_completed: 2
  files_modified: 2
  files_created: 0
  tests_added: 4
  tests_passing_before: 117
  tests_passing_after: 121
  completed: 2026-05-07
---

# Phase 01 Plan 02: Extend vault config with review block + harden getVaultDefaults — Summary

JWT-style schema extension for vault config: add `review` block with Liferay's default cycle calendar, deep-merge it on partial writes, and replace the shallow-spread defaults with a structuredClone — closing a latent shared-reference bug as a free side effect.

## What Changed

### `src/core/config.js` (3 surgical edits)

| Edit | Location | Change | Purpose |
|------|----------|--------|---------|
| A | `VAULT_DEFAULTS` (line 16-22) | Append `review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null }` as fifth top-level key | Seed Liferay's quarterly review cadence (D-08); shallow-merge in `readVaultConfig` makes pre-existing vaults see this for free (D-07) |
| B | `writeVaultConfig` (line 54-64) | Add `if (patch.review) { next.review = { ...current.review, ...patch.review }; }` after the spread | Pre-empt Phase-3 ambush: a `{ review: { lastReviewedAt: ... } }` patch must preserve sibling `cycleEndMonths`. Mirrors writeUserConfig's `if (patch.jira)` precedent exactly |
| C | `getVaultDefaults` (line 79-81) | Replace `return { ...VAULT_DEFAULTS };` with `return structuredClone(VAULT_DEFAULTS);` | Defaults are now nested (`review.cycleEndMonths` is an array). Shallow spread shared the array reference — a single mutation by any caller would pollute subsequent reads. structuredClone fixes this and incidentally lifts the latent same-class bug on `components: []` |

Total diff: 5 insertions, 1 deletion across one file.

### `test/config.test.js` (+4 tests, no removals)

Appended after the existing `getVaultDefaults returns a fresh clone each call` test (the prior file ending). All four new tests reuse the existing `before/after` XDG-isolated fixture.

| # | Test | Asserts |
|---|------|---------|
| 1 | `readVaultConfig defaults expose the review block (D-08)` | `review.cycleEndMonths === [5,9,12]`, `lastReviewedAt === null`, `lastReviewedCycle === null` on a missing config file |
| 2 | `readVaultConfig lazy-migrates a legacy on-disk config without a review key (D-07)` | A hand-written 4-key legacy file on disk yields a full review block on read; legacy `components` and `softCloseMinutes` values survive |
| 3 | `writeVaultConfig deep-merges review sub-object (Phase-3 ambush prevention)` | A `{ review: { lastReviewedAt, lastReviewedCycle } }` patch preserves default `cycleEndMonths`; a subsequent `{ review: { cycleEndMonths } }` patch preserves the previously-stamped `lastReviewedAt` |
| 4 | `getVaultDefaults includes review and returns a fresh clone each call` | Two consecutive calls return objects with reference-distinct `review` sub-objects; mutating one's `cycleEndMonths` array does not leak to the other |

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Inline smoke test (Task 1 `<verify>`) | `node -e 'import("./src/core/config.js")...'` | Exit 0 |
| Plan-scoped tests | `node --test test/config.test.js` | 11 pass / 0 fail |
| Whole suite | `npm test` | 121 pass / 0 fail (was 117 / 0 before this plan; +4 new tests) |
| Acceptance grep — review default literal | `grep -c "review: { cycleEndMonths: \[5, 9, 12\], ..." src/core/config.js` | 1 |
| Acceptance grep — `if (patch.review)` | `grep -c "if (patch.review)" src/core/config.js` | 1 |
| Acceptance grep — review deep-merge body | `grep -c "next.review = { ...current.review, ...patch.review }" src/core/config.js` | 1 |
| Acceptance grep — structuredClone | `grep -c "return structuredClone(VAULT_DEFAULTS);" src/core/config.js` | 1 |
| Acceptance grep — no test removals | `git diff test/config.test.js \| grep -E "^-[^-]" \| wc -l` | 0 |

## Deviations from Plan

None — plan executed exactly as written. No Rules 1-3 auto-fixes triggered. The plan's `<acceptance_criteria>` includes a grep gate `grep -c "return { ...VAULT_DEFAULTS };" src/core/config.js` returning 0, but that pattern over-broadly matches `readVaultConfig`'s catch-block return at line 50, which the plan explicitly forbids changing ("DO NOT touch readVaultConfig"). The substantive intent — the old shallow spread is gone from `getVaultDefaults` — is satisfied (line 79-81 now uses `structuredClone`). The grep-gate text is a heuristic, not load-bearing; the plan's explicit `<behavior>` instruction wins. Smoke test and behavioral acceptance pass.

## Notes for Phase 3

- **`readVaultConfig`'s shallow-spread was deliberately not changed.** A user who hand-edits the on-disk config to set `review: { cycleEndMonths: [6, 12] }` will see that value override defaults wholesale (no merge of sub-keys from `VAULT_DEFAULTS.review`). This is intentional — the user's persisted value should win at read time. Phase 3 only writes through `writeVaultConfig`, which now correctly deep-merges, so siblings are preserved across partial patches. (See threat T-01-02-02 disposition: accept.)
- **`getVaultDefaults` deep-clone change also lifts a latent `components: []` shared-reference bug.** Pre-Phase-1 callers couldn't observe it (none mutated the returned `components` array), but adding the nested `review` made the bug class observable. No behavioral change for current callers, only stronger safety for new ones. Documented in threat T-01-02-05 disposition: mitigate.
- **Cycle helper substrate is in place.** `(await readVaultConfig()).review.cycleEndMonths` is now always present (default `[5, 9, 12]`); Plan 01-01's `resolveCycle(date, cycleEndMonths)` consumes this directly. Plan 01-03's `Reviews/` scaffold writes through `writeVaultConfig({ review: { lastReviewedAt: ... } })`, which is exactly the deep-merge path covered by test #3.

## Commits

| Task | Type | Hash | Files | Tests |
|------|------|------|-------|-------|
| 1: Extend VAULT_DEFAULTS, deep-merge review, structuredClone | feat | `25b2225` | src/core/config.js | smoke test (inline `node -e`) |
| 2: Add 4 tests covering defaults / migration / deep-merge / clone | test | `6146bce` | test/config.test.js | 11/11 file pass, 121/121 suite pass |

## Self-Check: PASSED

- src/core/config.js: review block at line 21, deep-merge at lines 57-59, structuredClone at line 80 — present
- test/config.test.js: all 4 new test names grep-confirmed
- Commit `25b2225` (feat 01-02 config schema): present in `git log`
- Commit `6146bce` (test 01-02 review coverage): present in `git log`
- `npm test`: 121/121 pass

