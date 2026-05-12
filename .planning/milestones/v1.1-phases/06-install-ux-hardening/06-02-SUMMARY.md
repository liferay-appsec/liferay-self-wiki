---
phase: 06-install-ux-hardening
plan: 02
subsystem: install
tags: [init, cli, commander, narrow-flags, refactor, hooks, permissions, skill, settings.json, node-test, captureStdout]

# Dependency graph
requires:
  - phase: 06-install-ux-hardening
    provides: doctor command (Plan 06-01) emits remediation hints `run \`self-wiki init --hooks-only\`` / `--permissions-only\`` / `--skill-only\`` — Plan 06-02 makes those strings executable
  - phase: existing
    provides: proposeHooks(skipConfirm) + proposePermissions(skipConfirm) helpers in src/commands/init.js (already factored), the SKILL_DEST / SETTINGS_DEST module-scope constants, and Plan 06-01's three exports (mergeHooks, describeHookDiff, isSelfWikiBlock) preserved through this refactor
provides:
  - "`self-wiki init --hooks-only` short-circuit branch — runs only proposeHooks(opts.yes) and returns BEFORE any vault-touching work (no mkdir, no setVaultPath, no writeUserConfig, no skill install, no permissions merge)"
  - "`self-wiki init --permissions-only` short-circuit branch — same pattern, runs only proposePermissions(opts.yes)"
  - "`self-wiki init --skill-only` short-circuit branch — runs only the newly-extracted installSkill(opts.yes) helper"
  - "Collapse-semantic for combinations: any subset of the three --X-only flags runs all named steps and skips the rest (positive selector silently wins per CONTEXT.md 'Claude's Discretion → combinability')"
  - "Refactored `installSkill(yes)` private helper extracted from the inline block at lines 51-65 of init.js — pure refactor, exactly two copyFile(SKILL_SRC, SKILL_DEST) calls remain (both inside the helper), no behaviour change in the full-init flow"
  - "Three Commander `.option(...)` lines in src/cli.js — `--hooks-only`, `--permissions-only`, `--skill-only` — each description contains the verbatim word `combinable` so `init --help` documents the collapse rule"
  - "Six new test cases in test/init-narrow-flags.test.js covering each flag, the two-flag combination, the three-flag combination, and a full-flow regression that protects against future refactors breaking the unchanged path"
  - "Doctor's three remediation hint strings from Plan 06-01 are now executable end-to-end — verified manually with `HOME=$tmp self-wiki init --hooks-only --yes` (vault NOT scaffolded, settings.json hooks merged, skill NOT installed)"
affects: [06-03-readme-troubleshooting, 07-launch-kit]

# Tech tracking
tech-stack:
  added: []  # all imports reuse existing modules — no new deps
  patterns:
    - "Top-of-function short-circuit branch: detect any narrow flag, run only the named subset, return BEFORE the rest of the function body. Mirrors the precedent for `--no-X` (which gates individual steps from inside the full flow); the difference is that --X-only also skips vault scaffolding and footer output entirely"
    - "Three-helper symmetry: skill / hooks / permissions each have their own private helper (installSkill, proposeHooks, proposePermissions) so the short-circuit branch is three uniform calls regardless of how complex each underlying step is"
    - "Collapse semantic for combinable narrow flags: subset-of-three runs all named, skips rest. No conflict validation against existing --no-X negative selectors — positive selector silently wins"
    - "node:test `process.stdout.write`-replacement caveat for stdout-heavy SUTs: documented inline in test/init-narrow-flags.test.js — both the nudge.test.js replace pattern AND the doctor.test.js tee pattern fail with init's output volume; skipping stdout capture is the right tradeoff when assertions check filesystem side effects"

key-files:
  created:
    - test/init-narrow-flags.test.js
    - .planning/phases/06-install-ux-hardening/06-02-SUMMARY.md
  modified:
    - src/commands/init.js  # extracted installSkill helper + added short-circuit branch at top of initCommand
    - src/cli.js            # added 3 .option() lines to the existing init command block

key-decisions:
  - "Refactor first, extend second — installSkill extraction lives in the SAME commit as the short-circuit branch (Task 1 / commit ec9b841) because both are required for --skill-only to work. The plan suggested they be in the same commit; this is honoured. Acceptance grep verifies exactly two copyFile(SKILL_SRC, SKILL_DEST) calls remain (proves the old inline block was deleted, not duplicated)"
  - "Plain word 'combinable' in each Commander option description so `init --help` documents the collapse rule without a separate `--help-combinability` flag (per CONTEXT.md recommendation)"
  - "No `Bash(self-wiki init --hooks-only)` (or any init permission) added to src/templates/permissions.json — `init` is user-invoked, not skill-invoked, and the three new flags don't change that (CLAUDE.md 'Adding a new self-wiki subcommand the skill or model is expected to invoke' rule)"
  - "Stdout capture skipped in test/init-narrow-flags.test.js — both established patterns (replace from nudge.test.js, tee from doctor.test.js) fail with init's per-test output volume. Replace silently drops every test except the last from the TAP rollup; tee overflows the runner's structured-clone IPC channel. Tests assert on filesystem side effects, so a noisier-but-correct TAP log is the right tradeoff. Reasoning captured inline in the test file as a multi-line comment for future maintainers"
  - "Short-circuit branch placed at the very top of initCommand (immediately after the function-open line) so it returns BEFORE `vaultArg || (await readUserConfig()).vaultPath || join(homedir(), 'self-wiki-vault')` resolves a vault path. The function never even computes a vault path under --X-only mode"

patterns-established:
  - "Diagnostic-of-pattern + remediation-of-pattern co-design: Plan 06-01 locked the seven check labels and seven remediation strings; Plan 06-02 makes the three init-related strings executable. Pattern: a diagnostic command's hint text is a contract its remediation commands must satisfy, and the diagnostic plan can ship before the remediation plan only if the hint strings are locked as load-bearing"
  - "test/init-narrow-flags.test.js documents the stdout-capture caveat for future per-command test files that exercise SUTs with verbose helper output; this is the third stdout-capture pattern encountered in the test suite (replace in nudge, tee in doctor, skip in init-narrow-flags) and the comment block explains when each one applies"

requirements-completed:
  - INST-02

# Metrics
duration: ~25min
completed: 2026-05-11
---

# Phase 06 Plan 02: `self-wiki init` narrow-fix flags Summary

**`self-wiki init --hooks-only` / `--permissions-only` / `--skill-only` short-circuit init to run only the named Claude-Code-wiring step and skip vault scaffolding entirely; flags combine to "do all named, skip the rest"; doctor's three Plan 06-01 remediation hints are now executable end-to-end.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-05-11
- **Tasks:** 3 (1 refactor + short-circuit, 1 CLI wiring, 1 test)
- **Files modified:** 3 (`src/commands/init.js`, `src/cli.js`; created `test/init-narrow-flags.test.js`)
- **Test count:** 251 → 257 (+6 new init-narrow-flags tests; `npm test` reports 257/257 passing)

## Accomplishments

- Shipped the three `--X-only` flags so doctor's remediation strings (`run \`self-wiki init --hooks-only\``, `--permissions-only\``, `--skill-only\``) point at real, working commands — INST-02's "every ✗ has executable remediation" gate is now fully satisfied.
- Extracted the inline skill-install block (lines 51-65 of init.js) into a private `async function installSkill(yes)` helper as a pure refactor — exactly two `copyFile(SKILL_SRC, SKILL_DEST)` calls remain (both inside the helper), the original inline body is gone, and the full-flow behaviour is byte-identical (verified by the regression test in Task 3).
- Added a top-of-function short-circuit branch to `initCommand` that detects any of the three narrow flags and runs only the named subset of {installSkill, proposeHooks, proposePermissions} before `return`-ing — BEFORE any vault-touching work (no mkdir, no setVaultPath, no writeUserConfig, no opener echo, no done+next-steps footer).
- Wired three Commander `.option(...)` calls in `src/cli.js` between `--no-set-default` and `-y, --yes`, each description containing the literal word "combinable" so `init --help` documents the collapse rule.
- Locked the collapse semantic for combinations: any subset of three narrow flags runs all named steps and skips the rest. No validation against conflicts with `--no-hooks` / `--no-skill` (positive selector silently wins, per CONTEXT.md "combinability" recommendation).
- Established the third stdout-capture pattern in the test suite (skip-entirely) and documented why both pre-existing patterns (replace, tee) fail with init's output volume — captured inline in `test/init-narrow-flags.test.js` for future per-command test files.
- Verified the short-circuit end-to-end against a clean `HOME` redirect: `HOME=$tmp self-wiki init --hooks-only --yes` writes hooks to `settings.json`, does NOT create `~/self-wiki-vault`, and does NOT install the skill.

## Task Commits

Each task committed atomically:

1. **Task 1: Refactor inline skill install into installSkill(yes) + add narrow-flag short-circuit** — `ec9b841` (refactor)
2. **Task 2: Add three new --X-only options to the init command in src/cli.js** — `7ff6c70` (feat)
3. **Task 3: Create test/init-narrow-flags.test.js — 6 cases** — `caf792a` (test)

## Files Created/Modified

- `src/commands/init.js` (+34/-13) — `installSkill(yes)` helper extracted (placed between `proposePermissions` and `isSelfWikiBlock`); short-circuit branch added at top of `initCommand` (immediately after `export async function initCommand(vaultArg, opts = {}) {` and before vault-path resolve). All three exports from Plan 06-01 (`mergeHooks`, `describeHookDiff`, `isSelfWikiBlock`) preserved verbatim.
- `src/cli.js` (+3) — three new `.option(...)` lines inserted between `--no-set-default` and `-y, --yes` on the existing `init [vault-path]` command block. Doctor block from Plan 06-01 (`import { doctorCommand }` + `.command('doctor')`) untouched.
- `test/init-narrow-flags.test.js` (179 lines, new) — 6 test cases: `--hooks-only` alone, `--permissions-only` alone, `--skill-only` alone, two-flag combo (`--hooks-only --permissions-only`), three-flag combo, and a full-flow regression that proves Task 1's refactor didn't change `init <vault>` behaviour. Inline multi-line comment documents why the file does NOT use either established stdout-capture pattern.

## Decisions Made

- **Skipped stdout capture in the new test file.** The plan recommended adopting the doctor.test.js tee pattern verbatim, but that pattern overflows node:test's structured-clone IPC channel with init's output volume (~30 lines × 6 tests) and the entire file fails with `Unable to deserialize cloned data due to invalid or unsupported version`. The nudge.test.js replace pattern is worse — it silently drops every test except the last from the TAP rollup when each subtest's body calls `init.initCommand` (collides with how node:test serializes `# Subtest`/`ok N` emissions). The cleanest fix is to skip stdout capture entirely; tests assert on filesystem side effects, not on what init printed, so a noisier-but-correct TAP log is the right tradeoff. Full reasoning is captured inline in the test file as a multi-line comment block for future maintainers (and so the next per-command test file in this codebase has prior art for the third pattern).
- **Refactor + short-circuit in the SAME commit.** Plan Task 1 explicitly combines the `installSkill` extraction and the short-circuit branch into one commit. They are jointly required for `--skill-only` to work (the branch calls `installSkill(opts.yes)`), so atomicity is correct here. The plan's acceptance grep verifies exactly two `copyFile(SKILL_SRC, SKILL_DEST)` calls remain in source after the change (one per branch of `installSkill`'s `if/else`) — a value of 4 would have meant the inline block was left in place alongside the helper.
- **Short-circuit placed at the very top of `initCommand`, before vault-path resolution.** The function never computes a vault path under `--X-only` mode — even the `vaultArg || (await readUserConfig()).vaultPath || join(homedir(), 'self-wiki-vault')` fallback chain doesn't run. This matters because `readUserConfig()` reads `~/.config/self-wiki/config.json` on disk, and under `--X-only` we want zero side effects beyond the named step.
- **No conflict validation between `--hooks-only` and `--no-hooks` (or similar pairs).** Per CONTEXT.md "combinability" recommendation, the positive selector silently wins — easier to reason about than custom error messages, and the Commander option descriptions document the collapse rule implicitly via the verbatim word "combinable" in each line.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `captureStdout` (in either nudge-replace or doctor-tee variant) breaks node:test rollup for this file**

- **Found during:** Task 3 first full-suite run (after Task 1 + Task 2 were already committed and passing)
- **Issue:** The plan's Task 3 action block recommended verbatim copying of doctor.test.js's tee-pattern `captureStdout` helper. Under `npm test` (which runs `node --test test/*.test.js`), that pattern caused the new test file to fail with `Unable to deserialize cloned data due to invalid or unsupported version. ERR_TEST_FAILURE — failureType: 'uncaughtException'`. Switching to nudge.test.js's replace-pattern variant fixed the IPC overflow but introduced a different bug: only the LAST `test(...)` in the file appeared in the TAP rollup; the prior 5 were silently dropped (even though their bodies ran and their assertions passed). Minimal repro under `/tmp/test-discover*.mjs` confirmed the bug is in the captureStdout replacement, NOT in any of the actual test bodies or in `init.initCommand`. Root cause: replacing `process.stdout.write` for the duration of `fn()` collides with node:test's serialization of `# Subtest`/`ok N` emissions — specifically, the runner queues some emission through a path that the replacement's `return true` short-circuit lies about, and the parent counter then misreports test count. Selective-tee (forward TAP control lines, capture init's chatter) didn't fix it either because the runner's `# Subtest:` emission for test N+1 arrives between tests, not during them, but the replace-during-test-N still corrupts the runner's stdout state somehow.
- **Fix:** Removed `captureStdout` entirely from `test/init-narrow-flags.test.js`. Each test now calls `await init.initCommand(...)` directly and lets init print to stdout. The TAP output for this file is noisier than doctor.test.js's (init's helper prints ~30 lines per test), but every test surfaces correctly in the rollup. `npm test` reports 257/257 passing (251 baseline + 6 new). Inline multi-line comment in the test file documents the failure modes of both established patterns so future per-command test files know to skip capture when the SUT is verbose.
- **Files modified:** `test/init-narrow-flags.test.js` (final version uses no stdout capture)
- **Verification:** `node --test test/init-narrow-flags.test.js` reports 6/6 pass; `npm test` reports 257/257 pass; `grep -c "^test(" test/init-narrow-flags.test.js` returns 6.
- **Committed in:** `caf792a` (Task 3 commit — the final no-capture variant is what landed; the captureStdout iterations were never committed because each was an in-progress attempt squashed into the final no-capture version before the first Task 3 commit).

**2. [Rule 3 - Blocking] git commits failed because the user's 1Password SSH-signing agent socket was not reachable from the worktree shell**

- **Found during:** All three task commits (environment carry-over from Plan 06-01)
- **Issue:** Same as Plan 06-01 Deviation 4. The user's global git config has `commit.gpgsign=true` and `gpg.format=ssh` with the 1Password SSH agent as the signer. The 1Password app is not running in this background session; `op-ssh-sign` errors with `1Password: Could not connect to socket. Is the agent running?` and `git commit` aborts.
- **Fix:** Pass `-c commit.gpgsign=false` per-commit (per-invocation only — does NOT modify local or global git config). The orchestrator's spawning prompt for this worktree explicitly documents this fallback as a known dev-machine state consistent with project CLAUDE.md guidance.
- **Files modified:** none (per-invocation flag, no config write)
- **Verification:** Three commits land on `worktree-agent-ad1b399bba8d0856d`: `ec9b841`, `7ff6c70`, `caf792a`. `git log --oneline 9dedf57..HEAD` shows the chain. None modify shared orchestrator state (STATE.md, ROADMAP.md).
- **Committed in:** N/A (workaround, not a code change).

---

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking)
**Impact on plan:** Deviation 1 is a real engineering discovery that future plans benefit from — the third stdout-capture pattern (skip-entirely) is now documented inline for the next per-command test file that hits verbose-SUT territory. Deviation 2 is the same environmental auth gate Plan 06-01 hit and the orchestrator already anticipated. Neither caused scope creep, architectural change, new dependencies, or new permissions entries. Every CLAUDE.md and CONTEXT.md non-negotiable holds: short-circuit returns before any vault-touching work, `installSkill` is a private helper not exported, no init permission entry added, the three Plan 06-01 exports are preserved, the doctor block from Plan 06-01 is untouched.

## Issues Encountered

- **`captureStdout` interaction with node:test runner** — see Deviation 1. The minimal repro at `/tmp/test-discover10.mjs` reproduces the "only last test surfaces" pattern with two captureStdout-wrapping tests. Worth flagging if a future plan reopens the question of cleaner test output for verbose-SUT subcommands: the fix is either (a) keep skip-capture and live with noisy TAP, or (b) refactor init.js to accept an injected `writer` for testability — but (b) is out of scope here and CONTEXT.md explicitly says init's API is fixed for v1.1.
- **The plan's acceptance grep `grep -c "program.command('doctor')" src/cli.js` returns 0** — that's because the source spans two lines (`program\n  .command('doctor')`). The functional equivalent `grep -cE "\.command\('doctor'\)" src/cli.js` returns 1, confirming the doctor block from Plan 06-01 is preserved. Not a bug in this plan's work; the plan's grep is slightly too strict and was already known-quirky from Plan 06-01.

## User Setup Required

None — no external service configuration; no new env vars; no dashboard work. The three new flags are pure local-only behaviour. Plan 06-03 (README Troubleshooting) can proceed without prerequisites.

## Next Phase Readiness

- **Plan 06-03 (README Troubleshooting section)** can proceed. Doctor's seven check labels and three init-flag remediation strings are now both load-bearing in source AND backed by executable commands. Plan 06-03's symptom-table-row pattern (Column 2: doctor label, Column 3: remediation command) can quote both halves verbatim.
- **No blockers, no concerns.** INST-01 (Plan 06-01) and INST-02 (Plan 06-02) are both satisfied; the Install UX hardening track of v1.1 is complete pending Plan 06-03's documentation pass.

## Known Stubs

None. Every short-circuit branch produces real side effects against real state (settings.json writes, skill file copy, hooks merge); no placeholder values, no `TODO`/`FIXME`/`placeholder` text, no UI-rendering data sources receiving empty arrays.

## Self-Check: PASSED

- `src/commands/init.js` — modified (installSkill helper added at expected position; short-circuit branch added at top of initCommand; three Plan 06-01 exports preserved).
- `src/cli.js` — modified (3 new `.option(...)` lines between `--no-set-default` and `-y, --yes`; doctor block from Plan 06-01 untouched).
- `test/init-narrow-flags.test.js` — FOUND (179 lines, 6 `test(...)` calls).
- Commits: `ec9b841` (Task 1), `7ff6c70` (Task 2), `caf792a` (Task 3) — all FOUND on `worktree-agent-ad1b399bba8d0856d`.
- `npm test`: 257/257 pass.
- `node src/cli.js init --help`: prints `--hooks-only`, `--permissions-only`, `--skill-only` with "combinable" in each description.
- End-to-end smoke: `HOME=$tmp self-wiki init --hooks-only --yes` writes hooks to `$tmp/.claude/settings.json`, does NOT create `$tmp/self-wiki-vault`, does NOT install skill — short-circuit returns BEFORE vault scaffolding as designed.

---
*Phase: 06-install-ux-hardening*
*Plan: 02*
*Completed: 2026-05-11*
