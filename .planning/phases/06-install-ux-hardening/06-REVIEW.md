---
phase: 06-install-ux-hardening
reviewed: 2026-05-11T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - README.md
  - src/cli.js
  - src/commands/doctor.js
  - src/commands/init.js
  - test/doctor.test.js
  - test/init-narrow-flags.test.js
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-05-11
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 06 ships three install-UX features: a `doctor` diagnostic command (06-01), narrow-fix `init --hooks-only / --permissions-only / --skill-only` flags (06-02), and a README Troubleshooting section (06-03). The implementation is generally sound: cross-file exports (`mergeHooks`, `describeHookDiff`, `isSelfWikiBlock`) line up with their doctor.js consumers, the `i hooks:` / `i permissions:` drift tokens are contiguous source strings (the 06-03 Rule 1 fix is in place at `doctor.js:195` and `:216`), test coverage exercises every ✓/✗ branch including Tier-2 drift, and narrow-flag tests verify that none of the four side-effect surfaces (vault, hooks, permissions, skill, user config) leak across boundaries.

That said, the narrow-flag short-circuit in `initCommand` has several real defects worth fixing before this ships: a positional `<vault-path>` argument is silently ignored when any `--X-only` flag is set, the early return skips `applyUserConfig()` so a real user invoking `--hooks-only` mid-config still works only by accident, and there is no validation that `--no-hooks` + `--hooks-only` are mutually exclusive (the combination produces surprising behavior). The doctor command also has one classification-style bug around the "vault config present" check where a present-but-malformed config file silently passes as present.

## Warnings

### WR-01: `init --hooks-only <vault>` silently ignores the positional vault argument

**File:** `src/commands/init.js:25-41`
**Issue:** When any of `--hooks-only`, `--permissions-only`, `--skill-only` is set, the function short-circuits and returns before touching the `vaultArg` parameter. A user who runs `self-wiki init /path/to/vault --hooks-only` gets no warning that their vault argument was discarded — it just runs the narrow step. This is contrary to least-surprise: either the flag should be rejected when a positional is also passed, or the discarded positional should produce a stderr warning ("note: --hooks-only ignores the <vault-path> argument"). At minimum, the docs in `cli.js:39-41` should call this out.

**Fix:**
```js
if (opts.hooksOnly || opts.permissionsOnly || opts.skillOnly) {
  if (vaultArg) {
    process.stderr.write(
      `warning: --hooks-only / --permissions-only / --skill-only ignore the <vault-path> argument (${vaultArg}); skipping vault scaffold.\n`
    );
  }
  if (opts.skillOnly) await installSkill(opts.yes);
  if (opts.hooksOnly) await proposeHooks(opts.yes);
  if (opts.permissionsOnly) await proposePermissions(opts.yes);
  return;
}
```

### WR-02: `--hooks-only` + `--no-hooks` is undefined behaviour; same for the other two pairs

**File:** `src/commands/init.js:25-41`, `src/cli.js:36-43`
**Issue:** Commander gives `opts.hooks`, `opts.skill`, `opts.permissions` boolean values driven by `--no-hooks`, `--no-skill`, plus the new `--hooks-only` / `--skill-only` / `--permissions-only`. The narrow-flag short-circuit at `init.js:30` does not consult the `--no-*` negation flags at all. So `self-wiki init --hooks-only --no-hooks` will happily run `proposeHooks()` — the negation is silently ignored. This is a small bug in the surface contract: either the combination should be rejected with a clear error, or `--no-hooks` should suppress hook installation even inside the narrow branch.

**Fix:**
```js
if (opts.hooksOnly || opts.permissionsOnly || opts.skillOnly) {
  // Reject incoherent combinations explicitly.
  if (opts.hooksOnly && opts.hooks === false) {
    process.stderr.write('error: --hooks-only cannot be combined with --no-hooks\n');
    process.exit(2);
  }
  if (opts.skillOnly && opts.skill === false) {
    process.stderr.write('error: --skill-only cannot be combined with --no-skill\n');
    process.exit(2);
  }
  if (opts.permissionsOnly && opts.permissions === false) {
    process.stderr.write('error: --permissions-only cannot be combined with --no-permissions\n');
    process.exit(2);
  }
  // …existing body…
}
```

### WR-03: `doctor` "vault config present" passes even when the config file is corrupt/unreadable

**File:** `src/commands/doctor.js:73-80`
**Issue:** The comment at lines 67-72 claims `readUserConfig()` "is no-throw — on any read failure (ENOENT, EACCES, parse error) it returns the USER_DEFAULTS shape with vaultPath: null. So a non-null vaultPath here implies the file was BOTH present AND readable." That logic is wrong in the case where the user has a *partially valid* config file: any well-formed JSON containing `"vaultPath": "/some/path"` but that is otherwise unreadable by downstream callers (e.g. missing or malformed `jira` block, invalid types) will still make `vaultConfigured = true` — and a *truly* unreadable file (EACCES, parse error) returns `vaultPath: null` and reports `✗ vault config present` with the misleading remediation `run 'self-wiki init <vault>' to scaffold one`. The user already has a config file; they need to fix permissions or repair JSON, not scaffold a new vault. The check conflates "present" with "readable-and-defaults-extractable".

**Fix:** Either (a) do a separate `fs.access(getUserConfigFilePath(), R_OK)` probe before consulting `readUserConfig` and split the check into "config file present" + "vault path set", with distinct remediations; or (b) at minimum, in `readUserConfig` surface the failure mode via a sentinel so doctor can produce a different hint:
```js
// In src/commands/doctor.js, after the readUserConfig() call:
const cfgFile = getUserConfigFilePath();
let cfgFilePresent = false;
try { await access(cfgFile); cfgFilePresent = true; } catch {}
if (vaultConfigured) {
  pass('vault config present');
} else if (cfgFilePresent) {
  fail('vault config present',
       `~/.config/self-wiki/config.json exists but vaultPath is unset/unreadable — fix the file or rerun \`self-wiki init <vault>\``);
  failingCount++;
} else {
  fail('vault config present', 'run `self-wiki init <vault>` to scaffold one');
  failingCount++;
}
```

### WR-04: Narrow-flag branch never calls `applyUserConfig()`; full-flow does not either, but init.js relied on it before

**File:** `src/commands/init.js:25-43`
**Issue:** `CLAUDE.md` says every command's preamble should be `await applyUserConfig(); ensureVaultConfigured();` (with the latter omitted when the command works pre-init — `init` is in that bucket). The full-flow `initCommand` does not call `applyUserConfig` either (it manages vault state directly through `setVaultPath` at line 45), so this is not a regression — but it is worth confirming the narrow branch's behavior. If a user has an existing vault configured at `~/.config/self-wiki/config.json` and runs `self-wiki init --hooks-only`, the narrow branch ignores that config entirely. That is correct for the three actions taken (hooks/perms/skill don't need a vault), but if anyone later adds a vault-dependent action to the narrow branch (e.g. writing a marker into `<vault>/.self-wiki/install-state.json`), they will get a `getVaultPath()` throw with no obvious cause. Worth a load-bearing comment to lock this in.

**Fix:**
```js
if (opts.hooksOnly || opts.permissionsOnly || opts.skillOnly) {
  // Intentionally do not call applyUserConfig() — the three narrow steps
  // (skill, hooks, permissions) write into ~/.claude/ exclusively and have
  // no vault dependency. Any future addition that touches the vault MUST
  // hoist applyUserConfig() above this block.
  …
}
```

## Info

### IN-01: `mergeHooks` second-self-wiki-block-in-same-event is silently dropped

**File:** `src/commands/init.js:127-152`
**Issue:** If a user has manually duplicated a self-wiki entry (so `existing` for an event contains two `isSelfWikiBlock` blocks), the loop will replace the first with `desiredBlocks[0]` and then `findIndex` returns `-1` for the second, so the second self-wiki block is silently dropped. This is technically the right behavior (de-dup) but it is undocumented and not tested. Worth either a comment ("a second self-wiki block at the same event is treated as a duplicate and removed") or an explicit test.

**Fix:** Either add a comment at line 137 explaining the dedup semantics, or add a test in `test/init-narrow-flags.test.js` that seeds two self-wiki blocks for `SessionStart` and verifies the merged output has exactly one.

### IN-02: Drift tokens are chalk-dimmed — README documents the plaintext token but TTY users see ANSI codes

**File:** `src/commands/doctor.js:194-195, 215-216`; `README.md:272, 274`
**Issue:** The README Troubleshooting table refers to "the `i hooks:` drift line" and "the `i permissions:` drift line" as if they are literal plaintext tokens. The actual emitted output wraps them in `chalk.dim()` (ANSI `\x1b[2m...\x1b[22m`). For TTY users the visual is `i hooks:` rendered dim, which matches the README plaintext reading. For non-TTY pipes chalk strips the codes so the README token matches literally. Both modes are user-correct, but a contributor doing a "grep the README token verbatim in source" check (which the 06-03 Rule 1 fix was specifically introduced to support) will find the contiguous string `'i hooks:'` inside `chalk.dim('i hooks:')` and conclude "ok, identity preserved" — that's exactly the contract Plan 06-03 documented, so this is working as intended. The Info-level note: if the dim formatting is ever swapped for, say, a yellow color, the README contract becomes fragile silently. Worth a `// DO NOT split this string literal — see README Troubleshooting table` comment.

**Fix:**
```js
// DO NOT split this literal — README Troubleshooting table greps for the
// contiguous 'i hooks:' string. See plan 06-03 Rule 1 fix.
process.stdout.write(
  '  ' + chalk.dim('i hooks:') + ' ' + diffs.length + ' command(s) differ from template — run `self-wiki init --hooks-only` to refresh\n'
);
```

### IN-03: Summary line hard-codes the "7" total

**File:** `src/commands/doctor.js:153, 155, 158`
**Issue:** `const passingCount = 7 - failingCount;` and the format string `summary: 7/7 passing` both bake in the check count `7` as a magic number. If a future check is added (or one is conditionally suppressed), the summary will silently desync from the actual checks counted into `failingCount`. Lift the total to a counter incremented at each check site, or to a `const TOTAL_CHECKS = 7` so the desync risk surfaces at the constant rather than across three string literals.

**Fix:**
```js
const TOTAL_CHECKS = 7;
…
const passingCount = TOTAL_CHECKS - failingCount;
if (failingCount === 0) {
  process.stdout.write(`summary: ${TOTAL_CHECKS}/${TOTAL_CHECKS} passing\n`);
} else {
  process.stdout.write(
    `summary: ${passingCount}/${TOTAL_CHECKS} passing — ${failingCount} ✗ — fix the items above and re-run\n`
  );
}
```

### IN-04: `installSkill` re-prompts every time `--skill-only` is invoked against an existing skill file with `--yes` not passed; remediation hint omits `--yes`

**File:** `src/commands/init.js:201-215`; `src/commands/doctor.js:142`
**Issue:** Doctor's `wiki skill installed ✗` remediation tells the user to run `self-wiki init --skill-only`. If the skill is actually missing (the ✗ case), `installSkill` lands without prompting — fine. But the same hint surfaces in the README troubleshooting table where a *drift*-class user might run `--skill-only` to refresh an existing skill, and `installSkill` will then prompt `overwrite existing ~/.claude/skills/wiki/SKILL.md?` with default `n`. Hitting Enter at the prompt produces "skill not overwritten" — the inverse of what the user requested. The fix is to make the `--skill-only` flag imply confirmation (since the user explicitly asked for the skill to be (re-)installed), or to document the `--yes` requirement in the help text at `cli.js:41`.

**Fix:** Pass `true` for `skipConfirm` in the narrow branch:
```js
if (opts.skillOnly) {
  await installSkill(true); // --skill-only is an explicit user request; skip the overwrite prompt
}
```
Or update the help string in `cli.js:41` to add `(combine with --yes to suppress overwrite prompt)`.

### IN-05: `doctorCommand(opts)` not wired to the Commander action

**File:** `src/cli.js:90-93`; `src/commands/doctor.js:21, 162`
**Issue:** `doctorCommand` accepts `opts.skipExit` to suppress `process.exit(1)` and return `{ failingCount }` instead. This is useful for the test harness, but `cli.js` wires `.action(doctorCommand)` with no option definitions, so the test-only knob is intentionally undocumented. That's fine — but `opts = {}` defaults to `{}` only when called via the test harness; Commander will pass an `OptionValues` object even with no `.option()` declarations. The current shape (`opts.skipExit` falsy when invoked via CLI) is correct, but the test-only nature of `skipExit` deserves a one-line comment so a future contributor doesn't expose it as `--skip-exit`.

**Fix:**
```js
export async function doctorCommand(opts = {}) {
  // opts.skipExit is a TEST-ONLY escape hatch — do not expose via cli.js.
  // It suppresses the non-zero process.exit so the test runner survives
  // assertions on the failing-count return value.
  await applyUserConfig();
  …
}
```

---

_Reviewed: 2026-05-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
