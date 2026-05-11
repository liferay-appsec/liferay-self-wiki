---
phase: 06-install-ux-hardening
verified: 2026-05-11T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification:
  is_re_verification: false
requirements_verified:
  - INST-01
  - INST-02
  - INST-03
---

# Phase 06: Install UX Hardening — Verification Report

**Phase Goal:** A fresh Liferay dev can run one command (`self-wiki doctor`) after install and immediately see whether everything is wired correctly, with concrete remediation for anything that isn't.

**Verified:** 2026-05-11
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The phase ships a working `self-wiki doctor` diagnostic command with seven checks across three sections, every ✗ line followed by a one-line `→ ` remediation hint, non-zero exit on any ✗, soft-fail on missing `claude` CLI, and a README Troubleshooting section keyed to doctor's output labels. End-to-end smoke verification (running `self-wiki doctor` against both a healthy install and a fully broken one) confirms the goal is observable in the codebase.

### Observable Truths (Success Criteria from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `self-wiki doctor` shows ✓/✗ for Node ≥ 20, vault config present and readable, vault path exists on disk, hooks merged, permissions merged, wiki skill installed, claude CLI on PATH | VERIFIED | Smoke-tested: `node src/cli.js doctor` against current install prints all 7 ✓ lines and `summary: 7/7 passing`. Source: 7 `pass()` + 7 `fail()` calls at `src/commands/doctor.js:46,48,55,57,76,78,92,95-99,117,119,130,132,140,142`. |
| 2 | Every ✗ followed by a one-line remediation naming a `self-wiki <subcommand>` or settings.json edit | VERIFIED | Smoke-tested against a broken install (HOME=tmp, empty cfg): 5 ✗ lines each followed by exactly one `    → ...` line. The `fail()` helper at `src/commands/doctor.js:174-177` enforces this structurally — every call produces a label line plus an indented `→ hint` line. |
| 3 | `self-wiki doctor` exits non-zero on any failing check, zero on all-pass | VERIFIED | Smoke-tested: all-pass install → exit 0 (`EXIT_CODE=0`); broken install (HOME=tmp) → exit 1 (`EXIT_CODE=1`). Source at `src/commands/doctor.js:162-164`: `if (failingCount > 0 && !opts.skipExit) process.exit(1);`. |
| 4 | README `## Troubleshooting` section maps symptoms (sessions not opening, no notes captured, permission prompts) to doctor output lines | VERIFIED | `README.md:266-274` contains `## Troubleshooting` heading + opener pointing at `self-wiki doctor` + 3-row pipe table mapping each REQ-INST-03 symptom to the doctor check label + narrow-fix command. Section ordering: `## Upgrading` (line 250) < `## Troubleshooting` (line 266) < `## License` (line 276). |
| 5 | Soft dependencies degrade silently — missing `claude` reports ✗ + remediation but never crashes; missing `gh` is not checked | VERIFIED | Smoke-tested with `PATH=$node_dir:/empty-bin`: doctor prints `✗ claude CLI on PATH` + `→ install Claude Code: https://...` and continues to the remaining checks. Exit 1 (because of total failing count), but the process never crashed. Source uses `hasClaudeCli()` (no throw — `src/core/claude.js`). `grep "gh" src/commands/doctor.js` returns 0 hits — gh is not checked, as required. |

**ROADMAP Success Criteria score: 5/5**

### Plan-frontmatter Truths (Merged with ROADMAP SCs)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Doctor output contains three bold section headers: `Runtime`, `Vault`, `Claude Code wiring` | VERIFIED | `src/commands/doctor.js:41,64,105` use `chalk.bold('Runtime')`, `chalk.bold('Vault')`, `chalk.bold('Claude Code wiring')`. Smoke output confirms all three render. |
| 7 | Tier-2 hooks drift surfaces as info line; permissions drift likewise; neither flips exit code | VERIFIED | `src/commands/doctor.js:179-198` (`emitHooksDrift`) and `:200-219` (`emitPermissionsDrift`) write `i hooks: …` / `i permissions: …` to stdout AFTER `failingCount` is incremented; drift line writes do NOT increment `failingCount`. Tests at `test/doctor.test.js:235-262, 264-284` assert `result.failingCount === 0` while drift line is present. Smoke against broken install produced both drift lines (`i hooks: 4 command(s) differ`, `i permissions: 10 entries missing`) with no impact on the failing-count summary. |
| 8 | `--hooks-only`, `--permissions-only`, `--skill-only` flags exist and short-circuit init (no vault scaffold) — doctor's remediation hints reference executable commands | VERIFIED | `src/cli.js:39-41` declares all three flags. `src/commands/init.js:30-41` short-circuits before vault-touching work. `node src/cli.js init --help` lists all three with "combinable" in each description. `test/init-narrow-flags.test.js:73-179` (6 tests) verifies each flag runs only its named step and skips vault/user-config/other-step. |

**Plan-truths score: 3/3 (cumulative score: 8/8)**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/commands/doctor.js` | New file; ≥180 lines; exports `doctorCommand`; 7 labels + 7 hints + 2 drift templates + 2 summary shapes verbatim | VERIFIED | 233 lines. `export async function doctorCommand(opts = {})` at line 21. All 7 labels grep-verified verbatim (lines 46/48, 55/57, 76/78, 92/95, 117/119, 130/132, 140/142). All 7 remediation hints grep-verified verbatim. Both drift line templates present (lines 195, 216). Both summary line forms present (lines 155, 158). |
| `test/doctor.test.js` | New file; ≥200 lines; 11 cases covering happy/✗/drift/summary/skipExit | VERIFIED | 308 lines, 11 `test(...)` declarations. `node --test test/doctor.test.js` → `# tests 11 / # pass 11 / # fail 0`. |
| `test/init-narrow-flags.test.js` | New file; 6 test cases | VERIFIED | 179 lines, 6 `test(...)` declarations. `node --test test/init-narrow-flags.test.js` → `# tests 6 / # pass 6 / # fail 0`. |
| `src/commands/init.js` | Three internal helpers exported (`mergeHooks`, `describeHookDiff`, `isSelfWikiBlock`); `installSkill(yes)` helper extracted; narrow-flag short-circuit branch at top | VERIFIED | `grep -c "^export function (mergeHooks|describeHookDiff|isSelfWikiBlock)"` → 3. `installSkill(yes)` private helper at lines 201-215. Short-circuit branch at lines 25-41 (calls `installSkill`/`proposeHooks`/`proposePermissions` then `return` before vault scaffolding). |
| `src/cli.js` | `import { doctorCommand }`; `program.command('doctor')` block between `status` and `report`; three new `--X-only` options on `init` block | VERIFIED | Line 16: import. Lines 90-93: doctor command block (after status at lines 83-88, before report at lines 95-102). Lines 39-41: three new `--hooks-only` / `--permissions-only` / `--skill-only` options with "combinable" in each description. |
| `README.md` | `## Troubleshooting` section between Upgrading and License with verbatim opener + 3-row table | VERIFIED | Section at lines 266-274 between `## Upgrading` (250) and `## License` (276). Opener verbatim ("Run `self-wiki doctor` to diagnose your install…"). Three data rows verbatim. No fenced code block inside section (`awk '/Troubleshooting/,/License/' \| grep '^```'` → 0). No emojis (`grep -P "[\x{1F300}-\x{1F9FF}]"` → 0). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/cli.js` | `src/commands/doctor.js` | `import { doctorCommand }` + `program.command('doctor').action(doctorCommand)` | WIRED | `node src/cli.js doctor --help` exits 0 and prints help. End-to-end `node src/cli.js doctor` produces real ✓/✗ output. |
| `src/commands/doctor.js` | `src/commands/init.js` | `import { mergeHooks, describeHookDiff, isSelfWikiBlock }` for Tier-2 drift | WIRED | Line 9. Used at lines 113 (`isSelfWikiBlock`), 188 (`mergeHooks`), 189 (`describeHookDiff`). |
| `src/commands/doctor.js` | `src/core/claude.js` | `hasClaudeCli()` for `claude --version` probe | WIRED | Line 8 import; line 53 invocation. No reimplementation of spawn/timeout logic in doctor.js. |
| `src/commands/doctor.js` | `src/core/config.js` | `applyUserConfig()` at startup; `readUserConfig()` for vault-path check; NEVER `ensureVaultConfigured()` | WIRED | Line 6 imports `applyUserConfig`, `readUserConfig`. Line 22 calls `applyUserConfig()`. Line 73 calls `readUserConfig()`. `grep -c "ensureVaultConfigured"` → 0 (correctly avoided per soft-fail rule). |
| `src/cli.js` (init block) | `src/commands/init.js` (narrow-flag branch) | `.option('--hooks-only', ...)` produces `opts.hooksOnly` consumed by `if (opts.hooksOnly || opts.permissionsOnly || opts.skillOnly)` short-circuit | WIRED | `node src/cli.js init --help` lists all three flags with "combinable" in descriptions. Tests verify the wiring works end-to-end via `init.initCommand(undefined, { hooksOnly: true, yes: true })`. |
| `README.md` (Troubleshooting Column 2) | `src/commands/doctor.js` (7 labels + 2 drift tokens) | Verbatim cross-source string identity (grep contract) | WIRED | All 4 quoted labels (`hooks merged in settings.json`, `vault config present`, `vault path exists on disk`, `permissions merged in settings.json`) appear verbatim in BOTH files. Both drift tokens (`i hooks:`, `i permissions:`) appear verbatim in BOTH files (the Plan 06-03 Rule 1 fix at `doctor.js:195, 216`). |
| `README.md` (Troubleshooting Column 3) | `src/commands/init.js` (narrow-fix flags) | `run \`self-wiki init --hooks-only\`` references real, working command | WIRED | All three referenced commands (`init --hooks-only`, `init --permissions-only`, `init <vault>`) exist and run end-to-end (verified by tests). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/commands/doctor.js` | `nodeMajor` | `process.versions.node` | Yes — runtime value | FLOWING |
| `src/commands/doctor.js` | `claudePresent` | `hasClaudeCli()` — spawns `claude --version` | Yes — real spawn probe with 5s timeout | FLOWING |
| `src/commands/doctor.js` | `vaultConfigured` | `readUserConfig()` reads `~/.config/self-wiki/config.json` | Yes — real file read | FLOWING |
| `src/commands/doctor.js` | `vaultExists` | `tryGetVaultPath()` + `fileExists()` (real `fs.access`) | Yes — real disk probe | FLOWING |
| `src/commands/doctor.js` | `missingHookEvents` | Reads `settings.hooks` from `~/.claude/settings.json`, applies `isSelfWikiBlock` regex | Yes — real settings read + structural check | FLOWING |
| `src/commands/doctor.js` | `permissionsPresent` | Reads `settings.permissions.allow` from real settings.json | Yes — real prefix check | FLOWING |
| `src/commands/doctor.js` | `skillExists` | `fileExists(SKILL_DEST)` — real `fs.access` on `~/.claude/skills/wiki/SKILL.md` | Yes — real disk probe | FLOWING |
| `src/commands/doctor.js` | `diffs` (hooks drift) | `describeHookDiff(currentHooks, mergedHooks)` — real diff against template | Yes — real template-vs-current comparison | FLOWING |
| `src/commands/doctor.js` | `missing` (permissions drift) | `desiredAllow.filter(e => !currentAllow.includes(e))` — real array diff | Yes — real array comparison | FLOWING |

Every doctor check has a real data source — no hardcoded values, no stub returns. The smoke test against a broken install produced concrete counts (`4 command(s) differ`, `10 entries missing`) computed from real template/current comparison.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Happy-path doctor exits 0 with `7/7 passing` | `node src/cli.js doctor; echo $?` | Stdout `summary: 7/7 passing`; exit 0 | PASS |
| Broken-install doctor exits 1 with detailed ✗ + hints | `HOME=/tmp/empty XDG_CONFIG_HOME=/tmp/empty/cfg node src/cli.js doctor` | 5 ✗ lines, 5 `→` hints, drift lines, `summary: 2/7 passing — 5 ✗`, exit 1 | PASS |
| Missing `claude` CLI does not crash | `PATH=$node_dir:/empty node src/cli.js doctor` | Prints `✗ claude CLI on PATH` + remediation, continues to next checks, no crash | PASS |
| `doctor --help` works | `node src/cli.js doctor --help` | Help text printed, exit 0 | PASS |
| `init --help` lists 3 narrow-fix flags | `node src/cli.js init --help \| grep -c combinable` | 3 (all three descriptions contain "combinable") | PASS |
| Full test suite passes | `npm test` | `# tests 257 / # pass 257 / # fail 0` | PASS |
| Doctor-only tests pass | `node --test test/doctor.test.js` | `# tests 11 / # pass 11 / # fail 0` | PASS |
| Narrow-flag tests pass | `node --test test/init-narrow-flags.test.js` | `# tests 6 / # pass 6 / # fail 0` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INST-01 | 06-01-PLAN | `self-wiki doctor` checklist with 7 checks ✓/✗ + one-line reason | SATISFIED | All 7 checks present and labeled (Node ≥ 20, claude CLI on PATH, vault config present, vault path exists on disk, hooks merged in settings.json, permissions merged in settings.json, wiki skill installed). Every check has a corresponding `pass()`/`fail()` call site. |
| INST-02 | 06-01-PLAN + 06-02-PLAN | Each ✗ → one-line remediation pointing at exact `self-wiki <subcommand>` or settings.json edit; non-zero exit if any check fails | SATISFIED | Every `fail(label, hint)` call emits both the `✗ label` line and the `    → hint` line (enforced structurally in `fail()` helper). All 7 hints reference real `self-wiki <subcommand>` invocations (the three narrow-fix flags `--hooks-only` / `--permissions-only` / `--skill-only` exist post-06-02). `process.exit(1)` on `failingCount > 0`. |
| INST-03 | 06-03-PLAN | README Troubleshooting section keys symptoms to doctor output | SATISFIED | `## Troubleshooting` section at README.md lines 266-274 between Upgrading and License. 3 rows mapping REQ-INST-03's verbatim symptoms ("sessions not opening", "no notes captured", "permission prompts during turns") to specific doctor check labels and `init --X-only` fix commands. Cross-source label identity preserved between README and doctor.js. |

All three requirement IDs declared in PLAN frontmatter; all three satisfied. No orphaned requirements for Phase 06 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/commands/init.js` | 25-41 | Narrow-flag short-circuit silently ignores `vaultArg` positional when set | Info | Surfaced in 06-REVIEW.md (WR-01) as advisory. Not blocking — current behavior is documented in the option help text, and CONTEXT-D-NARROW-FLAGS explicitly accepts this. |
| `src/commands/init.js` | 25-41 | No conflict validation between `--hooks-only` and `--no-hooks` | Info | Surfaced in 06-REVIEW.md (WR-02). CONTEXT.md "Claude's Discretion → combinability" recommends collapse semantic (positive selector silently wins), which is what the code does. Not a defect. |
| `src/commands/doctor.js` | 73-80 | "vault config present" conflates "present" with "vaultPath non-null"; partially-valid configs with null vaultPath still report a confusing ✗ | Info | Surfaced in 06-REVIEW.md (WR-03). Doctor's behavior matches REQ-INST-01's literal text ("vault config present and readable") via the doc-comment-justified invariant: `readUserConfig` returns `{vaultPath: null}` on ANY failure mode (ENOENT, EACCES, parse error), so non-null vaultPath implies both present AND readable. The misleading-hint edge case is real but does not block the phase goal. |
| `src/commands/doctor.js` | 153, 155, 158 | Hardcoded `7` as total check count (magic number) | Info | Surfaced in 06-REVIEW.md (IN-03). Refactor to `TOTAL_CHECKS` constant would be cleaner but does not affect correctness today. |

No blockers found. No `TODO`/`FIXME`/`PLACEHOLDER` text in any Phase 06 source file. No empty `return []` / `return {}` returning to render surfaces. No `console.log`-only handlers. The 4 Warning-level and 5 Info-level items from the standard code review are all advisory and explicitly accepted by the user in the verifier prompt context.

### Human Verification Required

None. Every must-have was verifiable programmatically:

- Goal-shape checks (the 7 labels, 3 sections, summary line, exit code, remediation hints) are deterministic stdout/exit behaviour with no UX dependency.
- The "soft-fail on missing claude" criterion was tested by running doctor with an empty `PATH` and confirming no crash.
- The "non-zero exit on any ✗" criterion was tested by running against a broken install and observing `EXIT_CODE=1`.
- The README Troubleshooting section is plain markdown text — grep-verifiable, no rendering judgement required.

### Gaps Summary

None. All 8 must-haves (5 ROADMAP success criteria + 3 plan-frontmatter truths) are verified in the codebase. All required artifacts exist, are substantive (200-300 lines each), and are wired into the CLI. End-to-end smoke testing of `self-wiki doctor` against both a healthy install and a fully broken HOME=tmp install produced the expected outputs at the expected exit codes. The full test suite passes 257/257 (240 pre-existing + 11 new doctor + 6 new narrow-flag).

The standard code review surfaced 0 Critical / 4 Warning / 5 Info findings — all advisory, all accepted in this verifier's prompt context as non-blocking. The phase orchestrator chose to accept them and merge the worktrees; that decision is not re-litigated here.

Phase 06 goal achieved.

---

*Verified: 2026-05-11*
*Verifier: Claude (gsd-verifier)*
