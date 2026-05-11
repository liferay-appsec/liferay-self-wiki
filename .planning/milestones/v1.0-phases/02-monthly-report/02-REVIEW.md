---
phase: 02-monthly-report
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/cli.js
  - src/commands/report.js
  - src/core/metrics.js
  - src/templates/prompts/monthly-report.md
  - src/utils/format.js
  - test/format.test.js
  - test/metrics.test.js
  - test/report-month.test.js
findings:
  critical: 4
  warning: 9
  info: 4
  total: 17
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The monthly-report implementation is substantially complete and well-commented, with sensible separation between the weekly and monthly orchestrators, a dedicated metrics shape, and an explicit prompt-injection defense in the synthesis prompt. However, there are correctness and robustness defects worth fixing before this ships:

- A latent timezone bug in `weeksInMonth`/`isoWeek` that can produce the wrong ISO week at month/year boundaries for users in non-UTC timezones.
- A reentrancy hazard: when the monthly auto-backfill loop calls `reportWeekOrchestrator` internally and a constituent week's `present.length === 0` (e.g. due to a race between `anyDailyExists` and the inner read, or a directory-listing inconsistency), the inner orchestrator calls `process.exit(1)` and tears down the entire monthly run — directly violating the "no partial state" promise documented above the gate at line 247.
- Mid-loop crash from `claudeHeadless` is not caught; the orchestrator promises atomicity ("a mid-loop crash on missing claude can never leave partial state") but only gates the *pre-spawn* check, not the actual headless invocation.
- Several tests inspect raw source text via `readFileSync` + regex, which couples the test suite to implementation details and will misfire on legitimate refactors.

## Critical Issues

### CR-01: Internal weekly orchestrator can call `process.exit(1)` mid-monthly-run

**File:** `src/commands/report.js:66-69`
**Issue:** When `reportMonthOrchestrator` invokes `reportWeekOrchestrator({ week: weekStr, internal: true })` (line 256), the inner orchestrator still has the unconditional `process.exit(1)` at line 67-69 if `present.length === 0`. This can occur:

1. Because of a race between the outer `anyDailyExists()` check and the inner `access()` calls (a daily file could be moved/deleted by the user or another process between the two).
2. Because `anyDailyExists` returns true on the very first hit, but later dates could fail the inner read for unrelated reasons (e.g., permission flap, transient I/O) and yet the loop will reach `present.length === 0` only if *every* daily for that week then fails — unlikely but possible.

When the abort fires, it tears down the entire monthly run, having already backfilled some weeklies. That directly contradicts the comment block at line 246-247 ("Gate the entire loop behind a single hasClaudeCli check so a mid-loop crash on missing `claude` cannot leave partial state in the vault"). The gate covers `claude` availability, not "this week's dailies disappeared mid-loop."

**Fix:** When `internal === true`, do not call `process.exit(1)`. Instead, return early so the monthly loop proceeds with the remaining weeks:
```js
if (present.length === 0) {
  if (internal) {
    process.stderr.write(`warn: skipping ${week} — no daily logs at synthesis time\n`);
    return;
  }
  process.stderr.write(`error: no daily logs found for ${week}\n`);
  process.exit(1);
}
```

---

### CR-02: Unhandled `claudeHeadless` rejection in monthly backfill loop violates atomicity invariant

**File:** `src/commands/report.js:252-257`
**Issue:** The monthly backfill loop awaits `reportWeekOrchestrator(...)` for each missing week. Inside, `claudeHeadless(prompt)` is called (line 88). If the spawned `claude -p` exits non-zero (network blip, model error, OOM, killed) the promise rejects with `Error('claude -p exited with code N')` and bubbles up through the unguarded `await` in the monthly loop, propagates to `program.parseAsync().catch(...)` in `cli.js:128`, and exits `1`.

By that point the loop may have already written several weekly reports to `Reports/<week>.md`, leaving partial state — which the comment at line 244-246 explicitly promises will not happen. The `hasClaudeCli()` pre-check guards only the binary-presence case, not runtime failures from `claude -p` itself.

**Fix:** Wrap each backfill call so a single weekly failure does not kill the monthly synthesis. Either accumulate failures and continue (preferred, matching the "graceful skip" pattern used for weeks with zero dailies):
```js
for (const weekStr of missingWeeks) {
  const weekDates = datesInWeek(weekStr);
  if (!(await anyDailyExists(weekDates))) continue;
  try {
    await reportWeekOrchestrator({ week: weekStr, internal: true });
  } catch (err) {
    process.stderr.write(`warn: backfill failed for ${weekStr}: ${err.message}\n`);
  }
}
```
…or document that mid-loop failures are fatal and remove the misleading "no partial state" comment.

---

### CR-03: `weeksInMonth` mixes UTC and local time, producing wrong ISO week for negative-offset timezones at boundaries

**File:** `src/utils/format.js:101-114` (interacting with `src/utils/format.js:16-23`)
**Issue:** `weeksInMonth` constructs `new Date(\`${dateStr}T00:00:00Z\`)` (UTC midnight) and passes it to `isoWeek(d)`. But `isoWeek` reads the date components via `date.getFullYear()`, `date.getMonth()`, `date.getDate()` — *local* time. For a user in UTC-N (e.g. PST = UTC-8), UTC midnight of `YYYY-MM-DD` becomes the previous calendar day in local time. `isoWeek` then computes the ISO week for the wrong calendar date.

This is acknowledged in the codebase: `priorIsoWeek` carries the comment "the local-tz bug in isoWeek that flips W53 ↔ W52 around year boundaries." (`format.js:33`). The bug is observable around month and year boundaries:
- `weeksInMonth('2023-01')` in PT computes `isoWeek` for `2022-12-31` instead of `2023-01-01`, yielding `2022-W52` first (probably correct anyway), then for `2023-01-02` (Mon) shifts to `2023-01-01` (Sun, W52) — boundary flips.
- More concerning: any month whose first day is a Monday will shift to the prior Sunday (last day of prior ISO week) when converted to PT, potentially skipping a week or duplicating one.

The current tests (`format.test.js:125-148`) all pass under UTC because UTC + UTC midnight cancel out; they will fail under PT/CET/etc. or produce wrong reports for users in those zones.

**Fix:** Make `isoWeek` UTC-clean (the `priorIsoWeek` implementation already does this — extract the same pattern):
```js
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ...rest unchanged, all subsequent ops are already UTC-based
}
```
Note: this also fixes the weekly path for users running `self-wiki report --week` (no `--week`) near local midnight.

---

### CR-04: `reportWeekOrchestrator` reads each daily file twice with a TOCTOU window

**File:** `src/commands/report.js:54-64`
**Issue:**
```js
await access(getDailyFilePath(dateStr));
const raw = await readFile(getDailyFilePath(dateStr), 'utf8');
```
The `access` call is redundant — `readFile` will throw `ENOENT` itself — and creates a TOCTOU window where the file can be deleted (or replaced with a symlink to an arbitrary path) between the two calls. While exploitation is unlikely (the user owns the vault), the pattern is unsafe and contributes to CR-01's race surface.

**Fix:** Drop the `access` and let `readFile` be the single point of truth:
```js
for (const dateStr of dates) {
  try {
    const raw = await readFile(getDailyFilePath(dateStr), 'utf8');
    present.push(dateStr);
    dailies.push({ dateStr, raw });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    if (isWeekday(dateStr)) missing.push(dateStr);
  }
}
```
This also surfaces non-ENOENT errors (permission, I/O) instead of misclassifying them as "missing."

---

## Warnings

### WR-01: `claudeHeadless` and `hasClaudeCli` have no timeout

**File:** `src/core/claude.js:6-23, 25-31`
**Issue:** If `claude -p` (or even `claude --version`) hangs — model service unreachable, network hung, deadlocked subprocess — the entire CLI hangs forever with no operator feedback. Monthly reports invoke this potentially many times during backfill.

**Fix:** Add a configurable timeout (e.g. 5 min for synthesis, 5s for `--version`) and reject with a descriptive error on expiry. Use `child.kill('SIGTERM')` (then `SIGKILL` after grace period).

---

### WR-02: Tests grep for source-text patterns rather than asserting behavior

**File:** `test/report-month.test.js:212-239, 296-306`
**Issue:** Tests like `'Plan 02-03 RED — auto-backfill phase wired into reportMonthOrchestrator'` and `'regenerated-marker code path exists in source'` use `readFileSync(...).match(/async function anyDailyExists/)` and similar regexes against the source. These will misfire on legitimate refactors (e.g. renaming `anyDailyExists` to `weekHasDailies`, extracting the loop body, or moving the marker constant to a top-level `const`). They also do not actually verify behavior — they verify text.

**Fix:** Replace with behavior tests that drive the orchestrator end-to-end. Where that requires a stubbed `claude` binary (out of v1 scope), add a TODO and remove the source-grep tests in favor of assertions on side effects (e.g., "after running with W18 daily present and a stub claude that writes a sentinel, `Reports/2026-W18.md` exists").

---

### WR-03: `formatHHMM`, `todayISO` use local time while `todayUTC()` and `currentMonthUTC()` use UTC — silent inconsistency

**File:** `src/utils/format.js:1-7` vs `src/commands/report.js:153-161`
**Issue:** The codebase mixes local-tz and UTC idioms inconsistently. `formatHHMM` (used by logger) uses `toLocaleTimeString` (local), `todayISO` uses `getFullYear/getMonth/getDate` (local), but `report.js#todayUTC` and `currentMonthUTC` use UTC. Around local midnight in non-UTC zones, the daily-file naming (local) and monthly partial-detection (UTC) can disagree by one day, producing surprising output (e.g. "Partial month note added the day after the month nominally ended").

**Fix:** Pick one. Either standardize on local time for everything user-facing (HH:MM, daily file names, today comparisons) — or document why monthly uses UTC while daily uses local. The README's user-facing model is "today's daily file"; users will reason in local time, so `todayUTC` may be the wrong default for partial-month detection.

---

### WR-04: Sources line concatenation has a dead `join('')` and unclear precedence

**File:** `src/commands/report.js:335-348`
**Issue:** `sourceParts` is initialized empty, then exactly one element is pushed (line 337 or 339). `sourceParts.join('')` (line 341) is therefore a no-op join over a single-element array. The code reads as if `sourceParts` is meant to be a multi-section list, but no second push exists. Also: when `weeklies.length === 0` the literal text `(no weekly reports present).` appears in `Sources:` followed by topic-page list, which reads awkwardly.

**Fix:** Either accumulate multiple parts and `join(', ')`, or drop the array indirection:
```js
const sourcesLine = [
  weeklies.length > 0
    ? `Sources: ${weeklies.map((w) => `\`Reports/${w.weekStr}.md\``).join(', ')}.`
    : 'Sources: (no weekly reports present).',
  missingWeeks.length > 0 ? ` Missing weeks: ${missingWeeks.join(', ')}.` : '',
  topicPages.length > 0 ? ` Topic pages: ${topicPages.map(...).join(', ')}.` : '',
].join('');
```

---

### WR-05: PR regex `\d{2,5}` quietly truncates large monorepo PR numbers

**File:** `src/core/metrics.js:43`
**Issue:** `(?:\b(?:PR|pull)\s*#?|#)(\d{2,5})\b` rejects PRs `#100000` and above. Liferay's monorepos and many active OSS projects routinely exceed five digits. Currently 6+ digit PRs are *silently dropped* from the metrics block. The "tighter" comment explains the lower bound (avoiding `#5` noise) but the upper bound is unjustified.

**Fix:** Bump to `\d{2,7}` (covers any realistic PR number through 9.9M). Or remove the upper bound entirely:
```js
const prMatches = text.match(/(?:\b(?:PR|pull)\s*#?|#)(\d{2,})\b/gi) ?? [];
```

---

### WR-06: PR regex conflates GitHub issue refs with PRs

**File:** `src/core/metrics.js:43-45`
**Issue:** Many users write `#1234` to mean "issue 1234" (GitHub displays both as `#N`). The current regex tags any `#NNNN` as a PR, which inflates the "PRs touched" line. The deterministic-metrics rule from CLAUDE.md ("Time tables, session counts, PR refs ... are computed in code from parsed log structure") makes accuracy here load-bearing — the prompt header even says "PRs touched: ... (Use as-is)."

**Fix:** Either narrow to `\b(?:PR|pull)\s*#?(\d{2,7})\b` (drop the bare `#` branch — explicit `PR #NNN` only), or split into "PRs touched" and "Issues touched" using the `\b(?:PR|pull)` distinction.

---

### WR-07: `loadInMonthTopicPages` substring match is fragile

**File:** `src/commands/report.js:215`
**Issue:** `dates.some((d) => raw.includes(\`## ${d} \`))` assumes a literal trailing space after the date. `topics.js#appendDatedSection` writes `## ${dateStr} — Session ${n}` — currently a space. If that ever changes (e.g., a future refactor uses `: ` or no separator at all), this silently drops topic pages from monthly synthesis with no warning. There's no test against the topics.js writer to keep them in sync.

**Fix:** Match a stricter, format-agnostic header anchor:
```js
const dateRe = new RegExp(`^## (${dates.map(escapeRegex).join('|')})\\b`, 'm');
const touched = dateRe.test(raw);
```
Or assert in topics.js's tests that the marker matches the format expected by the consumer.

---

### WR-08: `anyDailyExists` short-circuits but bypasses the same TOCTOU concerns as CR-04

**File:** `src/commands/report.js:100-108`
**Issue:** `anyDailyExists` uses `access()` (existence-only). Same redundancy / race issue as CR-04. Additionally, on permission errors `access` throws, which the bare `catch {}` masks — so a daily file the process *cannot read* counts as "doesn't exist" and the week is skipped. If the user has set vault perms tightly, monthly synthesis silently degrades.

**Fix:** Probe with a tiny `readFile` (or `stat`), and let unexpected errors surface:
```js
async function anyDailyExists(dates) {
  for (const d of dates) {
    try {
      await stat(getDailyFilePath(d));
      return true;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return false;
}
```

---

### WR-09: Monthly orchestrator does not validate `out` path

**File:** `src/commands/report.js:311`
**Issue:** `const outPath = opts.out || getReportFilePath(month);` — when `--out <path>` is supplied, no validation. If the user passes `--out /etc/passwd` (or worse, an arbitrary path inside the vault that the topics writer also targets, like `Tickets/LPD-12345.md`), `writeFile` will overwrite it with the model's monthly report, no warning. CLAUDE.md's "Don't write to topic pages outside `src/core/topics.js`" rule is at risk.

**Fix:** Require `--out` to live under the vault path and end in `.md`, or warn loudly when it doesn't:
```js
const outPath = opts.out ? resolve(opts.out) : getReportFilePath(month);
if (opts.out && !outPath.startsWith(resolve(getVaultPath()) + path.sep)) {
  process.stderr.write(`warn: --out path is outside the vault: ${outPath}\n`);
}
```

---

## Info

### IN-01: Dead-code branch in `metrics.js` status accumulator

**File:** `src/core/metrics.js:30`
**Issue:** `status[s.status in status ? s.status : 'unknown'] += 1;` — `s.status` from `log-parser.js:74` is always one of `completed | interrupted | open | unknown`, all of which are keys in the `status` object. The `'unknown'` fallback branch is unreachable.
**Fix:** Either drop the conditional or assert in the parser that `status` is one of the allowed values; if defensive coding is desired, add a test that exercises the fallback so future parser changes don't silently break the branch.

---

### IN-02: `parseInt(a.slice(1), 10)` in PR sort assumes `#` prefix

**File:** `src/core/metrics.js:53`
**Issue:** `[...prSet].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))` — works because every entry was added as `'#' + digits`, but the dependency on the `#` prefix is implicit. If WR-06 is addressed and entries get a richer shape, this will silently break.
**Fix:** Strip non-digits explicitly: `parseInt(a.replace(/\D/g, ''), 10)`. Or store the numeric value separately.

---

### IN-03: `present` and `dailies` carried but only `dailies` is used downstream in monthly path

**File:** `src/commands/report.js:50-64` (relative to weekly path; monthly does not use `dailies`)
**Issue:** The weekly-path variables `dailies` and `present` are independent but always populated together. Minor code smell — the function would be cleaner with one structure: `const days = []; ... days.push({ dateStr, raw }); ... present = days.map(d => d.dateStr);`.
**Fix:** Consolidate or extract a `loadDailiesInRange(dates)` helper shared with whatever phase 03 introduces.

---

### IN-04: Monthly prompt does not echo the developer's name / role context

**File:** `src/templates/prompts/monthly-report.md:36`
**Issue:** Weekly prompt and monthly prompt both say "for a senior engineer." The repo-wide `CLAUDE.md` makes the persona context explicit (Liferay engineer, ticket schema). Promoting that into the prompt could improve synthesis quality without changing structure.
**Fix:** Optional. Add a one-line audience preamble: "The reader is the developer themself, reviewing what they did this month." Or thread the username/role from vault config.

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
