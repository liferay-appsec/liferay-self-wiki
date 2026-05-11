---
phase: 03
slug: self-review-report
status: verified
threats_open: 0
threats_total: 21
threats_closed: 21
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-05-11
verified: 2026-05-11
verifier: gsd-security-auditor
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implementation by `gsd-security-auditor` on 2026-05-11. All 21 plan-time threats are CLOSED.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| user→CLI | All Commander options are user input; mutex validation rejects conflicting flags before any I/O | flag values (`--since` ISO date, `--cycle YYYY-cycleN`, `--prior-review <path>`, `--out <path>`, `--force`, `--dry-run`, `--last-cycle`) |
| caller→helpers | `getReviewFilePath` joins under vault `Reviews/`; `monthsInRange` parses ISO dates strictly | cycleName string (caller-validated), ISO date range |
| user→manualPath | `--prior-review <path>` reads any file the user can read (OS perms); body fed to prompt only | local filesystem bytes |
| vault→prompt | Topic-page bodies + monthlies + weeklies + optional prior-review concatenated into prompt envelope | user-authored markdown (treated as untrusted by the prompt rule) |
| prompt→model | `claudeHeadless` invokes `claude -p` as a subprocess; stdin is the assembled envelope | prompt text |
| filesystem→writer | Writes confined to `<vault>/Reviews/<cycleName>.md`; CR-01 fix adds O_EXCL + per-cycle dot-lock | review draft markdown |
| user→writeVaultConfig | Success writeback patches `review.lastReviewedAt` + `review.lastReviewedCycle` via deep-merge | vault config JSON patch |
| selfReview→reportMonth | Cross-module subprocess-coordination boundary; outer `hasClaudeCli` gate prevents partial-state cascade | month strings; internal:true contract |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|------------------------|--------|
| T-03-01-01 | Tampering | `src/core/cycles.js` | accept | Git history preserves broken-semantic + fix-semantic blocks; corrigendum docs name the change | closed |
| T-03-01-02 | Info Disclosure | corrigendum docs | accept | `.planning/PROJECT.md` + Phase 1 `CONTEXT.md` are checked-in design docs; no secrets | closed |
| T-03-01-03 | Repudiation | `cycleEndMonths` semantic change | accept | `src/core/cycles.js:58-71` carries Option B + D-PREREQ rationale; recoverable from doc tree | closed |
| T-03-02-01 | Tampering | `getReviewFilePath` path traversal | mitigate | `src/utils/paths.js:58-60` dumb-joins; callers validate via `parseCycleName` (`src/core/reviews.js:49-81`, strict regex `^(\d{4})-cycle(\d+)$` + round-trip vs `resolveCycle`) | closed |
| T-03-02-02 | Info Disclosure | `monthsInRange` | accept | `src/utils/format.js:156-172` pure UTC arithmetic; `parseISODate` :122-141 round-trip rejects Feb-30 etc. | closed |
| T-03-03-01 | Spoofing/Tampering | prompt body | mitigate | `src/templates/prompts/self-review.md:57` carries verbatim untrusted-data line naming all 5 vars (MONTHLIES, WEEKLIES, TOPIC_PAGES, PRIOR_GROWTH_FOCUS, PRIOR_REVIEW); locked by `test/self-review.test.js:501-504` | closed |
| T-03-03-02 | Info Disclosure | `--prior-review` body | accept | `src/core/reviews.js:205-214` reads user-supplied path; soft-fails on read error; no network | closed |
| T-03-04-01 | Info Disclosure | `loadPriorCycleReview` manual path | mitigate | `src/core/reviews.js:205-232` OS-perm-bounded `readFile`; feeds prompt only | closed |
| T-03-04-02 | Tampering | `parseCycleName` | mitigate | `src/core/reviews.js:49-81` strict regex + round-trip reject (`r.current.name !== cycleName`) | closed |
| T-03-04-03 | Spoofing | prompt-injection via topic-page bodies | accept | Inherited from monthly; defense-in-depth via T-03-03-01 untrusted-data rule | closed |
| T-03-04-04 | Tampering | `resolveReviewWindow` precedence | mitigate | `src/core/reviews.js:109-156` explicit 5-tier ladder; 9 precedence tests in `test/reviews.test.js` | closed |
| T-03-05-01 | Tampering | refuse-without-force gate (+ CR-01 TOCTOU) | mitigate | Fast-path refuse `src/core/reviews.js:505-515` with `git restore` hint; race-safe write `:776` (flag `wx`/O_EXCL); per-cycle dot-lock `:530-547`; `finally` cleanup `:809-816` (commit 249bff6) | closed |
| T-03-05-02 | Info Disclosure | `--out` outside vault | mitigate | `resolveOutPath` `src/core/reviews.js:407-420`; WR-06 rejects `r === vaultRoot` `:412-415` (commit 675a574); startsWith check warns stderr for other outside-vault paths | closed |
| T-03-05-03 | DoS | claude subprocess hang | accept | Inherited from `src/core/claude.js:6` `DEFAULT_HEADLESS_TIMEOUT_MS = 5 * 60 * 1000` + SIGTERM/SIGKILL grace `:10-18` | closed |
| T-03-05-04 | EoP | `permissions.json` wildcard | mitigate | `src/templates/permissions.json:12-13` `Bash(self-wiki self-review *)` is argv-scoped (Claude Code permission glob); CLI validates `--since` regex `^\d{4}-\d{2}-\d{2}$` (`src/commands/self-review.js:42-45`) and `--cycle` via `parseCycleName` | closed |
| T-03-05-05 | Tampering | vault-config writeback | mitigate | `src/core/config.js:54-64` `writeVaultConfig` deep-merges `review` only; `src/core/reviews.js:802-807` patches only `lastReviewedAt`/`lastReviewedCycle`; `test/self-review.test.js:517-525` asserts `cycleEndMonths` not in patch | closed |
| T-03-06-01 | Tampering | partial-state on cascade crash | mitigate | Hoisted `hasClaudeCli` gate `src/core/reviews.js:598` runs BEFORE cascade loop `:651-663`; per-iteration `try/catch` `:653-662` logs + continues | closed |
| T-03-06-02 | DoS | runaway cascade | accept | Preflight summary `src/core/reviews.js:570-586` surfaces invocation count; user Ctrl-C | closed |
| T-03-06-03 | Repudiation | cascade ordering | accept | Calendar order from `monthsInRange` `:556`; per-failure stderr `:661` | closed |
| T-03-06-04 | Info Disclosure | preflight summary | accept | `:575-585` vault-relative paths + month strings only; no PII | closed |
| T-03-07-01 | Info Disclosure | acceptance log | accept | User-authored template requests paths/counts only | closed |
| T-03-07-02 | Tampering | structural-guard tests | mitigate | `test/self-review.test.js:501-509` (prompt invariants), `:517-525` (writeback patch shape), `:527-538` (writeback ordering); `test/reviews.test.js:289-308` (envelope order) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-01-01,02,03 | Doc-only corrigendum; git is the audit trail; no executable surface | gsd-planner (Phase 03-01) | 2026-05-08 |
| AR-03-02 | T-03-02-02 | `monthsInRange` is pure UTC arithmetic with no I/O | gsd-planner (Phase 03-02) | 2026-05-09 |
| AR-03-03 | T-03-03-02 | `--prior-review` reads files the user already controls; subprocess is user-authorized | gsd-planner (Phase 03-03) | 2026-05-09 |
| AR-03-04 | T-03-04-03 | Prompt-injection via topic-page bodies is inherited from monthly path; untrusted-data rule mitigates structurally | gsd-planner (Phase 03-04) | 2026-05-10 |
| AR-03-05 | T-03-05-03 | claude subprocess hang inherited from upstream timeout (5min) + user-interruptible | gsd-planner (Phase 03-05) | 2026-05-10 |
| AR-03-06 | T-03-06-02 | Cascade DoS surface (~20 claude calls on fresh 4-month cycle) surfaced by preflight; user-interruptible | gsd-planner (Phase 03-06) | 2026-05-10 |
| AR-03-07 | T-03-06-03 | Cascade ordering is deterministic (calendar) + per-failure stderr preserves audit trail | gsd-planner (Phase 03-06) | 2026-05-10 |
| AR-03-08 | T-03-06-04 | Preflight summary lists user-vault paths only; no PII | gsd-planner (Phase 03-06) | 2026-05-10 |
| AR-03-09 | T-03-07-01 | Acceptance log is user-authored; template asks for paths/counts, not body content | gsd-planner (Phase 03-07) | 2026-05-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Defense-in-Depth (Gap-Closure Verification)

The phase's executor surfaced 1 BLOCKER + 6 warnings in `03-REVIEW.md`; all have landed on `main` as defense-in-depth strengthening existing mitigations (no new attack surface introduced):

| Commit | Item | Threat strengthened | Evidence |
|--------|------|---------------------|----------|
| 249bff6 | CR-01 + WR-01 | T-03-05-01 | `src/core/reviews.js:530-547` dot-lock; `:776` `wx` flag; `:778-794` EEXIST race-refuse with lock cleanup |
| 8ce967b | WR-02 | input validation | `src/core/cycles.js:23-35` rejects Invalid Date via NaN-getTime guard |
| cfb8f8e | WR-04 | data-quality / WINDOW_NOTE | `src/core/reviews.js:616-628` + `:714-725` surface missing in-cycle weeklies |
| f80d3c1 | WR-05 | mutex predicate tightening | `src/commands/self-review.js:29-37` explicit-type windowFlags |
| 675a574 | WR-06 | T-03-05-02 | `src/core/reviews.js:412-415` reject `--out === vaultRoot` exit-1 |

WR-03 (`--dry-run` creates `Reviews/`) was accepted as idempotent and matching `ensureReviewsDir` semantics.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-11 | 21 | 21 | 0 | gsd-security-auditor (ASVS L1, block_on: high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-11
