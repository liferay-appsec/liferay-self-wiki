---
phase: 06-install-ux-hardening
fixed_at: 2026-05-11T00:00:00Z
review_path: .planning/phases/06-install-ux-hardening/06-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-05-11
**Source review:** .planning/phases/06-install-ux-hardening/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (Critical + Warning only; 5 Info findings out of scope per `fix_scope=critical_warning`)
- Fixed: 4
- Skipped: 0

All four Warning-class defects in the Phase 06 install-UX surface are
resolved. Each fix is committed atomically. The full test suite stays
at 257/257 across three back-to-back `npm test` runs.

## Fixed Issues

### WR-01: `init --hooks-only <vault>` silently ignores the positional vault argument

**Files modified:** `src/commands/init.js`
**Commit:** `6ceb83d`
**Applied fix:** Added a `vaultArg` check at the top of the narrow-fix
short-circuit branch (`init.js:30`) that writes a stderr warning naming
the discarded vaultArg before the three narrow steps run. The warning
text matches the review suggestion verbatim:

```
warning: --hooks-only / --permissions-only / --skill-only ignore the <vault-path> argument (<arg>); skipping vault scaffold.
```

This restores least-surprise without rejecting the combination outright
(the alternative the review noted) — the narrow steps still execute, so
a user who absent-mindedly typed both isn't blocked. The skipped vault
is now signal, not silence.

### WR-02: `--X-only` + `--no-X` is undefined behaviour

**Files modified:** `src/commands/init.js`
**Commit:** `e53d0eb`
**Applied fix:** Added three explicit guard checks inside the narrow-fix
branch (immediately after the WR-01 vaultArg warning) that reject the
three incoherent pairs `--hooks-only`/`--no-hooks`,
`--skill-only`/`--no-skill`, and `--permissions-only`/`--no-permissions`.
Each guard writes a distinct error to stderr and exits with code 2 (the
conventional "usage error" exit). Mirrors the review fix snippet exactly.

Note: `--no-permissions` is not currently exposed as a Commander option
(only `--no-hooks` and `--no-skill` are wired in `src/cli.js:36-37`), so
the third guard is defensive — programmatic callers passing
`{ permissionsOnly: true, permissions: false }` will trip it. Included
for completeness per the reviewer's snippet.

### WR-03: `doctor` "vault config present" passes even when the config file is corrupt/unreadable

**Files modified:** `src/commands/doctor.js`
**Commit:** `6a9623c`
**Applied fix:** Imported `getUserConfigFilePath` from `../utils/paths.js`
alongside the existing `tryGetVaultPath` import, then split Check 3 in
`doctorCommand` into three branches:

1. `vaultConfigured` (vaultPath is non-null) → ✓ pass
2. `!vaultConfigured && cfgFilePresent` (file exists but vaultPath unset
   or unreadable) → ✗ with repair-existing hint:
   `~/.config/self-wiki/config.json exists but vaultPath is unset/unreadable — fix the file or rerun \`self-wiki init <vault>\``
3. `!vaultConfigured && !cfgFilePresent` (file truly absent) → ✗ with
   the original scaffold-new hint

The new `fs.access(getUserConfigFilePath())` probe runs in a try/catch
that treats ENOENT/EACCES as "effectively absent" — the latter is a
permission error on the parent directory, which is genuinely
unreachable. A permission error on the FILE specifically (rare, since
`fs.access(path)` defaults to F_OK, not R_OK) would also fall through
to the "absent" branch, which is acceptable — the user will hit the
same error when init tries to write.

Updated the rationale comment block above the check (lines 66-73) to
explain why the separate probe is necessary; the previous comment
incorrectly claimed `readUserConfig`'s null return implied "present and
readable".

The existing `vault config missing: ✗ vault config present + scaffold hint`
test in `test/doctor.test.js:164` (which removes `userCfgPath` entirely)
still hits the "truly absent" branch and asserts the scaffold-new hint,
so it passes unchanged.

### WR-04: Narrow-flag branch never calls `applyUserConfig()`

**Files modified:** `src/commands/init.js`
**Commit:** `c5dc2ed`
**Applied fix:** Added a 7-line comment block above the narrow-fix
short-circuit explaining the deliberate omission of `applyUserConfig()`.
The comment names the load-bearing invariant — the three narrow steps
write into `~/.claude/` exclusively and have no vault dependency — and
the failure mode a future contributor would hit if they violate it
(`getVaultPath()` throws with no obvious cause).

Comment-only change. No behavior delta. Behaviorally a no-op, but
locks in the rationale so a future addition that touches the vault
(e.g. writing `<vault>/.self-wiki/install-state.json`) is forced to
hoist `applyUserConfig()` above the block rather than discovering the
constraint through a stack trace.

---

## Skipped Issues

None — all four in-scope findings were fixed cleanly.

## Out-of-Scope Findings (Info)

Five Info-level findings were intentionally excluded per `fix_scope=critical_warning`:

- IN-01: `mergeHooks` duplicate self-wiki block dedup undocumented
- IN-02: Drift tokens chalk-dim, no "do not split" comment
- IN-03: `doctor` summary hard-codes `7` as a magic number
- IN-04: `--skill-only` re-prompt UX (default `n` overwrite)
- IN-05: `doctorCommand`'s `opts.skipExit` test-only hatch undocumented

These remain as future work or can be addressed in a follow-up review-fix
run with `fix_scope=all`.

## Verification

- Targeted test runs:
  - `node --test test/init-narrow-flags.test.js` — 6/6 subtests pass
    consistently (TAP-rollup flakiness in 1-2 of every 10 runs is
    pre-existing harness behavior documented in the test file's NOTE
    comment; no subtest body ever fails an assertion).
  - `node --test test/doctor.test.js` — 11/11 pass on every run.
  - Combined: 17/17 pass.
- Full suite: `npm test` → 257/257 pass on three consecutive runs.
- Tier-2 syntax: `node -c src/commands/init.js` and
  `node -c src/commands/doctor.js` both clean after every edit.

---

_Fixed: 2026-05-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
