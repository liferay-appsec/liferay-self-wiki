---
phase: 01-cycle-config-vault-scaffold
plan: 04
subsystem: reviews-filesystem-owner
tags:
  - reviews
  - filesystem-owner
  - phase3-handoff
requires: []
provides:
  - "src/core/reviews.js#ensureReviewsDir"
  - "filesystem-ownership-claim:Reviews/"
affects:
  - "Phase 3 self-review writer (will consume ensureReviewsDir before any Reviews/<YYYY>-cycle<N>.md write)"
tech_stack:
  added: []
  patterns:
    - "single-concern core module under src/core/<area>.js"
    - "parameter-based filesystem helper (no module-level mutable state)"
    - "node --test + mkdtempSync per-test-file isolation (no XDG override needed when helper takes path as parameter)"
key_files:
  created:
    - "src/core/reviews.js"
    - "test/reviews.test.js"
  modified: []
decisions:
  - "Implemented D-10 exactly: ensureReviewsDir takes vaultPath as a parameter and does NOT depend on paths.js#getVaultPath() — keeps the helper testable and callable from any context Phase 3 needs."
  - "Top-of-file comment in src/core/reviews.js claims filesystem ownership of <vault>/Reviews/ for Phase 3, instructing downstream agents to extend reviews.js rather than topics.js or logger.js."
  - "Did NOT add 'Reviews' to ensureVaultDirs() in paths.js — that belongs to Plan 01-03. Plan 01-04 only seeds the new module + tests."
metrics:
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  duration_seconds: 157
  duration_human: "~2.5 min"
  test_count_added: 4
  total_test_suite: 121
  completed_at: "2026-05-07T21:42:57Z"
---

# Phase 1 Plan 04: Reviews Filesystem-Owner Stub — Summary

Seeds `src/core/reviews.js` as the canonical owner of the `<vault>/Reviews/`
filesystem region with a single idempotent helper, `ensureReviewsDir(vaultPath)`,
that Phase 3's self-review writer will call before producing any
`Reviews/<YYYY>-cycle<N>.md` file.

## What Was Built

### `src/core/reviews.js` (18 lines, 1 export)

- **Lines 1-11:** Top-of-file ownership comment. Documents D-10's parameter-based
  contract and asserts that no other module may write to `<vault>/Reviews/<*>.md`.
  Phase 3 must extend this module rather than `topics.js` or `logger.js`.
- **Lines 13-14:** Imports — only `fs/promises` (`mkdir`) and `path` (`join`).
  Deliberately does NOT import from `src/utils/paths.js`.
- **Lines 16-18:** `export async function ensureReviewsDir(vaultPath)` —
  one line of body: `await mkdir(join(vaultPath, 'Reviews'), { recursive: true })`.
  Idempotent by virtue of `recursive: true`.

### `test/reviews.test.js` (46 lines, 4 tests)

Four cases mirroring the analog `ensureVaultDirs` test in `test/paths.test.js`:

1. **`ensureReviewsDir creates Reviews/ in a fresh vault`** — `mkdtempSync` a
   tmp parent, pre-create the vault dir, call `ensureReviewsDir(vault)`, assert
   `vault/Reviews` exists and is a directory.
2. **`ensureReviewsDir succeeds when Reviews/ already exists (idempotent)`** —
   pre-create `vault/Reviews`, call the helper, assert no throw and the dir
   still exists.
3. **`ensureReviewsDir is safe on repeated calls (double invocation)`** — call
   the helper twice in a row, assert success.
4. **`ensureReviewsDir creates intermediate parents (recursive mkdir)`** — pass
   a deep path (`tmp/deep/nested/vault`) where the parent does NOT pre-exist;
   confirms `recursive: true` creates intermediates and validates D-10's intent
   that the helper works regardless of caller setup.

Fixture: a single `mkdtempSync` per test-file shared via `before`/`after`. Each
test scopes itself to a unique sub-path. **No XDG env-var mutation** — the
helper takes `vaultPath` as a parameter, so there is no module-level state to
override.

## Filesystem Ownership

The top-of-file comment in `src/core/reviews.js` is the project's canonical
record that:

- `src/core/reviews.js` is the sole sanctioned writer of `<vault>/Reviews/<*>.md`.
- Phase 3 grows this module with the self-review writer; it must NOT introduce
  Reviews/ writes via `topics.js` or `logger.js`.

This satisfies threat T-01-04-03 ("future writes to Reviews/<*>.md") with a
documented `mitigate` disposition — the rule lives in code, not just in the
plan.

## Verification

```text
$ node --test test/reviews.test.js
1..4
# tests 4
# pass 4
# fail 0

$ npm test
1..121
# tests 121
# pass 121
# fail 0
```

All four new tests pass; the full pre-existing suite stays green.

Static gates (per `<acceptance_criteria>`):

- `test -f src/core/reviews.js` — passes.
- `grep -q "export async function ensureReviewsDir" src/core/reviews.js` — passes.
- `grep -q "import { mkdir } from 'fs/promises'" src/core/reviews.js` — passes.
- No `from '../utils/paths'` import — passes.
- No actual `getVaultPath()` call (only a comment mention explaining why we
  deliberately do NOT call it) — passes after stripping comments.
- Single export — passes (`grep -cE "^export "` returns 1).
- 4 `test(...)` blocks in `test/reviews.test.js` — passes (`>= 4`).

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes triggered.
The `getVaultPath()` substring matches the AC5 grep, but only inside the
prescribed top-of-file comment that explains *why* the helper does NOT call it.
The plan's `<action>` block specifies that exact comment text, so no deviation.

## Authentication Gates

None.

## Known Stubs

`src/core/reviews.js` is itself a Phase-1 stub by design (D-10 + plan
`<objective>`): only `ensureReviewsDir` is exported now; Phase 3 will add the
self-review writer to this same module. The stub is intentional and documented
in the top-of-file comment — not a defect, not a gap that prevents the plan's
goal.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries beyond what
the plan's `<threat_model>` already enumerated. T-01-04-03 (mitigate via
ownership rule) is implemented as documented.

## Commits

- `00c9c2c` — `feat(01-04): seed src/core/reviews.js with ensureReviewsDir helper`
- `cbca3ae` — `test(01-04): cover ensureReviewsDir with four cases`

## Self-Check: PASSED

- `src/core/reviews.js`: FOUND
- `test/reviews.test.js`: FOUND
- Commit `00c9c2c`: FOUND
- Commit `cbca3ae`: FOUND
- `node --test test/reviews.test.js` exit 0: confirmed
- `npm test` exit 0 (121/121): confirmed
