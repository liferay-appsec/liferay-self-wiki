# Phase 1: Cycle Config & Vault Scaffold - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 6 (3 create, 3 modify)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Action | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `src/core/cycles.js` | create | utility (pure, deterministic) | transform (date → cycle triple) | `src/utils/format.js` (esp. `datesInWeek` + `priorIsoWeek`) | exact (UTC-arithmetic + throw-on-bad-input idiom) |
| `src/core/reviews.js` | create | core (filesystem owner for `Reviews/`) | file-I/O (mkdir-only in Phase 1) | `src/utils/paths.js#ensureVaultDirs` + `src/core/topics.js` (module shape) | role-match (mkdir helper + future home for cycle-shaped writer) |
| `test/cycles.test.js` | create | test | request-response | `test/format.test.js` | exact (pure-utility, no XDG isolation needed) |
| `src/core/config.js` | modify | config | CRUD | self (`VAULT_DEFAULTS` const, lines 16–21) | exact (one-line schema extension) |
| `src/commands/init.js` | modify | command (scaffold) | file-I/O | self (`ensureVaultDirs` already covers `Reviews/` once `paths.js` is updated) | exact (the actual edit happens in `src/utils/paths.js`'s `ensureVaultDirs` array) |
| `src/templates/vault/.self-wiki/config.json` | optionally modify | config seed | static asset | self (current 4-key seed) | exact |

> **Important nuance discovered while reading the code:** the scaffold-dir list is **not** in `src/commands/init.js`. `init.js:32` calls `ensureVaultDirs()` from `src/utils/paths.js`, and the dir array literal lives at `src/utils/paths.js:88` (`['Daily', 'Reports', 'Tickets', 'Components', '.self-wiki']`). The CONTEXT.md decision D-09 mentions "the scaffold-dir list in `src/commands/init.js`" but the actual array is one indirection deeper. The planner should add `'Reviews'` to `src/utils/paths.js:88` and update the `init.js:33` user-facing string `(Daily/, Reports/, Tickets/, Components/)` to mention `Reviews/`. `test/paths.test.js:91` will also need `'Reviews'` added to its loop.

---

## Pattern Assignments

### `src/core/cycles.js` (utility, pure transform)

**Analog:** `src/utils/format.js`

**Justification:** `datesInWeek` (lines 52–70) is the canonical UTC-arithmetic pattern in the codebase — input validation via regex match, `Date.UTC(...)` constructor, `setUTCDate(...)` arithmetic, ISO `YYYY-MM-DD` string assembly via `String(...).padStart(2, '0')`. Phase 1's `resolveCycle` mirrors this end-to-end. `priorIsoWeek` (lines 25–50) is the closest year-wrap analog — same pattern of "subtract a unit, derive year/ordinal from the resulting Date" — directly applicable to the year-wrap previousCycle case (Jan 5 2026 → 2025-cycle3).

**Note on layer:** `cycles.js` is *deterministic and pure*, which would normally argue for `src/utils/`. But CONTEXT.md decision D-01 places it in `src/core/`, and the codebase precedent supports this: `src/core/closing-tells.js` is also a pure regex catalogue with no I/O and lives in `core/`. The line is fuzzy; respect the decision.

**Imports pattern** (`src/utils/format.js` has no imports — pure module). Phase 1's `cycles.js` should likewise have **zero imports**:
```javascript
// no imports — pure UTC arithmetic + string assembly
```

**Input-validation throw pattern** (`src/utils/format.js:25-27` and `:53-55`):
```javascript
export function priorIsoWeek(weekStr) {
  const m = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO week: ${weekStr}`);
  // ...
}

export function datesInWeek(weekStr) {
  const m = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO week: ${weekStr}`);
  // ...
}
```
**Apply to:** `resolveCycle`'s `cycleEndMonths` validator (D-06). One throw per failure mode is fine; a single combined message also works. Per CONTEXT D-06 the message must be: `cycleEndMonths must be a non-empty sorted array of integers 1–12`. Per Claude's Discretion in CONTEXT, can append `(edit <vault>/.self-wiki/config.json)` for actionability.

**UTC arithmetic pattern** (`src/utils/format.js:52-70`, the canonical analog):
```javascript
export function datesInWeek(weekStr) {
  const m = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO week: ${weekStr}`);
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Mon);
  monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return dates;
}
```
**What to copy verbatim for `cycles.js`:**
- `Date.UTC(year, monthIndex, day)` constructor (note: month is 0-indexed; `cycleEndMonth` from config is 1-indexed — convert with `cycleEndMonth - 1`).
- `setUTCDate(...)` for arithmetic — this auto-handles month/year rollover.
- `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` for ISO string emission via `getUTCFullYear/Month/Date`.
- Never use `getFullYear` / `getDate` (local-tz); always `getUTC*`.

**Year-wrap pattern** (`src/utils/format.js:33-49`):
```javascript
// Year boundary: walk from Mon of W1 of `year` back 7 days, then derive the
// ISO week of that Monday. Computed entirely in UTC to avoid the local-tz
// bug in isoWeek that flips W53 ↔ W52 around year boundaries.
const jan4 = new Date(Date.UTC(year, 0, 4));
const jan4Day = jan4.getUTCDay() || 7;
const monW1 = new Date(jan4);
monW1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
monW1.setUTCDate(monW1.getUTCDate() - 7);
```
**Apply to:** the year-wrap previousCycle case. When the `previous` cycle's review-month is the *last* entry in `cycleEndMonths`, its review year is `currentYear - 1`. Mechanically: build a `Date.UTC(year, lastEndMonth - 1, 1)`, derive `getUTCFullYear()` for the cycle-name year prefix.

**Date-input normalization** (CONTEXT Claude's Discretion): accept both `Date` and ISO string. Idiom from `src/utils/format.js#diffMinutes:73-74`:
```javascript
const start = new Date(startedAtIso);
const end = endedAt instanceof Date ? endedAt : new Date(endedAt);
```
**Apply to:** `resolveCycle(date, cycleEndMonths)`'s `date` param. One-liner: `const d = date instanceof Date ? date : new Date(date);` then immediately re-anchor in UTC: `const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));`.

**Test scaffolding** — see `test/cycles.test.js` section below.

---

### `src/core/reviews.js` (core, file-I/O — Phase 1 stub)

**Analog (primary):** `src/utils/paths.js#ensureVaultDirs` (lines 86–91) — the `mkdir(path, { recursive: true })` pattern is exactly what `ensureReviewsDir(vaultPath)` needs to do.

**Analog (module shape):** `src/core/topics.js` (header lines 1–11) — Phase 3 will grow `reviews.js` with a self-review writer; the import shape (writeFile + paths helpers + readVaultConfig + lock) is the future template. Phase 1 leaves comments hinting at this.

**`mkdir` idempotent pattern** (`src/utils/paths.js:86-91`):
```javascript
export async function ensureVaultDirs() {
  const vault = getVaultPath();
  for (const sub of ['Daily', 'Reports', 'Tickets', 'Components', '.self-wiki']) {
    await mkdir(join(vault, sub), { recursive: true });
  }
}
```
**Apply to:** `ensureReviewsDir(vaultPath)`. The CONTEXT D-10 signature explicitly takes `vaultPath` as an argument (not pulled from `paths.js#getVaultPath`) so it can be called from contexts where `applyUserConfig` may not have run. Implementation:
```javascript
import { mkdir } from 'fs/promises';
import { join } from 'path';

export async function ensureReviewsDir(vaultPath) {
  await mkdir(join(vaultPath, 'Reviews'), { recursive: true });
}
```

**Note:** `ensureVaultDirs` calls `getVaultPath()` (which reads module-level state); `ensureReviewsDir` deliberately takes the path as a parameter per D-10. Don't re-export `ensureVaultDirs` or wrap it — those are different invariants.

**Belt-and-suspenders rationale (D-09):** This helper is redundant for newly `init`-ed vaults (whose `Reviews/` is created via `ensureVaultDirs` once `paths.js` is updated), but covers pre-existing vaults where the user never re-runs `init` before invoking Phase 3's `self-review`. Phase 3 will call `ensureReviewsDir(vaultPath)` before writing any `Reviews/<YYYY>-cycleN.md` file.

---

### `test/cycles.test.js` (test, pure-utility)

**Analog:** `test/format.test.js` (entire file).

**Justification:** Pure-utility test, no filesystem, no XDG state isolation needed. The `test/config.test.js` and `test/topics.test.js` patterns (with `mkdtempSync` + `XDG_*_HOME` overrides) are *not* needed here because `cycles.js` has zero filesystem touch-points.

**Imports + assertion style** (`test/format.test.js:1-10`):
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatHHMM,
  todayISO,
  formatDuration,
  isoWeek,
  datesInWeek,
  diffMinutes,
} from '../src/utils/format.js';
```
**Apply to:** `test/cycles.test.js`. Import `resolveCycle` (and any optional helper like `cycleNameFor` per Claude's Discretion) from `'../src/core/cycles.js'`. Use `node:test` and `node:assert/strict` — never Jest, Vitest, Mocha (per STACK.md).

**Test naming convention** (`test/format.test.js:12-15`):
```javascript
test('formatHHMM zero-pads hours and minutes', () => {
  assert.equal(formatHHMM(new Date('2026-04-27T03:05:00')), '03:05');
  assert.equal(formatHHMM(new Date('2026-04-27T23:59:00')), '23:59');
});
```
**Apply to:** Each D-11 success criterion gets one `test(...)`. Use lowercase imperative-mood title: `test('resolveCycle returns 2026-cycle1 for May 1 2026 (review month, current stays cycle1)', ...)`. Multiple `assert.equal` per `test()` is the established style.

**Throw assertion pattern** (`test/format.test.js:54-57`):
```javascript
test('datesInWeek throws on bad format', () => {
  assert.throws(() => datesInWeek('2026-18'), /Invalid ISO week/);
  assert.throws(() => datesInWeek('not-a-week'), /Invalid ISO week/);
});
```
**Apply to:** D-11's invalid-input cases (empty array, non-array, out-of-range, duplicates, non-monotonic). One `test()` with multiple `assert.throws(..., /cycleEndMonths must be/)` calls is idiomatic.

**Boundary-day test pattern** (`test/format.test.js:47-52`):
```javascript
test('datesInWeek returns 7 ISO dates Mon-Sun', () => {
  const dates = datesInWeek('2026-W18');
  assert.equal(dates.length, 7);
  assert.equal(dates[0], '2026-04-27');
  assert.equal(dates[6], '2026-05-03');
});
```
**Apply to:** D-11's "boundary days exactly" criterion. Test `April 30 2026` → current = `2026-cycle1` AND test `May 1 2026` → current = `2026-cycle1` (still — D-04: current stays `cycle1` through the review month) AND `June 1 2026` → current = `2026-cycle2`. Use `assert.deepEqual(result.current, { name: '2026-cycle1', start: '2025-12-01', end: '2026-04-30' })`.

**No isolation needed:** unlike `test/config.test.js:9-17`, do NOT add `before/after` hooks with `mkdtempSync`. Pure utility tests follow `test/format.test.js`'s fixture-free style.

---

### `src/core/config.js` (config, CRUD — modify)

**Analog:** self. The existing `VAULT_DEFAULTS` (lines 16–21) is the schema; `readVaultConfig` (lines 44–51) does the shallow-merge that makes D-07's lazy-migration work for free.

**Existing `VAULT_DEFAULTS`** (`src/core/config.js:16-21`):
```javascript
const VAULT_DEFAULTS = {
  ticketRegex: '\\b(LPD|LPP|LPS|LRELEASE)-\\d+\\b',
  branchTicketRegex: '(?:^|[/_-])((?:LPD|LPP|LPS|LRELEASE)-\\d+)(?:[/_-]|$)',
  components: [],
  softCloseMinutes: 5,
};
```

**Edit:** Add a fifth top-level key per D-08:
```javascript
const VAULT_DEFAULTS = {
  ticketRegex: '\\b(LPD|LPP|LPS|LRELEASE)-\\d+\\b',
  branchTicketRegex: '(?:^|[/_-])((?:LPD|LPP|LPS|LRELEASE)-\\d+)(?:[/_-]|$)',
  components: [],
  softCloseMinutes: 5,
  review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null },
};
```

**Critical: shallow-merge limitation** (`src/core/config.js:44-51`):
```javascript
export async function readVaultConfig() {
  try {
    const raw = await readFile(getVaultConfigFilePath(), 'utf8');
    return { ...VAULT_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...VAULT_DEFAULTS };
  }
}
```
**What this means for D-07:** the shallow spread means a vault config that *already has its own `review` block* will see that block win wholesale — sub-keys are NOT merged. `readUserConfig` (line 27) does an explicit deep-merge for `jira` (`{ ...USER_DEFAULTS.jira, ...(parsed.jira ?? {}) }`); `readVaultConfig` does **not** for `review`.

**Implication for the planner:** for Phase 1's lazy-migration (D-07) to work, the on-disk vault config must have NO `review` key on first read. This is true today (vault seed is the 4-key file). When Phase 3 first writes via `writeVaultConfig({ review: { lastReviewedAt: ..., lastReviewedCycle: ... } })`, the same shallow-merge issue strikes — `writeVaultConfig` (lines 53–60) will preserve `cycleEndMonths` only if Phase 3 reads first and re-spreads, or if `writeVaultConfig` adopts the same nested-merge pattern `writeUserConfig` already has for `jira` (lines 36–39).

**Recommended pattern (Phase 3 will need this — flag it now):** `writeVaultConfig` should adopt `writeUserConfig`'s nested-merge pattern for `review`:
```javascript
// writeUserConfig analog (src/core/config.js:33-42):
export async function writeUserConfig(patch) {
  await ensureConfigDir();
  const current = await readUserConfig();
  const next = { ...current, ...patch };
  if (patch.jira) {
    next.jira = { ...current.jira, ...patch.jira };
  }
  // ...
}
```
Phase 1 may either (a) extend `writeVaultConfig` now with the same `if (patch.review)` block, or (b) defer the change to Phase 3 when first needed. Recommendation: do it in Phase 1 — it's a 3-line addition, identical to the proven `jira` precedent, and avoids a nested-config bug ambush in Phase 3. Document the precedent in the test (`test/config.test.js:39-50` already covers the `jira` deep-merge case; mirror it for `review`).

**Existing test pattern to mirror** (`test/config.test.js:59-79`):
```javascript
test('readVaultConfig returns defaults when file missing', async () => {
  paths.setVaultPath(vault);
  const cfg = await config.readVaultConfig();
  assert.equal(cfg.softCloseMinutes, 5);
  // ...
});

test('writeVaultConfig merges patch with defaults and persists', async () => {
  paths.setVaultPath(vault);
  await config.writeVaultConfig({
    softCloseMinutes: 10,
    components: ['portal'],
  });
  // ...
});
```
**Apply to:** `test/config.test.js` should grow tests covering (1) defaults expose `review.cycleEndMonths === [5, 9, 12]`, `review.lastReviewedAt === null`, `review.lastReviewedCycle === null`; (2) if `writeVaultConfig` is taught to deep-merge `review`, a test for partial-patch (write `lastReviewedAt`, verify `cycleEndMonths` survives). The CONTEXT scopes test work to `test/cycles.test.js` for D-11; whether to extend `test/config.test.js` is a planner judgement call but recommended.

---

### `src/commands/init.js` (command, file-I/O — modify)

**Analog:** self.

**Note re-stated:** the actual edit is in `src/utils/paths.js:88` where the dir array literal lives. `init.js` calls `ensureVaultDirs()` at line 32 and prints a hardcoded user-facing string at line 33 listing the dirs.

**Existing scaffold-list call** (`src/commands/init.js:32-33`):
```javascript
await ensureVaultDirs();
process.stdout.write(`  ${chalk.green('✓')} vault folders ready (Daily/, Reports/, Tickets/, Components/)\n`);
```

**Existing dir array** (`src/utils/paths.js:86-91`):
```javascript
export async function ensureVaultDirs() {
  const vault = getVaultPath();
  for (const sub of ['Daily', 'Reports', 'Tickets', 'Components', '.self-wiki']) {
    await mkdir(join(vault, sub), { recursive: true });
  }
}
```

**Edits required:**
1. `src/utils/paths.js:88` — add `'Reviews'` to the array: `['Daily', 'Reports', 'Tickets', 'Components', 'Reviews', '.self-wiki']`. Order suggestion: alphabetical-among-content-dirs would be `['Components', 'Daily', 'Reports', 'Reviews', 'Tickets', '.self-wiki']`, but the current order isn't alphabetical (it's `Daily` first because that's the source of truth) — match the existing convention by inserting `'Reviews'` next to `'Reports'`: `['Daily', 'Reports', 'Reviews', 'Tickets', 'Components', '.self-wiki']`.
2. `src/commands/init.js:33` — update the user-facing string to mention `Reviews/`: `vault folders ready (Daily/, Reports/, Reviews/, Tickets/, Components/)`.
3. `test/paths.test.js:91` — add `'Reviews'` to the loop: `for (const sub of ['Daily', 'Reports', 'Reviews', 'Tickets', 'Components', '.self-wiki'])`.

**Idempotence is already guaranteed:** `mkdir(..., { recursive: true })` is a no-op on existing dirs. Re-running `init` on an existing vault adds `Reviews/` without disturbing anything else. Confirmed by `test/paths.test.js:96-106` (`ensureDataDir + ensureSessionsDir + ensureConfigDir are idempotent`).

---

### `src/templates/vault/.self-wiki/config.json` (config seed — optionally modify)

**Analog:** self.

**Current contents:**
```json
{
  "ticketRegex": "\\b(LPD|LPP|LPS|LRELEASE)-\\d+\\b",
  "branchTicketRegex": "(?:^|[/_-])((?:LPD|LPP|LPS|LRELEASE)-\\d+)(?:[/_-]|$)",
  "components": [],
  "softCloseMinutes": 5
}
```

**How `init` consumes it** (`src/commands/init.js:35-42`):
```javascript
const vaultCfgDest = getVaultConfigFilePath();
if (!(await fileExists(vaultCfgDest))) {
  await mkdir(dirname(vaultCfgDest), { recursive: true });
  await copyFile(VAULT_CFG_SRC, vaultCfgDest);
  process.stdout.write(`  ${chalk.green('✓')} seeded ${rel(vaultCfgDest)}\n`);
}
```
**`init` literally `copyFile`s** the seed verbatim into the new vault. So the question is: should the seed include the `review` block on disk, or rely on `VAULT_DEFAULTS` to provide it on every read?

**Trade-off:**
- **Include in seed (write to disk):** New vaults' `<vault>/.self-wiki/config.json` shows `review.cycleEndMonths: [5, 9, 12]` literally — discoverable for users who want to edit cycle boundaries (the throw message in D-06 says "edit `<vault>/.self-wiki/config.json`"; if the key isn't present in the file, the user has to know to add it).
- **Omit from seed (rely on defaults):** Smaller on-disk file, no risk of seed/`VAULT_DEFAULTS` drift, matches D-07's lazy-migration philosophy uniformly (new vaults and old vaults both get `review` only via shallow-merge until first `writeVaultConfig`).

**Recommendation:** *include in seed*. Justification: the throw error from D-06 directs users to edit the file, and per D-09 the milestone goal is to have Liferay's defaults and the customization knob both visible. This is also more honest about what the schema is. Risk is low — drift between seed and `VAULT_DEFAULTS` only matters if both diverge, and a single-line audit catches it.

**Proposed seed:**
```json
{
  "ticketRegex": "\\b(LPD|LPP|LPS|LRELEASE)-\\d+\\b",
  "branchTicketRegex": "(?:^|[/_-])((?:LPD|LPP|LPS|LRELEASE)-\\d+)(?:[/_-]|$)",
  "components": [],
  "softCloseMinutes": 5,
  "review": {
    "cycleEndMonths": [5, 9, 12],
    "lastReviewedAt": null,
    "lastReviewedCycle": null
  }
}
```

**Planner judgement:** if the planner picks "omit from seed", document the choice in PLAN.md and add a CLI affordance later (e.g., a future `self-wiki cycle status` could print the active config). For Phase 1, including it is the lower-friction default.

---

## Shared Patterns

### UTC arithmetic (deterministic-side rule)

**Source:** `src/utils/format.js` (entire file is the canonical example)

**Apply to:** `src/core/cycles.js` boundary math.

**Rule:** Never use local-tz `Date` accessors (`getMonth`, `getDate`, `getFullYear`) for arithmetic on dates that cross day/month/year boundaries. Always: `Date.UTC(...)` to construct, `setUTCDate(...)` to step, `getUTC*` to read. CONTEXT D-05 explicitly calls this out and points at `datesInWeek`. Forbidden idiom: `new Date(year, month, day).setDate(...)` — that's local-tz and silently breaks DST.

```javascript
// CORRECT (from src/utils/format.js:17-19):
const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
d.setUTCDate(d.getUTCDate() + 4 - dayNum);
```

### Throw-on-bad-input (pure-utility convention)

**Source:** `src/utils/format.js:25-27`, `src/utils/paths.js:25-29`

**Apply to:** `src/core/cycles.js` (D-06).

**Rule:** Pure utilities throw with a clear message on bad input — they are *not* responsible for "fixing" malformed input. CONTEXT distinguishes this from `src/core/detect.js`'s soft-fail rule for external CLIs (`gh`, JIRA). This is the CLAUDE.md rule "Soft dependencies degrade silently" applied selectively: `gh`/JIRA are external, soft. Config schema is internal contract, loud.

```javascript
// src/utils/format.js:25-27
export function priorIsoWeek(weekStr) {
  const m = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO week: ${weekStr}`);
  // ...
}

// src/utils/paths.js:25-29
export function getSessionFilePath(claudeSessionId) {
  if (!claudeSessionId) throw new Error('claudeSessionId is required');
  // ...
}
```

### Test-isolation strategy (only when filesystem is touched)

**Source:** `test/config.test.js:9-21`, `test/paths.test.js:10-19`, `test/topics.test.js:17-30`

**Apply to:** `test/cycles.test.js` — **NOT NEEDED** (pure-utility, no filesystem). Skip the `mkdtempSync`/`XDG_*_HOME` block.

**For the planner if `test/config.test.js` grows new `review`-block tests:** the existing `before/after` hooks (lines 9–21) already provide the fixture; reuse them, don't duplicate.

```javascript
// test/config.test.js:9-21 — the canonical isolation block
let tmp, vault, paths, config;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-config-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  config = await import('../src/core/config.js');
  vault = join(tmp, 'vault');
  mkdirSync(vault, { recursive: true });
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});
```
**Critical detail:** the `await import(...)` is *after* the `process.env.XDG_*_HOME` assignment. `src/utils/paths.js:5-13` reads env vars at module-load time; importing first would cache the wrong paths. This ordering matters for any new test that touches `paths.js`.

### Deterministic-vs-model split

**Source:** CLAUDE.md "Deterministic vs. model" rule + `src/commands/report.js#buildMetrics`

**Apply to:** `src/core/cycles.js`, `src/core/reviews.js`.

**Rule:** Cycle boundary computation is *arithmetic*. It MUST live in code and MUST NEVER be passed to `claude -p`. Phases 2 and 3 will pre-compute `{name, start, end}` triples in code and inject them as plain strings into prompts. This phase establishes that contract — no part of `cycles.js` is allowed to reach for the model.

This is also the ARCHITECTURE.md anti-pattern "Asking the model to compute a number" (lines 271–275): same rule applies to dates as to counts.

### File-I/O ownership boundaries

**Source:** STRUCTURE.md "Where to Add New Code" + ARCHITECTURE.md "Component Responsibilities"

**Apply to:** `src/core/reviews.js`.

**Rule:** A core module owns its filesystem region. `src/core/logger.js` owns daily files. `src/core/topics.js` owns `Tickets/` and `Components/` pages. After Phase 1, `src/core/reviews.js` owns `Reviews/`. No other module may write to `Reviews/<*>.md`. (Phase 1 only does mkdir; Phase 3 will extend this module with the writer.)

### Idempotent scaffold

**Source:** `src/utils/paths.js:86-91` (`mkdir(..., { recursive: true })`), `src/commands/init.js#mergeHooks`

**Apply to:** `src/commands/init.js` `Reviews/` addition, `ensureReviewsDir`.

**Rule:** Re-running `init` (or `ensureReviewsDir`) on an existing vault must be a no-op for already-existing artifacts. `mkdir(..., { recursive: true })` is the bedrock idiom — already used everywhere. No bespoke "does this exist?" check is needed.

---

## No Analog Found

None — every Phase 1 file has a strong analog in the existing codebase. Pure-utility (`cycles.js`) maps to `src/utils/format.js`; mkdir helper (`reviews.js`) maps to `src/utils/paths.js`'s pattern; config edit is a self-analog; init edit is a one-line array extension.

---

## Metadata

**Analog search scope:**
- `src/utils/format.js` (1 file, 77 lines) — UTC arithmetic + throw-on-bad-input
- `src/utils/paths.js` (1 file, 92 lines) — vault scaffold dir list, mkdir-recursive idiom
- `src/core/config.js` (1 file, 78 lines) — VAULT_DEFAULTS + shallow-merge read, deep-merge write (jira precedent for review)
- `src/commands/init.js` (1 file, 256 lines, only header read) — vault config seed copy + ensureVaultDirs call site
- `src/core/topics.js` (1 file, header lines) — module shape for future `reviews.js` growth
- `src/templates/vault/.self-wiki/config.json` (current 4-key seed)
- `test/format.test.js` (1 file, 78 lines) — pure-utility test pattern
- `test/config.test.js` (1 file, 88 lines) — XDG-isolated test pattern
- `test/paths.test.js` (1 file, 113 lines) — scaffold-dir loop assertion to update
- `test/topics.test.js` (1 file, header lines) — vault-fixture test pattern

**Files scanned:** 10
**Pattern extraction date:** 2026-05-07
