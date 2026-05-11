---
phase: 03-self-review-report
reviewed: 2026-05-11T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/cli.js
  - src/commands/report.js
  - src/commands/self-review.js
  - src/core/cycles.js
  - src/core/reviews.js
  - src/templates/permissions.json
  - src/templates/prompts/self-review.md
  - src/utils/format.js
  - src/utils/paths.js
  - test/cycles.test.js
  - test/format.test.js
  - test/paths.test.js
  - test/report-month.test.js
  - test/reviews.test.js
  - test/self-review.test.js
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

The slice-1 + slice-2 self-review implementation lands a coherent module
(`src/core/reviews.js`) that respects CLAUDE.md's "only one module writes to
Reviews/" invariant, correctly hoists the `hasClaudeCli` gate before the
cascade (no partial state on missing claude), and the Option-B cycle math
in `src/core/cycles.js` is sound across the Liferay [5,9,12], [6,12], and
[12] schemes — every test case I walked by hand checks out and the en-dash
in the error message is preserved verbatim.

The single BLOCKER below is a **TOCTOU race** in the refuse-without-force
check — the reviewer is explicitly asked to verify this is "genuine (not
racy)" and it is racy. The hot-spot list from the dispatcher also flagged a
"mutex" — there is no mutex anywhere in `reviews.js`; concurrent invocations
of `self-wiki self-review` against the same cycle can produce interleaved
writes to the Reviews/ markdown.

Other warnings cluster around three areas: (1) dry-run is **not** strictly
side-effect-free (it creates `Reviews/` on disk and re-walks Tickets/
Components/), (2) input validation gaps in `resolveCycle` and
`selfReviewCommand`'s mutex filter, (3) the cascade silently swallows
*weekly* gaps in already-present months — only missing monthlies surface in
the WINDOW_NOTE. None individually justify blocking the ship; together they
should be fixed before this command gets advertised in the README.

The other audit targets you called out are clean:
- **Only `reviews.js` writes to `Reviews/<*>.md`** — confirmed; the only
  `writeFile` to a Reviews path lives at `src/core/reviews.js:689`.
- **`internal:true` plumbing in `reportMonthOrchestrator`** — symmetric
  with `reportWeekOrchestrator`: skips `hasClaudeCli` re-check (line 374),
  flips the stderr verb to "backfilling" (line 379), and suppresses the
  `wrote <path>` stdout line (line 400-402). Mirror tests pass.
- **`--dry-run` never invokes monthly synthesis** — gated at three layers:
  line 365 (early return before claude), line 488 (skip refuse-without-force
  has no write side), line 588 (skip cascade when `!opts.dryRun`).
- **`--force` regenerated marker** — prepended correctly at line 684 with
  the current `today` value; tests cover the structural path.
- **Option B `cycleAt` predicates** — `isFirst` and `isLast` correctly
  special-case Jan 1 / Dec 31 (lines 67-79), `cycleEndMonths[ordinalZero - 1] - 1`
  is right for the non-last-end case, en-dash U+2013 preserved at line 10.
- **`monthsInRange`/`parseISODate`** — UTC-only arithmetic, year-wrap
  loop terminates correctly (line 163), Feb 30 rejection via round-trip
  works (line 132-139), tests cover the year-wrap case.
- **`permissions.json`** — both new rules (`Bash(self-wiki self-review)` and
  `Bash(self-wiki self-review *)`) are scoped to the new subcommand; no
  existing rules were broadened.

## Critical Issues

### CR-01: TOCTOU race in refuse-without-force check enables silent overwrite

**File:** `src/core/reviews.js:488-497`
**Issue:**
The refuse-without-force gate uses a check-then-act sequence that is not
atomic:

```js
if (!opts.dryRun) {
  let exists = false;
  try { await access(outPath); exists = true; } catch { /* fresh */ }
  if (exists && !opts.force) {
    process.stderr.write(`error: ${outPath} already exists. Use --force ...`);
    process.exit(1);
  }
}
```

Between `access(outPath)` (line 490) and `writeFile(outPath, ...)` at
line 689, the file can come into existence (e.g. via a concurrent
`self-wiki self-review --cycle 2026-cycle1` run, or a `cp`/`git restore`).
Both invocations pass the existence check (or one passes before the other
writes), then **silently overwrite the prior body without --force, without
the regenerated marker** because the second `access(outPath)` at line 681
sees the partially-written first body but the prior --force-was-not-set
decision is already cached. The user's hand-edited review is lost without
warning.

The hot-spot list explicitly asks to verify refuse-without-force is "genuine
(not racy)" — it is not. The same race exists in
`src/commands/report.js:388-396` for the monthly regenerated marker, but
that file was out of scope for this phase.

**Fix:**
Use `writeFile(outPath, finalBody, { flag: 'wx' })` for the FIRST write and
catch `EEXIST` as the refuse-without-force signal; on `--force` use `'w'`.
Pair with an OS-level file lock (`proper-lockfile` or a dot-lock file under
`.self-wiki/locks/<cycle>.lock`) for the duration of the cascade so two
concurrent runs can't both enter the multi-minute claude synthesis path:

```js
import { writeFile } from 'fs/promises';

// Single atomic step replaces lines 488-497 AND 680-689.
try {
  await writeFile(outPath, finalBody, { flag: opts.force ? 'w' : 'wx' });
} catch (err) {
  if (err.code === 'EEXIST') {
    process.stderr.write(
      `error: ${outPath} already exists. Use --force to regenerate ` +
      `(your edits will be lost; recover via 'git restore ${outPath}' if needed).\n`,
    );
    process.exit(1);
  }
  throw err;
}
```

(The regenerated-marker prepend still works — it's based on `--force` having
been explicitly passed, which is an opts flag, not a filesystem check.)

## Warnings

### WR-01: No cross-process mutex; concurrent runs can interleave the multi-minute cascade

**File:** `src/core/reviews.js:467-702` (whole `selfReviewOrchestrator`)
**Issue:**
The hot-spot list mentions "the mutex" as a verification point. There is no
mutex in this module. Two simultaneous `self-wiki self-review --cycle 2026-cycle1`
invocations (a real possibility: a hook fires while the user types the
command, or a CI job runs concurrently with an interactive run) will both:

1. Pass refuse-without-force (CR-01 race).
2. Both enter the cascade and **both call `reportMonthOrchestrator` for
   the same missing months in parallel**, each spawning its own
   `claude -p` instances. The cascade-cascade does the same for weeklies.
3. Both write to `Reviews/<cycle>.md`, last-write-wins.
4. Both call `writeVaultConfig({review: {lastReviewedAt: today, ...}})` —
   `writeVaultConfig` itself has no mutex either, so the
   `read + spread + write` sequence can drop a concurrent update.

The cost of a single self-review run is high (cascade can spawn ~16
`claude -p` invocations per the comment at line 587). Spawning a duplicate
cascade by accident is genuinely expensive and produces inconsistent state.

**Fix:**
Acquire a dot-lock at the start of the orchestrator:

```js
import { open, unlink } from 'fs/promises';
import { join } from 'path';

const lockPath = join(getVaultPath(), '.self-wiki', `self-review-${window.cycleName}.lock`);
let lockHandle;
try {
  lockHandle = await open(lockPath, 'wx');  // O_EXCL
  await lockHandle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
} catch (err) {
  if (err.code === 'EEXIST') {
    process.stderr.write(
      `error: another self-review run is in progress (lock: ${lockPath}). ` +
      `If the prior run crashed, remove the lock file and retry.\n`,
    );
    process.exit(1);
  }
  throw err;
}
try {
  // ... existing orchestrator body ...
} finally {
  await lockHandle.close();
  await unlink(lockPath).catch(() => {});
}
```

### WR-02: `resolveCycle` does not validate its `date` argument; invalid strings produce silent NaN-cycle results

**File:** `src/core/cycles.js:23-27, 118-152`
**Issue:**
`normalizeDateUTC` accepts any value, including `new Date('2026-13-01')`
(Invalid Date). `.getUTCFullYear()` on Invalid Date returns `NaN`, the
loop at line 131-138 never matches (`m = NaN >= startMonth` is always
false), `curOrdinalZero` stays `-1`, and `cycleAt(NaN, -1, ...)` produces
a garbage result with `name = "NaN-cycle0"` and `start/end` of
`"NaN-NaN-NaN"`. No exception, no signal — just corrupt downstream prompts
and Reviews filenames.

`parseCycleName` in `reviews.js:71` already guards its own probe via
`Date.UTC(year, probeMonth - 1, 15)`, but external callers (including
`findEnclosingCycle` calling `resolveCycle(args.since, cem)` at
`reviews.js:87`) can feed garbage strings through if upstream validation
breaks.

**Fix:**
Validate the input date in `normalizeDateUTC` or at the top of
`resolveCycle`:

```js
function normalizeDateUTC(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`resolveCycle: invalid date input: ${date}`);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
```

The throw message intentionally differs from the cycleEndMonths message so
the en-dash test in `cycles.test.js:183-188` continues to pass.

### WR-03: `--dry-run` has filesystem side effects (creates `Reviews/` directory)

**File:** `src/core/reviews.js:485, 488`
**Issue:**
`ensureReviewsDir(getVaultPath())` at line 485 runs **before** the dry-run
check at line 488. A `--dry-run` invocation on a fresh vault therefore
creates the `<vault>/Reviews/` directory on disk, even though the user
explicitly requested no side effects. This contradicts the test at
`test/self-review.test.js:90-114` ("Dry-run does NOT write a Reviews file")
in spirit — the file is not written, but the parent directory is.

The slice-1 self-review.test.js also implicitly depends on `ensureVaultDirs`
having pre-created `Reviews/` in its `before()` hook (line 27), masking this
side effect from the test surface.

**Fix:**
Hoist `ensureReviewsDir` past the dry-run check:

```js
const defaultOut = getReviewFilePath(window.cycleName);
const outPath = resolveOutPath(opts.out, defaultOut);
// (do NOT call ensureReviewsDir here)
if (!opts.dryRun) {
  await ensureReviewsDir(getVaultPath());
  // ... existing refuse-without-force block ...
}
```

`ensureParentDir(outPath)` is already called at line 688 before the actual
write, so the directory is still created on the real-write path.

### WR-04: Cascade does not backfill missing *weeklies* inside already-present months

**File:** `src/core/reviews.js:615-625`
**Issue:**
The orchestrator backfills missing **monthlies** via
`reportMonthOrchestrator({ month: monthStr, internal: true })` (line 591),
which itself cascades into weeklies for that month. But if a month is
already present on disk while some of its constituent ISO weeks are
missing (e.g. user manually deleted `Reports/2026-W14.md` but left
`Reports/2026-04.md`), `selfReviewOrchestrator` reads the monthly,
silently skips the missing weekly (line 622: `// missing — silently skip`),
and the `WINDOW_NOTE` never surfaces those weekly gaps. The user thinks
they have full coverage when they do not.

The `Sources:` line in the prompt does omit missing weekly filenames, so
the model technically *could* infer the gap — but the user reading the
draft has no signal that a weekly was missing.

**Fix:**
Either (a) accept the gap as out-of-scope (document it in the orchestrator
docblock so future maintainers know) or (b) extend the
`missingMonthlyNote` to also enumerate missing in-cycle weeks:

```js
const missingWeeks = weeks.filter((w) => !weeklies.some((wk) => wk.weekStr === w));
const noteParts = [];
if (missingMonths.length > 0) noteParts.push(`Missing monthlies: ${missingMonths.join(', ')}.`);
if (missingWeeks.length > 0) noteParts.push(`Missing weeklies: ${missingWeeks.join(', ')}.`);
const missingNote = noteParts.length > 0 ? noteParts.join(' ') : null;
```

### WR-05: `selfReviewCommand` mutex filter treats `opts.cycle === ''` and explicit `false` lastCycle as set

**File:** `src/commands/self-review.js:23-29`
**Issue:**

```js
const windowFlags = [opts.since, opts.cycle, opts.lastCycle].filter(
  (v) => v !== undefined && v !== null && v !== false,
);
```

Commander never emits empty-string for a `<value>`-required option in
practice, but the predicate is permissive: `opts.since === ''` survives
the filter and counts as "set", which would trigger the mutex error if
combined with `--last-cycle`. More concerning: if Commander is upgraded
and starts emitting `false` for an absent `--last-cycle` flag, the filter
silently changes meaning. The `--since` regex check at line 34 also
short-circuits on empty string, so the user gets the
`invalid --since value:` message instead of the mutex message — fine
fallback, but unintended path.

This is a low-severity robustness issue, not a present bug.

**Fix:**
Use a more explicit truthiness check that matches the documented contract
(string for `--since`/`--cycle`, `true` for `--last-cycle`):

```js
const windowFlags = [
  typeof opts.since === 'string' && opts.since.length > 0,
  typeof opts.cycle === 'string' && opts.cycle.length > 0,
  opts.lastCycle === true,
].filter(Boolean);
```

### WR-06: `resolveOutPath` warning fires when `--out` is exactly the vault root, but path still resolves there

**File:** `src/core/reviews.js:402-410` (and `src/commands/report.js:24-32`)
**Issue:**
The check `if (!resolved.startsWith(vaultPrefix))` where
`vaultPrefix = resolve(getVaultPath()) + sep` means the vault path itself
fails the prefix check (because it doesn't end with the separator). Calling
`self-wiki self-review --out /home/u/vault` therefore prints the
"outside the vault" warning even though the user intended to write to the
vault root. The function still returns the resolved path and proceeds, so
the user would get a markdown file dumped at the vault root (e.g.
`<vault>` as a regular file, conflicting with the directory) — and
`writeFile` would then fail with `EISDIR`.

The same applies to `src/commands/report.js:24-32`. WR-09 in the
phase-02 review caught the prior version of this; the fix didn't address
the "out path equals vault root" sub-case.

**Fix:**
Reject `--out` paths that resolve to a directory:

```js
function resolveOutPath(rawOut, defaultPath) {
  if (!rawOut) return defaultPath;
  const r = resolve(rawOut);
  const vaultRoot = resolve(getVaultPath());
  const vaultPrefix = vaultRoot + sep;
  if (r === vaultRoot) {
    process.stderr.write(`error: --out cannot be the vault root: ${r}\n`);
    process.exit(1);
  }
  if (!r.startsWith(vaultPrefix)) {
    process.stderr.write(`warn: --out path is outside the vault: ${r}\n`);
  }
  return r;
}
```

## Info

### IN-01: Confusing `k - 0` dead arithmetic in `parseCycleName`

**File:** `src/core/reviews.js:66`
**Issue:**

```js
const isLast = ordinal === k - 0; // 1-indexed: last when ordinal === k
```

`k - 0` evaluates to `k`. The comment explains the 1-indexed adjustment
but the subtraction makes it look like an off-by-one was patched mid-edit.
A future reviewer will flag this as suspicious.

**Fix:**
```js
const isLast = ordinal === k;
```

### IN-02: Two-times-duplicated monthly-load loop in `selfReviewOrchestrator`

**File:** `src/core/reviews.js:507-514 + 605-612`
**Issue:**
The pre-cascade and post-cascade monthly-load loops are identical (10
lines, only the variable names differ from `presentWeeks`/`missingWeeks`
in `reportMonthOrchestrator` to `monthlies`/`missingMonths`). Extracting
a helper would reduce the risk of the two loops drifting out of sync
during future maintenance.

**Fix:**
```js
async function loadMonthlies(months) {
  const present = [];
  const missing = [];
  for (const monthStr of months) {
    try {
      const raw = await readFile(getReportFilePath(monthStr), 'utf8');
      present.push({ monthStr, raw });
    } catch {
      missing.push(monthStr);
    }
  }
  return { present, missing };
}
```

Then both call sites become `({ present: monthlies, missing: missingMonths } = await loadMonthlies(months));`.

### IN-03: Cascade-estimate (`* 4` weekly reports per missing month) is an underestimate

**File:** `src/core/reviews.js:522`
**Issue:**

```js
const cascadeEstimate = missingMonths.length * 4;
```

ISO weeks that span a month boundary appear in two months' `weeksInMonth`
result; the actual number of distinct weeks per month is 4 OR 5 depending
on the month's first/last day-of-week. For a cycle that needs four
monthlies, the cascade can backfill 16-20 weeklies, not exactly 16. The
user-facing estimate is off by up to 25%.

**Fix:**
The comment at line 521 already acknowledges "conservative estimate" — fine
for v0.1 but worth a follow-up to compute the real number via
`weeksInRange(window.start, window.end).length - presentWeeklies.length`.

### IN-04: `selfReviewOrchestrator` shadows global `window`

**File:** `src/core/reviews.js:474, 651`
**Issue:**

```js
const window = resolveReviewWindow({ ... });
// ...
const prompt = await buildSelfReviewPrompt({ window, ... });
```

`window` is a known global in browser environments and (less so) in Node.
Even in pure-Node ESM, `window` as a variable name is a smell that
typically warrants a more descriptive name (`reviewWindow`, `cycleWindow`).
Also makes a grep for "window" noisy.

**Fix:** Rename to `cycleWindow` or `reviewWindow`. The buildSelfReviewPrompt
signature already accepts `args.window`, which can stay.

### IN-05: `cycleAt` documents `name` is "year of cycle's end-date" but doesn't clarify the year-wrap edge

**File:** `src/core/cycles.js:110-114`
**Issue:**
The docblock says:

> `name` format is `<YYYY>-cycle<N>` where N is the 1-indexed position in
> `cycleEndMonths` and YYYY is the calendar year of the cycle's end-date
> (which under Option B equals `reviewYear` for every cycle since cycles
> never span a year boundary).

The parenthetical correctly notes cycles don't cross year boundaries
under Option B, but for a future reader extending to Option A (which DID
allow year-spanning cycles per the D-PREREQ doc), the implicit equivalence
`endYear === reviewYear` is load-bearing. Worth a one-line comment in
`cycleAt` saying "if Option A is ever revived, this `${reviewYear}-cycleN`
naming needs to switch to `endYear`."

**Fix:** Add the comment near line 81:
```js
// Note: under Option B, end.getUTCFullYear() === reviewYear always (cycles
// don't span year boundaries). If a future caller revives Option A, switch
// the naming to use the end-date's year instead of reviewYear.
const name = `${reviewYear}-cycle${ordinalZero + 1}`;
```

---

_Reviewed: 2026-05-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
