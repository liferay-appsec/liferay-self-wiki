---
phase: 01-cycle-config-vault-scaffold
reviewed: 2026-05-07T00:00:00Z
depth: deep
files_reviewed: 10
files_reviewed_list:
  - src/core/cycles.js
  - test/cycles.test.js
  - src/core/config.js
  - test/config.test.js
  - src/core/reviews.js
  - test/reviews.test.js
  - src/utils/paths.js
  - src/commands/init.js
  - test/paths.test.js
  - src/templates/vault/.self-wiki/config.json
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-07
**Depth:** deep
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 01 introduces `resolveCycle` (pure UTC arithmetic), threads a `review`
block through `VAULT_DEFAULTS` with deep-merge semantics in `writeVaultConfig`,
adds an idempotent `ensureReviewsDir` helper, and wires `Reviews/` into the
vault scaffold. All new/modified tests pass locally — `cycles.test.js` 16/16,
`config.test.js` 11/11, `reviews.test.js` 4/4, `paths.test.js` 11/11.

Spot-checked correctness against the focus areas:

- **D-11 boundary cases** — cross-checked `resolveCycle` directly:
  - `Sep 1 [5,9,12]` → `cycle3` (D-04 advance fires for non-first entries) — correct
  - `May 31 [5,9,12]` → `cycle1` (cycle1 retention) — correct
  - `Jun 1 [5,9,12]` → `cycle2` — correct
  - `Dec 1 [12]` → `cycle1` (single-entry annual cadence; cycle1-retention dominates) — correct
  - `Jan 5 [5,9,12]` → previous wraps to prior-year `cycle3` — correct
- **D-06 throw message** — `src/core/cycles.js:10` and the assertion in
  `test/cycles.test.js:134` both contain the locked text with U+2013 EN DASH;
  byte-decoded match confirmed.
- **`getVaultDefaults` deep-clone** — `structuredClone(VAULT_DEFAULTS)`; nested
  `review.cycleEndMonths` and `components` are independently mutable
  (covered by `test/config.test.js:144` and the existing
  `getVaultDefaults returns a fresh clone each call` test).
- **`writeVaultConfig` deep-merge** — mirrors `writeUserConfig.jira` precedent;
  partial `patch.review` preserves siblings (covered by
  `test/config.test.js:124`).
- **`ensureReviewsDir` idempotency** — `mkdirSync(..., { recursive: true })`
  via the async `mkdir` from `fs/promises`; idempotent and correct.
- **CLAUDE.md compliance** — no `obsidian-cli`, no pid liveness, no
  model-side arithmetic, ESM-only imports, soft-fail rule untouched.
- **`package.json`** — already pins `engines.node: ">=20.0.0"`, so the
  `structuredClone` (Node 17+) call is safe.

The remaining issues are quality / hardening only; nothing blocks Phase 02
dependents (`report`, `ensure-current-review`).

## Warnings

### WR-01: `ensureReviewsDir` does not validate `vaultPath` and surfaces raw fs errors

**File:** `src/core/reviews.js:16-18`
**Issue:** The helper accepts `vaultPath` from callers and joins the static
literal `'Reviews'` onto it. Phase 01's threat model (Focus area #6) flags path
traversal as the primary surface. Today the only caller is `init.js`, which
controls the path, and `path.join(vaultPath, 'Reviews')` is not itself a
traversal hazard — but:

1. There is no documented contract that `vaultPath` must be a trusted /
   caller-owned path. A future caller (e.g. a CLI subcommand that accepts
   `--vault <path>` from a user) could pass a user-supplied path with no
   further check, and `ensureReviewsDir` will happily `mkdir -p` anywhere it
   has write access. The top-of-file ownership comment talks about *who*
   writes Reviews but says nothing about the trust shape of the input.
2. `mkdir` errors are not handled. On `EACCES`, `EROFS`, or `ENOTDIR` (e.g.
   `vaultPath` is a regular file or a symlink to one), the bare throw bubbles
   the raw `Error: ENOTDIR…` up through `init.js`, with no actionable hint.
   The codebase elsewhere (`paths.js#getVaultPath`) returns user-friendly
   error text — this helper should match.

**Fix:** Document the trust boundary on the helper and wrap fs errors:

```js
import { mkdir } from 'fs/promises';
import path from 'node:path';

/**
 * Ensure <vaultPath>/Reviews/ exists. Idempotent.
 *
 * Trust contract: vaultPath MUST be a caller-owned, absolute vault root.
 * The helper does not resolve symlinks or sandbox the join — it joins the
 * static literal `Reviews` onto the input. Callers that accept user-supplied
 * paths must validate before invoking.
 */
export async function ensureReviewsDir(vaultPath) {
  if (typeof vaultPath !== 'string' || vaultPath.length === 0) {
    throw new Error('ensureReviewsDir: vaultPath must be a non-empty string');
  }
  const dir = path.join(vaultPath, 'Reviews');
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    throw new Error(`ensureReviewsDir: failed to create ${dir}: ${err.message}`);
  }
}
```

### WR-02: `cycleEndMonths` is not validated when written to or read from disk

**File:** `src/core/config.js:54-64` (`writeVaultConfig`) and `src/core/config.js:45-52` (`readVaultConfig`)
**Issue:** `resolveCycle` validates `cycleEndMonths` *at call time* and throws
the locked D-06 message on bad input. But `readVaultConfig` returns whatever
JSON was on disk after a shallow merge with defaults. If a user hand-edits
`<vault>/.self-wiki/config.json` and writes `"cycleEndMonths": [13]` (range
violation), `[5, 5, 9]` (duplicate), `[12, 5]` (unsorted), or `"5,9,12"` (string),
the bad value sits in memory until the first `resolveCycle` call from Phase 02's
`report` command — which throws with the D-06 message rather than at config-load
time.

This is acceptable defense-in-depth (the throw is correct, sourced, and locked),
but it means a bad vault config breaks `report` rather than `init` / `config set`.
Given Phase 02 is about to wire `resolveCycle` into the report path, surfacing
the validation earlier (or at `writeVaultConfig` time, when `patch.review.cycleEndMonths`
is being merged) would catch typos at the moment they enter the system.

The threat model in `01-02-PLAN.md` acknowledges this as T-01-02-03 and
defers to Phase 3 surface-printing — that is consistent, but a 4-line
preflight in `writeVaultConfig` would be cheap and would protect Phase 2
from the same surprise.

**Fix:** Extract the validator from `cycles.js` and call it from
`writeVaultConfig` whenever `patch.review?.cycleEndMonths` is being merged.
Reuse the shared validator so the locked D-06 message stays in lockstep:

```js
// in src/core/cycles.js — export the validator
export function assertValidCycleEndMonths(arr) {
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(INVALID_MONTHS_MSG);
  let prev = 0;
  for (const v of arr) {
    if (!Number.isInteger(v) || v <= 0 || v > 12 || v <= prev) {
      throw new Error(INVALID_MONTHS_MSG);
    }
    prev = v;
  }
}

// in src/core/config.js writeVaultConfig — preflight before merge
if (patch.review?.cycleEndMonths !== undefined) {
  assertValidCycleEndMonths(patch.review.cycleEndMonths);
}
```

This also covers the case where an invalid array survives a partial write
because the merge happens before validation.

## Info

### IN-01: `resolveCycle` accepts `Date` instances but produces opaque errors on `null` / `undefined` / NaN-Date inputs

**File:** `src/core/cycles.js:23-27`
**Issue:** `normalizeDateUTC` calls `d.getUTCFullYear()` after `new Date(date)`.
If a caller passes `null`, the constructor produces `1970-01-01T00:00:00Z`
(silent zero-fallback) and `resolveCycle` returns a 1969-cycle window — wrong
but with no error. If a caller passes `'not a date'`, `new Date(...)` produces
an invalid Date and `getUTCFullYear()` returns `NaN`, which propagates into
the output as `"NaN-cycle1"`. Neither matches the loud-throw spirit of the
D-06 validator that the rest of the function uses.

**Fix:** Optional preflight at the top of `resolveCycle`:

```js
const d = date instanceof Date ? date : new Date(date);
if (Number.isNaN(d.getTime())) {
  throw new Error('resolveCycle: date must be a valid Date or ISO-8601 string');
}
```

### IN-02: Magic strings `'Reviews'`, `'Daily'`, `'Tickets'`, `'Components'` duplicated across files

**File:** `src/utils/paths.js:88` and `src/core/reviews.js:17` (and `src/commands/init.js:33` for the user-facing log line).
**Issue:** The literal `'Reviews'` appears in three places; the same shape is
true for `'Daily'`, `'Tickets'`, etc. If any vault subdir ever renames, all
three files must change in lockstep — and `init.js` is the easy one to forget
(it is a user-facing string that does not break a test if it goes stale).

**Fix:** Centralize as named exports from `paths.js`:

```js
// src/utils/paths.js
export const VAULT_SUBDIRS = Object.freeze({
  DAILY: 'Daily',
  REPORTS: 'Reports',
  REVIEWS: 'Reviews',
  TICKETS: 'Tickets',
  COMPONENTS: 'Components',
  SELF_WIKI: '.self-wiki',
});
```

Then `reviews.js` imports `VAULT_SUBDIRS.REVIEWS` and `init.js` derives the
user-string from the same constant. Out of phase scope; flag for the next
time someone touches the scaffold list.

### IN-03: Defensive comment recommended near the U+2013 assertion

**File:** `test/cycles.test.js:129-136`
**Issue:** The assertion at line 134 uses U+2013 EN DASH and the test name at
line 129 uses U+2013 too; both are correct. There is a real risk a future
contributor copies the test name (which embeds the en dash) into a regex
assertion and either an editor / linter / git hook normalizes the dash to
ASCII U+002D HYPHEN-MINUS — silently breaking the test or, worse, the
production throw message. The Phase 1 SUMMARY explicitly calls this out as
a downstream invariant for Phase 3 docs, but the source file does not.

**Fix:** Add a one-line comment near the regex literal — no behavior change:

```js
// NOTE: U+2013 EN DASH below is the locked D-06 wire format; do NOT
// normalize to ASCII '-' (HYPHEN-MINUS) — Phase 3 docs grep this exact
// byte sequence.
assert.throws(
  () => resolveCycle(new Date(), []),
  /cycleEndMonths must be a non-empty sorted array of integers 1–12/,
);
```

---

_Reviewed: 2026-05-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
