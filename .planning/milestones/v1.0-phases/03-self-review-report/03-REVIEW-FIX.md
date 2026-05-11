---
phase: 03-self-review-report
fixed_at: 2026-05-11T00:00:00Z
review_path: .planning/phases/03-self-review-report/03-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-05-11T00:00:00Z
**Source review:** `.planning/phases/03-self-review-report/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 critical + 6 warnings; Info skipped per `fix_scope: critical_warning`)
- Fixed: 7
- Skipped: 0
- Full test suite (`node --test test/*.test.js`): 240 / 240 passing after all fixes

## Fixed Issues

### WR-03: `--dry-run` has filesystem side effects (creates `Reviews/` directory)

**Files modified:** `src/core/reviews.js`
**Commit:** `5f4b43b`
**Applied fix:** Hoisted `ensureReviewsDir(getVaultPath())` from before the dry-run gate into the `if (!opts.dryRun)` block. `--dry-run` now leaves the filesystem untouched on a fresh vault; `ensureParentDir(outPath)` at the actual write site (step 13) still creates `Reviews/` on the real-write path. No test changes needed — the existing dry-run-does-not-write-file assertion now also implicitly covers dry-run-does-not-create-directory.

### CR-01 + WR-01: TOCTOU race in refuse-without-force + no cross-process mutex

**Files modified:** `src/core/reviews.js`
**Commit:** `249bff6`
**Applied fix:** Combined into a single coherent commit because the two findings share fix space (concurrent-writer protection on `Reviews/<cycle>.md`).

For CR-01 (atomic refuse-without-force): the `writeFile` at step 13 now uses `{ flag: opts.force ? 'w' : 'wx', encoding: 'utf8' }`. Without `--force`, `'wx'` (O_EXCL) makes EEXIST surface as the refuse signal even if the file appears between the early `access()` check and the write (concurrent run, `cp`, `git restore`). The early `access()` check at step 3 is preserved as a fast-path UX guard so a non-force run is refused BEFORE the multi-minute cascade burns claude calls. The `--force` path still uses `'w'` and prepends the regenerated marker.

For WR-01 (cross-process mutex): a dot-lock at `<vault>/.self-wiki/self-review-<cycleName>.lock` is acquired via `open(path, 'wx')` AFTER refuse-without-force succeeds (so a refused run does not leave a lock file behind, since `process.exit` skips `finally`). The lock is released in a `finally` block around the orchestrator body, plus an explicit cleanup before the EEXIST `process.exit` inside the write-race branch. Vanilla stdlib only — no `proper-lockfile` dependency per the task note's "use stdlib primitives where reasonable". Stale-lock recovery is manual; the stderr collision message tells the user where the lock file lives.

**Logic-bug note:** CR-01 + WR-01 introduce new control flow (try/finally + early-vs-atomic check coordination) but every introduced branch is a deterministic test (EEXIST / lockHandle truthy / dryRun gate). No new conditional logic that depends on undocumented semantics. Existing tests covering refuse-without-force, soft-fail-to-dry-run, and the dry-run path all pass unchanged.

### WR-02: `resolveCycle` does not validate its `date` argument

**Files modified:** `src/core/cycles.js`
**Commit:** `8ce967b`
**Applied fix:** Added an Invalid-Date guard at the top of `normalizeDateUTC`: `if (Number.isNaN(d.getTime())) throw new Error('resolveCycle: invalid date input: ${date}')`. Throw message intentionally differs from `INVALID_MONTHS_MSG` so the en-dash regex test in `test/cycles.test.js:183-188` continues to pass. No other call sites changed — `parseCycleName` already had its own probe-validity guard.

### WR-04: Cascade does not backfill missing weeklies inside already-present months

**Files modified:** `src/core/reviews.js`
**Commit:** `cfb8f8e`
**Applied fix:** Extended the `WINDOW_NOTE` builder to enumerate missing in-cycle weeklies alongside missing monthlies. The variable name `missingMonthlyNote` is preserved because that is the parameter name on `buildSelfReviewPrompt`. Same fix applied to the soft-fail-to-dry-run path (step 4b) so the no-claude printout carries the gap signal too. The existing "Missing monthlies" / "would be backfilled in non-dry-run" wording is preserved verbatim so structural test assertions still match.

Chose path (b) from the reviewer's two options (extend the WINDOW_NOTE) over path (a) (document the gap) because it does not change any test expectation — the user-facing behavior expansion is purely additive (a new sentence in WINDOW_NOTE when weeklies are missing).

### WR-05: `selfReviewCommand` mutex filter treats `''` and `false` as set

**Files modified:** `src/commands/self-review.js`
**Commit:** `f80d3c1`
**Applied fix:** Replaced the permissive `v !== undefined && v !== null && v !== false` filter with an explicit truthiness check matching the documented contract: `typeof opts.since === 'string' && opts.since.length > 0` for `--since`/`--cycle`, `opts.lastCycle === true` for `--last-cycle`. Existing mutex tests at `test/self-review.test.js:120-130` still pass.

### WR-06: `--out` equal to vault root resolves silently and fails downstream with EISDIR

**Files modified:** `src/core/reviews.js`, `src/commands/report.js`
**Commit:** `675a574`
**Applied fix:** Both `resolveOutPath` helpers (in `src/core/reviews.js` and `src/commands/report.js`) now explicitly reject the case where the resolved path equals the vault root (`resolved === vaultRoot`), printing `error: --out cannot be the vault root: <path>` to stderr and exiting 1 before the `startsWith(vaultPrefix)` warning path. Existing "outside the vault" warning behavior is preserved for paths outside the vault — the new check is strictly additive. The existing test at `test/self-review.test.js:551-560` (`--out` to a path outside the vault) still passes; no test exercised the vault-root sub-case before.

## Skipped Issues

None — all 7 in-scope findings (CR-01, WR-01, WR-02, WR-03, WR-04, WR-05, WR-06) were fixed.

---

_Fixed: 2026-05-11T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
