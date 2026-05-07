---
phase: 01-cycle-config-vault-scaffold
plan: 03
subsystem: vault-scaffold
tags:
  - scaffold
  - init
  - vault-dirs
  - reviews
requirements:
  - SCAFFOLD-01
dependency-graph:
  requires:
    - none (Wave 1 plan; no upstream Phase 1 plan dependencies)
  provides:
    - "ensureVaultDirs creates Reviews/ alongside Daily/Reports/Tickets/Components/.self-wiki for newly init'd vaults (D-09 first half)"
    - "On-disk vault config seed exposes the review block with Liferay defaults [5, 9, 12] (D-08 'discoverability' half)"
  affects:
    - src/utils/paths.js
    - src/commands/init.js
    - test/paths.test.js
    - src/templates/vault/.self-wiki/config.json
tech-stack:
  added: []
  patterns:
    - "mkdir(..., { recursive: true }) idempotent scaffold (already established; extended to Reviews/)"
    - "JSON seed copyFile'd verbatim into <vault>/.self-wiki/config.json on first init (already established; review block now included)"
key-files:
  created: []
  modified:
    - src/utils/paths.js
    - test/paths.test.js
    - src/commands/init.js
    - src/templates/vault/.self-wiki/config.json
decisions:
  - "Insert 'Reviews' between 'Reports' and 'Tickets' (not alphabetical) to keep the user-facing init log line readable as Daily → Reports → Reviews → Tickets → Components (source-of-truth → synthesis outputs → per-entity)"
  - "Include review block in the on-disk seed (per 01-PATTERNS.md recommendation) so the resolveCycle throw message — which directs users to edit <vault>/.self-wiki/config.json — points at a file with the key actually present"
  - "Did NOT add ensureReviewsDir / ensureVaultDirs alternate path here — Plan 01-04 owns the pre-existing-vault helper (D-09 second half)"
metrics:
  duration: ~6 minutes
  completed: 2026-05-07
---

# Phase 01 Plan 03: Reviews/ Scaffold + Seed Review Block — Summary

Add `Reviews/` to the vault scaffold and seed the on-disk `.self-wiki/config.json` template with the `review` block, matching `VAULT_DEFAULTS.review` from Plan 01-02.

## Tasks Executed

| Task | Name | Commit | Files | Lines Touched |
|------|------|--------|-------|---------------|
| 1a | Add 'Reviews' to ensureVaultDirs | `2028f33` | `src/utils/paths.js` | line 88 (one-line array literal change) |
| 1b | Update test/paths.test.js assertion | `2efb23c` | `test/paths.test.js` | lines 87–93 (test name + assertion-loop array) |
| 2  | Update init.js user-facing dir-list string | `2feda5b` | `src/commands/init.js` | line 33 (one-line log string) |
| 3  | Add review block to vault-config seed | `d3956cf` | `src/templates/vault/.self-wiki/config.json` | append (preserves existing 4 keys byte-identically; adds `review` block) |

## Behavior Delivered

1. `ensureVaultDirs` (in `src/utils/paths.js`) now iterates over `['Daily', 'Reports', 'Reviews', 'Tickets', 'Components', '.self-wiki']`. Newly init'd vaults gain a `Reviews/` directory alongside the existing five. Idempotent on re-run via the established `mkdir(..., { recursive: true })` pattern (no behavior change for vaults that already have `Reviews/`).
2. `self-wiki init <fresh-vault>` writes a `.self-wiki/config.json` seed containing `review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null }`. The existing four keys (`ticketRegex`, `branchTicketRegex`, `components`, `softCloseMinutes`) are preserved byte-identically.
3. The user-facing scaffold-list line at `init.js:33` now reads `vault folders ready (Daily/, Reports/, Reviews/, Tickets/, Components/)` — discoverable in the init output.
4. `test/paths.test.js`'s `ensureVaultDirs` test enumerates `Reviews` in the assertion loop and the test name.

## Seed / VAULT_DEFAULTS Equivalence Note

The seed `review` block at `src/templates/vault/.self-wiki/config.json` is structurally byte-equivalent to the `VAULT_DEFAULTS.review` value documented in CONTEXT.md (D-08) and to be added by Plan 01-02 in `src/core/config.js` `VAULT_DEFAULTS`:

```jsonc
"review": {
  "cycleEndMonths": [5, 9, 12],
  "lastReviewedAt": null,
  "lastReviewedCycle": null
}
```

**Caveat:** at the time this plan executed (Wave 1), `src/core/config.js:16-21` `VAULT_DEFAULTS` does NOT yet include the `review` key — that addition is owned by Plan 01-02 (also in Wave 1). Both plans use the same documented values from CONTEXT.md D-08 (`[5, 9, 12]` + two `null`s), so post-merge the seed and `VAULT_DEFAULTS.review` will be byte-equivalent. A drift-audit test is scoped to Plan 01-05 per 01-PATTERNS.md §"src/core/config.js" recommendation.

## Verification

| Gate | Result |
|------|--------|
| `grep -q "'Daily', 'Reports', 'Reviews', 'Tickets', 'Components', '.self-wiki'" src/utils/paths.js` | PASS |
| `grep -c "'Daily', 'Reports', 'Tickets', 'Components', '.self-wiki'" src/utils/paths.js` returns 0 (old array gone) | PASS |
| `git diff` on paths.js (Task 1a) shows exactly 2 changed content lines | PASS |
| `grep -q "ensureVaultDirs creates Daily/Reports/Reviews/Tickets/Components/.self-wiki" test/paths.test.js` | PASS |
| Old test name absent | PASS |
| `node --test test/paths.test.js` exits 0 (11 tests pass) | PASS |
| `grep -q "vault folders ready (Daily/, Reports/, Reviews/, Tickets/, Components/)" src/commands/init.js` | PASS |
| `ensureVaultDirs()` call count in `init.js` unchanged at 1 | PASS |
| No new imports in `init.js` | PASS |
| Seed parses as valid JSON | PASS |
| Seed contains `review` key, `[5, 9, 12]`, `lastReviewedAt: null`, `lastReviewedCycle: null` | PASS |
| Seed regex strings byte-identical to prior file | PASS |
| Plan-supplied smoke test (`node --input-type=module -e ...`) | PASS (`ok`) |
| `npm test` (full suite) | PASS (117/117) |

## Deviations from Plan

None - plan executed exactly as written. All four edits applied verbatim per the `<action>` blocks; all `<verify>` gates and `<acceptance_criteria>` passed; no auto-fixes (Rules 1–3) needed; no architectural questions (Rule 4) raised; no auth gates encountered.

## Threat Flags

None. The plan's `<threat_model>` covered the full surface (T-01-03-01 through T-01-03-04, all dispositioned as `mitigate` via existing idempotent-scaffold guarantees or `accept` for negligible/non-secret surface). No new network endpoints, auth paths, or trust-boundary changes introduced. The only new write is `mkdir Reviews/` (idempotent, hard-coded literal, no user input crossing the boundary) and one extra key in an already-written seed file.

## Self-Check: PASSED

- All four modified files verified to exist on disk.
- All four task commits verified present in `git log` (`2028f33`, `2efb23c`, `2feda5b`, `d3956cf`).
- Full test suite green (117/117) after the final commit.
