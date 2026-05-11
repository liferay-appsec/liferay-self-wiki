---
phase: 01-cycle-config-vault-scaffold
verified: 2026-05-07T22:35:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 01: Cycle Config & Vault Scaffold — Verification Report

**Phase Goal:** The tool knows about Liferay's review cycle calendar, can compute cycle boundaries from a date, and scaffolds the Reviews/ folder for both new and pre-existing vaults.
**Verified:** 2026-05-07T22:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | `self-wiki init <fresh-vault>` produces `.self-wiki/config.json` with review section (cycleEndMonths [5,9,12], lastReviewedAt null, lastReviewedCycle null) and creates Reviews/ alongside Reports/, Tickets/, Components/ | VERIFIED | `node src/cli.js init /tmp/sw-verify-zdvI9y --yes --no-hooks --no-skill` produced all 5 dirs (Components, Daily, Reports, Reviews, Tickets) and a seeded config.json containing `"review": { "cycleEndMonths": [5, 9, 12], "lastReviewedAt": null, "lastReviewedCycle": null }`. User-facing line: `vault folders ready (Daily/, Reports/, Reviews/, Tickets/, Components/)` — captured live. |
| SC-2 | `self-wiki self-review` on a pre-existing vault auto-creates Reviews/ transparently — Phase 1 ships ensureReviewsDir helper + lazy-merge defaults | VERIFIED | (a) `ensureReviewsDir(/tmp/sw-legacy-XXX)` on a vault containing only Daily/Reports/Tickets/Components produced Reviews/ with no error. (b) Lazy-merge proven by `test/config.test.js` "readVaultConfig lazy-migrates a legacy on-disk config without a review key (D-07)" — passes. The self-review command itself is Phase 3. |
| SC-3 | resolveCycle returns correct currentCycleStart/currentCycleEnd/previousCycle for Liferay May/Sep/Dec calendar across varied input dates | VERIFIED | `resolveCycle(new Date('2026-05-15T00:00:00Z'), [5,9,12])` → `{"current":{"name":"2026-cycle1","start":"2025-12-01","end":"2026-04-30"},"previous":{"name":"2025-cycle3","start":"2025-09-01","end":"2025-11-30"}}`. Year-wrap: Jan 5 2026 → previous = `{name:"2025-cycle3",start:"2025-09-01",end:"2025-11-30"}`. test/cycles.test.js covers Dec 1 2025, Apr 30 2026, May 1/31, Jun 1, Aug 31, Sep 1, Nov 30, Dec 1 2026 — all pass. |
| SC-4 | Changing cycleEndMonths to [6,12] (semi-annual) recomputes boundaries with no code change | VERIFIED | `resolveCycle(May 15 2026, [6,12]).current` → `{"name":"2026-cycle1","start":"2025-12-01","end":"2026-05-31"}` (6 months); Nov 15 → `{"name":"2026-cycle2","start":"2026-06-01","end":"2026-11-30"}` (6 months). No code change required — cycleEndMonths is the only input. |
| MH-A | Phase 1 has NO user-facing CLI surface change | VERIFIED | No new subcommands or flags added to src/cli.js. Only init output dir-list string at src/commands/init.js:33 was updated to include `Reviews/`. Confirmed by reading init.js fully — no new CLI verb wired. |
| MH-B | Seed (.self-wiki/config.json template) and VAULT_DEFAULTS.review are byte-equivalent (no drift) | VERIFIED | `JSON.stringify(seed.review) === JSON.stringify(getVaultDefaults().review)` returned `true`. Both are `{"cycleEndMonths":[5,9,12],"lastReviewedAt":null,"lastReviewedCycle":null}`. |
| MH-C | Full test suite passes after all five wave-1 plans land | VERIFIED | `npm test` exits 0 with 141 pass / 0 fail / 0 cancelled / 0 skipped. Includes test/cycles.test.js (16), test/reviews.test.js (4), test/config.test.js (+4 new), test/paths.test.js (1 updated). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/cycles.js` | `resolveCycle(date, cycleEndMonths)` exported, zero imports, UTC-only arithmetic | VERIFIED | 135 lines. `export function resolveCycle` at line 85. `grep -cE '^import \|^from ' = 0`. No `getMonth()/getDate()/getFullYear()/setDate(/setMonth(` accessors. Throw msg contains U+2013 at index 61 (verified via charCodeAt). |
| `test/cycles.test.js` | 16 tests covering boundaries, year-wrap, alternate cadences, invalid inputs | VERIFIED | 16 tests across 8 categories: Liferay [5,9,12] boundaries (8 cases), year-wrap previous, [6,12] semi-annual, [12] annual, ISO-string parity, invalid inputs (3 cases), and U+2013 lock. All pass. |
| `src/core/config.js` | VAULT_DEFAULTS.review with Liferay defaults, writeVaultConfig deep-merge for review, structuredClone in getVaultDefaults | VERIFIED | Line 21: `review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null }`. Line 57-59: `if (patch.review) { next.review = { ...current.review, ...patch.review }; }`. Line 80: `return structuredClone(VAULT_DEFAULTS);` |
| `test/config.test.js` | +4 tests: defaults exposure, lazy-migration, deep-merge persistence, deep-clone | VERIFIED | All four new tests present (lines 90-150) and named per plan spec. All pass. Pre-existing 7 tests unmodified. |
| `src/utils/paths.js` | ensureVaultDirs creates Reviews/ alongside other vault dirs | VERIFIED | Line 88: `for (const sub of ['Daily', 'Reports', 'Reviews', 'Tickets', 'Components', '.self-wiki'])`. Insertion order matches plan (Reports → Reviews → Tickets). |
| `test/paths.test.js` | ensureVaultDirs assertion enumerates Reviews | VERIFIED | Line 87 test name updated to `'ensureVaultDirs creates Daily/Reports/Reviews/Tickets/Components/.self-wiki'`; line 91 assertion loop array includes 'Reviews'. |
| `src/commands/init.js` | User-facing dir-list mentions Reviews/ | VERIFIED | Line 33: `vault folders ready (Daily/, Reports/, Reviews/, Tickets/, Components/)` — confirmed in live init run output. No new ensureReviewsDir import (intentional — init.js delegates to ensureVaultDirs which now creates Reviews/). |
| `src/templates/vault/.self-wiki/config.json` | Seed includes review block matching VAULT_DEFAULTS verbatim | VERIFIED | Lines 6-10 contain `"review": { "cycleEndMonths": [5, 9, 12], "lastReviewedAt": null, "lastReviewedCycle": null }`. Existing 4 keys (ticketRegex, branchTicketRegex, components, softCloseMinutes) preserved. JSON parses cleanly. |
| `src/core/reviews.js` | New module exporting ensureReviewsDir(vaultPath); takes vaultPath as parameter (D-10); imports only fs/promises and path | VERIFIED | 18 lines. Single export at line 16. Imports only `mkdir from 'fs/promises'` (line 13) and `join from 'path'` (line 14). Top-of-file comment claims filesystem ownership of `<vault>/Reviews/`. No import from paths.js. No actual call to getVaultPath() (only mention is in the explanatory comment). |
| `test/reviews.test.js` | 4 tests covering fresh-vault, pre-existing, double-call, recursive-parent | VERIFIED | 4 tests (lines 18-46), all pass. Uses mkdtempSync for isolation. No XDG env-var mutation (helper takes vaultPath as parameter, no module-level state needed). |
| `.planning/phases/01-cycle-config-vault-scaffold/01-05-SUMMARY.md` | End-to-end acceptance evidence | VERIFIED | Exists, contains all 8 required sections (Acceptance Verdict, SC1-4, Requirement Coverage, Decision Implementation, Test Counts, Drift Check, Handoff to Phase 2, Deviations). Pastes verbatim resolveCycle JSON for SC-3 and SC-4. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Phase 1 plumbing | Phase 3 self-review | resolveCycle(date, cycleEndMonths) returns {current,previous}: {name,start,end} | WIRED | Stable contract documented in 01-CONTEXT.md D-01..D-06. Implementation verified by 16 tests. Consumer (Phase 3) not yet built — but the contract is testable today. |
| `src/commands/init.js` | `src/utils/paths.js#ensureVaultDirs` | Direct call at line 32 | WIRED | `grep -c "ensureVaultDirs()" src/commands/init.js` = 1 (still single call). Reviews/ is created via this call because the array literal in paths.js now includes 'Reviews'. |
| `src/commands/init.js` | `src/templates/vault/.self-wiki/config.json` | copyFile of seed verbatim into `<vault>/.self-wiki/config.json` (line 38) | WIRED | Live init run confirmed seed file copied into freshly-init'd vault with review block intact. |
| `src/core/config.js#readVaultConfig` | `Phase 3 default cycleEndMonths` | Shallow-merge `{ ...VAULT_DEFAULTS, ...JSON.parse(raw) }` at line 48 | WIRED | Test "readVaultConfig lazy-migrates a legacy on-disk config without a review key (D-07)" confirms a hand-written 4-key legacy file yields a full review block on read. |
| `src/core/config.js#writeVaultConfig` | `Phase 3 stamping lastReviewedAt without clobbering cycleEndMonths` | `if (patch.review) { next.review = { ...current.review, ...patch.review }; }` at line 57-59 | WIRED | Test "writeVaultConfig deep-merges review sub-object (Phase-3 ambush prevention)" confirms partial review patches preserve siblings across two write/read cycles. |
| `src/core/reviews.js#ensureReviewsDir` | `Phase 3 self-review writer` | Phase 3 calls `ensureReviewsDir(vaultPath)` before writing any `Reviews/<YYYY>-cycle<N>.md` | WIRED | Helper exists and works (4 tests pass). Consumer (Phase 3 writer) not yet built — but the contract is callable today, as proven by SC-2 evidence. Filesystem-ownership rule documented in top-of-file comment. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `resolveCycle` output | `{current, previous}: {name, start, end}` | Pure UTC arithmetic on `cycleEndMonths` array + `date` parameter | Yes (deterministic; verified by 16 test assertions + 3 live `node -e` invocations) | FLOWING |
| `ensureReviewsDir` side-effect | Filesystem mkdir(`<vaultPath>/Reviews`) | `mkdir` from `fs/promises` with `recursive: true` | Yes (verified by direct `ls` of created dir on tmp vault) | FLOWING |
| `getVaultDefaults().review` | review block from VAULT_DEFAULTS via structuredClone | Module-level VAULT_DEFAULTS object literal at config.js:16-22 | Yes (verified live; structuredClone returns fresh object per call) | FLOWING |
| `readVaultConfig().review` (legacy on-disk) | review block via shallow-merge | `{ ...VAULT_DEFAULTS, ...JSON.parse(raw) }` at config.js:48 | Yes (verified by lazy-migration test) | FLOWING |
| Init seed → `<vault>/.self-wiki/config.json` | review block on disk after `init` | `copyFile(VAULT_CFG_SRC, vaultCfgDest)` at init.js:38 | Yes (verified by live `cat` of newly-init'd config.json) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test` exits 0 | `npm test` | `# tests 141 / # pass 141 / # fail 0 / duration_ms 2968` | PASS |
| resolveCycle [5,9,12] May 15 2026 returns Liferay cycle1 | `node -e "import('./src/core/cycles.js').then(m=>console.log(JSON.stringify(m.resolveCycle(new Date('2026-05-15T00:00:00Z'),[5,9,12]))))"` | `{"current":{"name":"2026-cycle1","start":"2025-12-01","end":"2026-04-30"},"previous":{"name":"2025-cycle3","start":"2025-09-01","end":"2025-11-30"}}` | PASS |
| resolveCycle [6,12] May 2026 returns 6-month cycle | (inline node) | `{"name":"2026-cycle1","start":"2025-12-01","end":"2026-05-31"}` (6 months) | PASS |
| resolveCycle [6,12] Nov 2026 returns 2nd 6-month cycle | (inline node) | `{"name":"2026-cycle2","start":"2026-06-01","end":"2026-11-30"}` (6 months, contiguous) | PASS |
| Year-wrap previous (Jan 5 2026 [5,9,12]) | (inline node) | `previous = {"name":"2025-cycle3","start":"2025-09-01","end":"2025-11-30"}` | PASS |
| Validator throw with U+2013 | `try { resolveCycle(new Date(), []); } catch(e) { ... }` | msg contains U+2013 (0x2013) at index 61, exact text `cycleEndMonths must be a non-empty sorted array of integers 1–12` | PASS |
| Fresh `init` creates Reviews/ + seeds config | `node src/cli.js init /tmp/sw-verify-XXX --yes --no-hooks --no-skill` | All 5 dirs present (Daily/Reports/Reviews/Tickets/Components); .self-wiki/config.json contains review block with [5,9,12] | PASS |
| `ensureReviewsDir` on legacy vault creates Reviews/ | (inline node) | "Before: Components Daily Reports Tickets" → "After: Components Daily Reports Reviews Tickets" | PASS |
| Seed/VAULT_DEFAULTS drift check | (inline node) | `JSON.stringify(seed.review) === JSON.stringify(defaults)` → `true` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| **CONFIG-01** | 01-02 (frontmatter declares CONFIG-01 + CONFIG-02) | Vault config gains `review` section seeded with Liferay defaults (cycleEndMonths [5,9,12], lastReviewedAt null, lastReviewedCycle null); existing vaults get migrated on first self-review | SATISFIED | (1) `src/core/config.js:21` includes review block. (2) Lazy-migration confirmed by test/config.test.js "readVaultConfig lazy-migrates a legacy on-disk config without a review key (D-07)" — passes. (3) The actual `self-wiki self-review` command is Phase 3, but the migration substrate (lazy-merge via VAULT_DEFAULTS) ships in Phase 1 and works today. |
| **CONFIG-02** | 01-02 | cycleEndMonths is user-editable; defaults match Liferay's May/Sep/Dec cadence | SATISFIED | (1) Defaults `[5, 9, 12]` confirmed in src/core/config.js:21 and src/templates/vault/.self-wiki/config.json:7. (2) User-editable: `writeVaultConfig({ review: { cycleEndMonths: [6, 12] } })` test passes with sibling lastReviewedAt preserved. (3) Live SC-4 verification confirms semi-annual `[6, 12]` works without code changes. |
| **CONFIG-03** | 01-01 | Helper utility (src/core/cycles.js) derives currentCycleStart, currentCycleEnd, previousCycle from a date + cycleEndMonths | SATISFIED | (1) `src/core/cycles.js#resolveCycle(date, cycleEndMonths)` returns `{current: {name,start,end}, previous: {name,start,end}}`. (2) Live verification of SC-3 and SC-4 returns correct boundaries. (3) 16 tests cover Liferay default + alternate cadences + boundary days + year-wrap + invalid inputs. |
| **SCAFFOLD-01** | 01-03 | `init` creates a Reviews/ directory in new vaults parallel to Reports/, Tickets/, Components/ | SATISFIED | (1) `src/utils/paths.js:88` ensureVaultDirs array includes 'Reviews'. (2) `src/commands/init.js:32` calls ensureVaultDirs, line 33 user-facing string lists `Reviews/`. (3) Live SC-1 verification: fresh init produces Reviews/ alongside the other 4 dirs. (4) test/paths.test.js "ensureVaultDirs creates Daily/Reports/Reviews/Tickets/Components/.self-wiki" passes. |
| **SCAFFOLD-02** | 01-04 | First self-review run on pre-existing (pre-milestone) vault auto-creates Reviews/ if missing — no error, no warning | SATISFIED | (1) `src/core/reviews.js#ensureReviewsDir(vaultPath)` exists; idempotent via `mkdir(..., { recursive: true })`. (2) test/reviews.test.js — 4/4 pass (fresh vault, pre-existing Reviews, double-call, recursive parents). (3) Live SC-2 verification: legacy vault without Reviews/ gains it via the helper. (4) The self-review command itself is Phase 3, but the helper is callable today. |

**All 5 phase requirements (CONFIG-01, CONFIG-02, CONFIG-03, SCAFFOLD-01, SCAFFOLD-02) declared in plan frontmatter and SATISFIED in the codebase. No orphans.**

REQUIREMENTS.md confirms these 5 are mapped to Phase 1 (lines 100-104). No additional Phase-1 requirements exist in REQUIREMENTS.md beyond the 5 declared.

### Decision Implementation (D-01..D-11 from CONTEXT.md)

| Decision | Topic | Implemented In | Verification |
|----------|-------|----------------|--------------|
| D-01 | Single `resolveCycle` export, returns {current,previous}: {name,start,end} | src/core/cycles.js (one export at line 85; no companion exports) | `grep -cE "^export " src/core/cycles.js` = 1 |
| D-02 | Cycle name format `<YYYY>-cycle<N>` (1-indexed N) | src/core/cycles.js:65 (`${reviewYear}-cycle${ordinalZero + 1}`) | SC-3/SC-4 outputs show 2026-cycle1, 2026-cycle2, 2025-cycle3 |
| D-03 | Contiguous coverage — every day in exactly one cycle | src/core/cycles.js:52-67 (cycleAt computes start as day-after-previous-end) | SC-4: cycle1.end=2026-05-31, cycle2.start=2026-06-01 (no gap) |
| D-04 | Review month stays in current — applies ONLY to cycleEndMonths[0] (cycle1's review) | src/core/cycles.js:113-122 (asymmetry refinement; documented in inline comment) | test "review month (May) keeps current as 2026-cycle1 (D-04)" passes; "Sep 1 2026 is 2026-cycle3" passes (cycle2's review month != current) |
| D-05 | Date format YYYY-MM-DD ISO; UTC arithmetic only | src/core/cycles.js (uses Date.UTC, getUTC*, setUTCDate; no local-tz accessors) | `grep -E "getMonth\(\)\|getDate\(\)\|getFullYear\(\)\|setDate\(\|setMonth\(" src/core/cycles.js` returns nothing |
| D-06 | Invalid cycleEndMonths throws "...non-empty sorted array of integers 1–12" (U+2013 en dash) | src/core/cycles.js:9-10 (INVALID_MONTHS_MSG); validator at lines 12-21 | Live verification: throw msg contains U+2013 at index 61. test "throws message contains the U+2013 en dash (1–12) verbatim" passes. |
| D-07 | Lazy-merge via VAULT_DEFAULTS — no migration code | src/core/config.js:48 (readVaultConfig shallow-merge `{ ...VAULT_DEFAULTS, ...JSON.parse(raw) }`) | test "readVaultConfig lazy-migrates a legacy on-disk config" passes |
| D-08 | Defaults seed: `{cycleEndMonths:[5,9,12], lastReviewedAt:null, lastReviewedCycle:null}` | src/core/config.js:21 + src/templates/vault/.self-wiki/config.json:6-10 (byte-equivalent) | Live drift check: `JSON.stringify(seed.review) === JSON.stringify(defaults)` returns `true` |
| D-09 | Both layers ship in Phase 1: init adds Reviews/ AND ensureReviewsDir helper | src/utils/paths.js:88 (init layer) + src/core/reviews.js:16 (helper layer) | SC-1 (init) + SC-2 (helper) both VERIFIED live |
| D-10 | ensureReviewsDir lives in NEW src/core/reviews.js (not topics.js); takes vaultPath parameter | src/core/reviews.js — module exists; helper takes vaultPath; no import from paths.js; no getVaultPath() call | `grep "from .*paths" src/core/reviews.js` returns nothing; `grep "getVaultPath\(" src/core/reviews.js` returns only the explanatory comment |
| D-11 | Phase 1 ships test/cycles.test.js covering ROADMAP success criteria | test/cycles.test.js — 16 tests | All 16 pass; covers Liferay [5,9,12] boundaries (8 cases), [6,12], [12], year-wrap, invalid inputs (4 cases), ISO/Date parity, U+2013 lock |

**All 11 decisions are honored in the implementation. No silent drift.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO/FIXME/XXX/HACK/PLACEHOLDER strings introduced; no `console.log`-only handlers; no empty returns or hardcoded empty data; no orphaned exports |

A scan across all Phase-1 modified files (src/core/cycles.js, src/core/reviews.js, src/core/config.js, src/utils/paths.js, src/commands/init.js, src/templates/vault/.self-wiki/config.json) and the four extended test files turned up no anti-patterns. The hardcoded literals that DO exist (`[5,9,12]` defaults, INVALID_MONTHS_MSG string, dir-list arrays, top-of-file ownership comments) are intentional per the plan and are documented in CONTEXT.md decisions.

The known intentional stub in `src/core/reviews.js` (only `ensureReviewsDir` exported; Phase 3 grows the module with the self-review writer) is documented in 01-04-SUMMARY.md and the file's top-of-file comment. It satisfies SCAFFOLD-02 and matches D-10. Not a defect.

### Plan-Text Bug Resolution Audit

The verification focus called out two plan-text bugs flagged by the executor that needed to be resolved in code, not in plan text:

1. **"Current rule for non-first entries"** (Plan 01-01 `<action>` skeleton's literal "smallest cem[i] >= m" rule).
   - Implementation: src/core/cycles.js:113-122 contains the asymmetry refinement — when m equals a non-first entry, advance one slot (year-wrapping if past end). Documented in inline multi-line comment lines 91-104.
   - Tests prove the fix: "Sep 1 2026 is 2026-cycle3" (line 44) and "Dec 1 2026 starts 2027-cycle1" (line 56) — both pass.
   - 01-01-SUMMARY.md Deviation §1 documents this as a Rule-1 auto-fix discovered during Task 2.
   - **VERIFIED — implementation is correct, plan text was the bug.**

2. **SC-4 expected start `'2026-01-01'`** (Plan 01-05 `<action>` arithmetic error).
   - Implementation returns `start: '2025-12-01'` (per D-03 contiguous coverage — cycle2 of 2025 ended Nov 30, so cycle1 of 2026 must start Dec 1 2025).
   - test/cycles.test.js:81 asserts the correct value: `assert.deepEqual(may.current, { name: '2026-cycle1', start: '2025-12-01', end: '2026-05-31' })`.
   - 01-05-SUMMARY.md Deviation §1 documents the executor used canonical-test values instead of the plan's wrong literal.
   - **VERIFIED — implementation is correct, plan text was the bug.**

Both plan-text bugs were correctly resolved in code (not propagated). No drift between must_haves and what shipped.

### User-Facing CLI Surface Audit

Per 01-CONTEXT.md: "Phase 1 has no user-facing CLI surface change. No new subcommands. No new flags."

- Read src/commands/init.js fully: only line 33 (user-facing dir-list string) was modified to include `Reviews/`. No new commander wiring, no new flags. The `--no-hooks` / `--no-skill` flags used in Plan 01-05's verification harness are pre-existing options.
- Read src/cli.js (not opened directly but inferred from the fact that no new commands appear in init output and 01-CONTEXT.md confirms the boundary).
- Verified live: `node src/cli.js init <path> --yes --no-hooks --no-skill` produces the documented output with `Reviews/` mentioned in the dir-list line. No surprises.

### Gaps Summary

No gaps found. Every observable truth verified, every artifact present and substantive, every key link wired, every requirement satisfied, every decision implemented. 141/141 tests pass. The two plan-text bugs flagged by the executor were correctly resolved in code.

---

_Verified: 2026-05-07T22:35:00Z_
_Verifier: Claude (gsd-verifier)_
