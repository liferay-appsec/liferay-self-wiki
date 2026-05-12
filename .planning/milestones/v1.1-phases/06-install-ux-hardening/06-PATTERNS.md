# Phase 06: Install UX Hardening - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 5 (2 new, 3 modified)
**Analogs found:** 5 / 5

## Phase-wide constraints (must be honoured by every plan)

- **Doctor is 100% deterministic.** No `claude -p`, no model invocations, no prompt templates. Only `fs` + `spawn('claude', ['--version'])` (via `hasClaudeCli`) + `JSON.parse`. The "Deterministic vs. model" rule in `CLAUDE.md` is load-bearing here.
- **Soft-deps degrade silently.** `hasClaudeCli()` already returns `false` (never throws) on missing/hung binary. Doctor's check must wrap it the same way — a missing `claude` is a `✗` line, not a thrown exception.
- **chalk pattern.** Always import as `import chalk from 'chalk';`. Use `chalk.green('✓')`, `chalk.red('✗')`, `chalk.yellow('·')`, `chalk.bold`, `chalk.dim`, `chalk.cyan` — chalk auto-disables on non-TTY (`NO_COLOR` / `FORCE_COLOR` respected), so plain `process.stdout.write` is safe.
- **applyUserConfig at startup, but NOT `ensureVaultConfigured()`.** Doctor needs the resolved vault path to check it, but vault-missing is a `✗` to report, not a fatal exit. `applyUserConfig()` is no-throw (it falls back to defaults when the config file is missing). `ensureVaultConfigured()` exits with code 2 — doctor must not call it.
- **No new hooks, no new permissions.** Phase 06 does not modify `src/templates/{hooks,permissions}.json`. Doctor is user-invoked (per CLAUDE.md's "skill or model is expected to invoke" rule, doctor doesn't qualify — no permission entry needed).
- **One subcommand per file in `src/commands/`.** Doctor goes in `src/commands/doctor.js`, exports `doctorCommand`, wired in `src/cli.js`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/commands/doctor.js` (new) | CLI subcommand (diagnostic) | request-response (fs read + spawn probe) | `src/commands/status.js` + `src/commands/init.js` (drift logic) + `src/core/claude.js` (probe) | composite-exact |
| `src/commands/init.js` (modify) | CLI subcommand (install) | request-response (fs write + merge) | itself — extend existing `initCommand` opts switch | self |
| `src/cli.js` (modify) | Commander wiring | n/a | existing `.command(...).option(...).action(...)` blocks | exact |
| `README.md` (modify) | docs | n/a | existing "How sessions get framed" / "Optional integrations" pipe tables | exact |
| `test/doctor.test.js` (new) | test (node:test) | n/a | `test/nudge.test.js` (per-command file with tmp `XDG_*` + `captureStdout`) | exact |

---

## Pattern Assignments

### `src/commands/doctor.js` (new — CLI subcommand, diagnostic)

This is a composite — three different analogs supply three different patterns.

#### A. Imports + startup pattern

**Analog:** `src/commands/status.js` (lines 1-7) — the leanest existing command.

```javascript
import { readSession, listActiveSessions, migrateLegacyState } from '../core/state.js';
import { applyUserConfig } from '../core/config.js';
import { diffMinutes, formatDuration } from '../utils/format.js';

export async function statusCommand(opts = {}) {
  await applyUserConfig();
  await migrateLegacyState();
```

**Apply to doctor:** Open with `await applyUserConfig();` only. Do NOT call `ensureVaultConfigured()`. Imports doctor will need:

```javascript
import { readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import chalk from 'chalk';
import { applyUserConfig, readUserConfig } from '../core/config.js';
import { tryGetVaultPath } from '../utils/paths.js';
import { hasClaudeCli } from '../core/claude.js';
```

The `__dirname` + `TEMPLATES` resolver pattern (needed for Tier 2 drift comparisons against `src/templates/hooks.json` and `src/templates/permissions.json`) is copied verbatim from `src/commands/init.js` lines 15-19:

```javascript
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(__dirname, '..', 'templates');
const HOOKS_SRC = join(TEMPLATES, 'hooks.json');
const PERMISSIONS_SRC = join(TEMPLATES, 'permissions.json');

const SKILL_DEST = join(homedir(), '.claude', 'skills', 'wiki', 'SKILL.md');
const SETTINGS_DEST = join(homedir(), '.claude', 'settings.json');
```

#### B. chalk rendering pattern (✓ / ✗ / → / section headers)

**Analog:** `src/commands/init.js` lines 30-83 — every `✓` / `✗` / `·` print and the `chalk.bold('section')` opener:

```javascript
process.stdout.write(chalk.bold(`self-wiki init → ${vaultPath}\n\n`));
// …
process.stdout.write(`  ${chalk.green('✓')} vault folders ready (Daily/, Reports/, Reviews/, Tickets/, Components/)\n`);
// …
process.stdout.write(`  ${chalk.yellow('·')} ${rel(vaultCfgDest)} already exists (left as-is)\n`);
// …
process.stdout.write('\n' + chalk.bold('done.') + '\n\n');
// …
process.stdout.write(`  ${chalk.dim('•')} ${chalk.cyan('cd <repo> && claude')}  — start Claude Code; …\n`);
```

**Apply to doctor:**

- Section headers: `chalk.bold('Runtime')`, `chalk.bold('Vault')`, `chalk.bold('Claude Code wiring')` — three sections in fixed order per D-OUTPUT-GROUPED.
- Pass line: `  ${chalk.green('✓')} <label>\n` (two-space indent matches init's lines 33/39/46).
- Fail line: `  ${chalk.red('✗')} <label>\n` followed by an indented remediation line `    → <hint>\n` (four-space indent per D-HINT-SHAPE — one level deeper than the `✗`).
- Drift info line (Tier 2): rendered inside the wiring section, after the three `✓/✗` lines, e.g. `  ${chalk.dim('i')} hooks: N command(s) differ from template — run \`self-wiki init --hooks-only\` to refresh\n`. Tone is dim/grey since Tier 2 never flips the exit code.
- Summary: blank line, then `summary: 7/7 passing` (all pass) or `summary: N/7 passing — M ✗ — fix the items above and re-run`. Per D-SUMMARY-LINE this is plain text — no chalk colour (it's load-bearing, scriptable, and chalk would only colour the live TTY anyway).
- Optional opening echo (Specifics §4): `chalk.bold('self-wiki doctor')` echoed at top, mirroring init's `chalk.bold('self-wiki init → <path>')`.

Use the existing `rel()` helper shape from `src/commands/init.js` line 251 if any path is printed (`<resolved-path>` in the vault-missing hint per D-VAULT-HINTS):

```javascript
function rel(path) {
  return path.replace(homedir(), '~');
}
```

#### C. The `claude --version` check

**Analog:** `src/core/claude.js` lines 57-80 — `hasClaudeCli()` is reused verbatim. Do NOT reimplement.

```javascript
export async function hasClaudeCli(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VERSION_TIMEOUT_MS;
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { stdio: 'ignore' });
    // … (5s timeout → resolve false; error → resolve false; close code === 0)
  });
}
```

**Apply to doctor:** `const claudePresent = await hasClaudeCli();` — boolean, never throws, never crashes on hung binary. Render `✓` / `✗` based on the boolean. Remediation per D-EXTERNAL-HINTS: `→ install Claude Code: https://docs.claude.com/en/docs/claude-code/setup`.

#### D. fs.access + readFile pattern (vault, settings.json, skill file existence)

**Analog:** `src/commands/init.js` lines 91-97 (read settings.json with ENOENT tolerance) and lines 242-249 (`fileExists`):

```javascript
let current = {};
try {
  current = JSON.parse(await readFile(SETTINGS_DEST, 'utf8'));
} catch (err) {
  if (err.code !== 'ENOENT') {
    process.stderr.write(`  ${chalk.red('✗')} could not read ${rel(SETTINGS_DEST)}: ${err.message}\n`);
    return;
  }
}
```

```javascript
async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
```

**Apply to doctor:**

- **Vault config present:** Read `await readUserConfig()` from `src/core/config.js` (line 24-32 — already no-throw, returns `{ vaultPath: null }` on ENOENT). Treat `vaultPath === null` as `✗ vault config not present` per `<code_context>` "Reusable Assets" §4.
- **Vault path on disk:** `const vault = tryGetVaultPath();` then `await fileExists(vault)`. Per Claude's Discretion, optionally upgrade to `fs.access(vault, fs.constants.W_OK)` for writability. The `✗` hint inlines the resolved path per D-VAULT-HINTS.
- **Skill file existence:** `await fileExists(SKILL_DEST)` — Tier 1 only per `<decisions>` "Skill-file content drift" (recommend: omit Tier 2 for skill).
- **settings.json read:** Same ENOENT-tolerant try/catch. ENOENT is treated as "no hooks merged" (both hooks and permissions ✗).

#### E. Hooks Tier 1 (presence) + Tier 2 (drift) — D-WIRING-TIER

**Analog:** `src/commands/init.js` lines 85-120 (`proposeHooks`), 122-147 (`mergeHooks`), 196-201 (`isSelfWikiBlock`), 203-224 (`describeHookDiff`).

The reusable signatures:

```javascript
// init.js line 122 — pure merge function, no IO
function mergeHooks(current, desired) { /* … returns merged settings object … */ }

// init.js line 196 — detects self-wiki ownership of a hook block
function isSelfWikiBlock(block) {
  if (!block?.hooks) return false;
  return block.hooks.some(
    (h) => typeof h?.command === 'string' && /(?:^|\s)self-wiki\s/.test(h.command),
  );
}

// init.js line 203 — human-readable diff between two hook trees
function describeHookDiff(currentHooks, mergedHooks) { /* … returns string[] … */ }
```

**Apply to doctor:**

- **Tier 1 hooks check (gates ✓/✗ + exit code):** Iterate `current.hooks` for each of the four events (`SessionStart`, `Stop`, `SessionEnd`, `UserPromptSubmit`). Each event passes if at least one block contains a command string matching `/(?:^|\s)self-wiki\s/` (use `isSelfWikiBlock` shape, or inline the same regex). Any missing event = `✗ <hooks label>`. Remediation: `→ run \`self-wiki init --hooks-only\``.
- **Tier 2 hooks drift (informational, never flips exit code):** Read `HOOKS_SRC`, call `mergeHooks(current, desired)`, then count how many entries in `merged.hooks` differ from `current.hooks` (the existing `describeHookDiff` output `.length` is the count). If > 0, emit the dim drift line per D-DRIFT-LINES.

**Plan note — refactor decision:** `mergeHooks` / `describeHookDiff` / `isSelfWikiBlock` are currently `function …` declarations local to `init.js` (no `export`). To reuse them from `doctor.js`, the plan must either (a) add `export` to those three names in `init.js` and import them, or (b) extract them into a new `src/core/wiring.js`. Recommendation: option (a) is the smaller diff and keeps the merge logic colocated with the install command that owns it. The planner should explicitly call this out — it's the one structural change Phase 06 needs.

#### F. Permissions Tier 1 + Tier 2 — D-WIRING-TIER

**Analog:** `src/commands/init.js` lines 149-194 (`proposePermissions`). Pattern for Tier 1 + Tier 2 lives in lines 166-172:

```javascript
const currentAllow = current?.permissions?.allow ?? [];
const additions = desiredAllow.filter((entry) => !currentAllow.includes(entry));

if (additions.length === 0) {
  process.stdout.write(`  ${chalk.green('✓')} self-wiki permissions already present in ${rel(SETTINGS_DEST)}\n`);
  return;
}
```

**Apply to doctor:**

- **Tier 1 (gates ✓/✗):** `✓` if at least one entry in `current?.permissions?.allow` starts with `Bash(self-wiki ` (substring match, not exact). Zero matches = `✗`. Remediation: `→ run \`self-wiki init --permissions-only\``.
- **Tier 2 drift (informational):** Read `PERMISSIONS_SRC`, compute `desiredAllow.filter(e => !currentAllow.includes(e))`. If `additions.length > 0`, emit drift line per D-DRIFT-LINES: `i permissions: N entry/entries missing — run \`self-wiki init --permissions-only\` to refresh`.

**Reusable factor:** Phase 06 does NOT need to extract a `mergePermissions()` — the subset-check (`desiredAllow.filter(... !currentAllow.includes ...)`) is two lines and already inline in `proposePermissions`. The planner can mirror it directly in doctor; no refactor needed for permissions. The hooks side is the only refactor target (E above).

#### G. Exit-code wiring

**Analog:** `src/cli.js` lines 141-144:

```javascript
program.parseAsync().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
```

**Apply to doctor:** At the end of `doctorCommand`, if `failingCount > 0`, call `process.exit(1)` (single non-zero per Claude's Discretion default — defer stratification to v1.2). The Commander `.action(doctorCommand)` wiring already swallows the awaited promise; explicit `process.exit(1)` is the idiom this codebase uses.

#### H. Section + label discipline

D-OUTPUT-LABELS makes the **seven English labels load-bearing**: they appear verbatim in both `doctor.js` and the README Troubleshooting table. The planner picks the seven strings; the executor preserves them. Plan-level acceptance check: `grep` each label string in both `src/commands/doctor.js` AND `README.md` — both must match.

**Suggested seven labels** (planner has final say; these are placeholders that satisfy every Phase-06 requirement without inviting drift):

| Section | Label | Tier-1 source |
|---------|-------|---------------|
| Runtime | `Node ≥ 20` | `process.versions.node` compared to 20 |
| Runtime | `claude CLI on PATH` | `hasClaudeCli()` |
| Vault | `vault config present` | `readUserConfig().vaultPath !== null` |
| Vault | `vault path exists on disk` | `fileExists(tryGetVaultPath())` (optionally W_OK) |
| Claude Code wiring | `hooks merged in settings.json` | all four events have a self-wiki command |
| Claude Code wiring | `permissions merged in settings.json` | at least one `Bash(self-wiki ` allow entry |
| Claude Code wiring | `wiki skill installed` | `fileExists(SKILL_DEST)` |

---

### `src/commands/init.js` (modify — add `--hooks-only` / `--permissions-only` / `--skill-only`)

**Analog:** itself, lines 25-83. The existing `initCommand` already has three opt-controlled blocks (skill at 51, hooks at 67, permissions at 71).

**Existing branch structure to extend:**

```javascript
// init.js line 51 — skill block
if (opts.skill !== false) {
  await mkdir(dirname(SKILL_DEST), { recursive: true });
  if (await fileExists(SKILL_DEST)) {
    const overwrite = opts.yes || await confirm(...);
    if (overwrite) { await copyFile(SKILL_SRC, SKILL_DEST); /* … */ }
    else { /* skipped */ }
  } else {
    await copyFile(SKILL_SRC, SKILL_DEST);
    process.stdout.write(`  ${chalk.green('✓')} skill installed to ${rel(SKILL_DEST)}\n`);
  }
}

// init.js line 67 — hooks block
if (opts.hooks !== false) {
  await proposeHooks(opts.yes);
}

// init.js line 71 — permissions block
if (opts.permissions !== false) {
  await proposePermissions(opts.yes);
}
```

**Apply:** Per `<specifics>` §2 ("The planner should re-read `src/commands/init.js`'s top-level structure and route `--hooks-only` to call ONLY `proposeHooks()` and skip everything else"), the cleanest shape is to **short-circuit at the top of `initCommand` when any `--X-only` flag is set**, skipping vault scaffolding entirely.

Recommended structure (planner discretion on exact code shape — D-NARROW-FLAGS recommends "implement `--X-only` as syntactic sugar for 'run only X, skip the rest' and short-circuit"):

```javascript
export async function initCommand(vaultArg, opts = {}) {
  // NEW: short-circuit for narrow-selector flags. Each --X-only runs only that
  // step and skips vault scaffolding / user config writes.
  if (opts.hooksOnly || opts.permissionsOnly || opts.skillOnly) {
    if (opts.skillOnly) { /* the existing skill block, lifted out */ }
    if (opts.hooksOnly) { await proposeHooks(opts.yes); }
    if (opts.permissionsOnly) { await proposePermissions(opts.yes); }
    return;
  }

  // EXISTING: full vault scaffold + skill + hooks + permissions flow
  const vaultPath = resolve(vaultArg || /* … */);
  // …
}
```

**Combinability rule (Claude's Discretion):** `init --hooks-only --permissions-only` collapses to "do both, skip the rest". Document this in the flag descriptions in `src/cli.js`.

**Existing helpers reused verbatim:** `proposeHooks`, `proposePermissions`, `fileExists`, `rel`, `confirm`, `mergeHooks`, `describeHookDiff` — no changes to their signatures. Only the top-level branching changes.

**Side-effect to surface:** if hooks/describeHookDiff/mergeHooks need to be `export`ed for doctor's Tier 2 drift detection (see doctor pattern §E), the export sits naturally with the init modifications in this same plan/file.

---

### `src/cli.js` (modify — wire `doctor` subcommand + 3 new init flags)

**Analog A — adding the doctor subcommand:** existing `program.command('status')` block at lines 79-84 is the smallest pattern with no positional args:

```javascript
program
  .command('status')
  .description('Show current session state.')
  .option('--json', 'machine-readable JSON output')
  .option('--claude-session-id <id>', 'inspect a specific session')
  .action(statusCommand);
```

**Apply:**

```javascript
import { doctorCommand } from './commands/doctor.js';
// …
program
  .command('doctor')
  .description('Diagnose your self-wiki install (Runtime, Vault, Claude Code wiring).')
  .action(doctorCommand);
```

Place the `doctor` block after `status` and before `report` (groups it with the other "user-invoked diagnostic / read-only" commands).

**Analog B — adding the three new init flags:** existing init command block at lines 32-39:

```javascript
program
  .command('init [vault-path]')
  .description('Scaffold a vault, install the wiki skill, and propose Claude Code hooks.')
  .option('--no-hooks', 'skip writing hooks to ~/.claude/settings.json')
  .option('--no-skill', 'skip installing the skill to ~/.claude/skills/wiki/')
  .option('--no-set-default', 'scaffold the vault without persisting it as the default in ~/.config/self-wiki/config.json (use for tmp/test vaults)')
  .option('-y, --yes', 'skip confirmation prompts')
  .action(initCommand);
```

**Apply:** add three new `.option(...)` calls (Commander auto-converts `--hooks-only` → `opts.hooksOnly`, etc.):

```javascript
.option('--hooks-only', 'merge hooks into ~/.claude/settings.json only; skip vault scaffold, permissions, skill (combinable with --permissions-only / --skill-only)')
.option('--permissions-only', 'merge permissions into ~/.claude/settings.json only; skip vault scaffold, hooks, skill (combinable)')
.option('--skill-only', 'install ~/.claude/skills/wiki/SKILL.md only; skip vault scaffold, hooks, permissions (combinable)')
```

The existing `--no-hooks` / `--no-skill` negative selectors stay (D-NARROW-FLAGS: "the existing `--no-hooks` / `--no-skill` negative selectors stay; the new positive selectors compose cleanly with them at the planner's discretion").

---

### `README.md` (modify — insert Troubleshooting section)

**Anchor:** Insert between line 264 (end of Upgrading section) and line 266 (`## License`). Final order per D-PLACEMENT: `… → Parallel sessions → Upgrading → Troubleshooting → License`.

**Analog A — opening sentence + reference-to-command-not-output (D-NO-SAMPLE):** No README section currently ends with a sample command output. The opener is verbatim from D-NO-SAMPLE:

```markdown
## Troubleshooting

Run `self-wiki doctor` to diagnose your install. Each ✓/✗ is followed by a one-line remediation. Below: common symptoms keyed to specific doctor checks.
```

**Analog B — pipe-table format:** Mirror the existing "How sessions get framed" table (README lines 147-153) and "Optional integrations" structure (lines 200-232). All pipe tables in this README use:

- `| col1 | col2 | col3 |` header
- `| --- | --- | --- |` separator (the existing table uses padded `| ----- |` but plain `| --- |` is consistent with markdown rendering — match the existing style in this README's first table at line 148 which uses `| ----------------- |` padding; the planner may choose either, prefer matching).
- Backticks around commands inside cells (line 149: `` `self-wiki session open` ``).
- No emoji, no fancy alignment (D-TROUBLESHOOTING-NO-EMOJI).

**Apply:** Three-row table per D-SYMPTOM-ROWS. Column 2 quotes the seven labels chosen in `doctor.js` verbatim (Phase 06's load-bearing string contract):

```markdown
| Symptom | Doctor check | Fix |
| --- | --- | --- |
| Sessions not opening in new repos | `hooks merged in settings.json` ✗ | run `self-wiki init --hooks-only` |
| Notes I drop don't land in the daily log | `vault config present` ✗ or `vault path exists on disk` ✗ | run `self-wiki init <vault>` |
| Approval prompts during `claude` turns | `permissions merged in settings.json` ✗ or `i permissions:` drift line | run `self-wiki init --permissions-only` |
```

(Replace label strings with whatever the planner picked in doctor.js.)

**Final-line conventions to preserve:**

- No `<details>` or collapsed sections (consistent with the rest of the README).
- No inlined doctor output (D-NO-SAMPLE).
- No `Liferay, Inc.` text anywhere (carry-forward from Phase 04 D-LEG-01-OVERRIDE).

---

### `test/doctor.test.js` (new — per-command test file)

**Analog:** `test/nudge.test.js` is the closest by structure — per-command test, tmp `XDG_*` dirs, `captureStdout` helper, multiple `test('…', async () => {...})` cases, dynamic imports of the SUT after `process.env.XDG_*` is set.

**Imports + setup pattern** (lines 1-23 of `test/nudge.test.js`):

```javascript
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, paths, state, nudge;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-nudge-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  state = await import('../src/core/state.js');
  nudge = await import('../src/commands/nudge.js');
  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  paths.setVaultPath(vault);
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});
```

**Apply to doctor:**

```javascript
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';

let tmp, fakeHome, doctor;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-doctor-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  // Note: doctor reads from `homedir()/.claude/settings.json` directly (see
  // SETTINGS_DEST in init.js). The test fixture should either:
  //   (a) set HOME (Linux) / USERPROFILE (Windows) so homedir() returns tmp, OR
  //   (b) refactor doctor to accept a `home` override option for testability.
  // Recommend (a): `process.env.HOME = tmp;` before the dynamic import.
  process.env.HOME = tmp;
  doctor = await import('../src/commands/doctor.js');
});
```

**captureStdout helper** (lines 39-49 of `test/nudge.test.js`) — copy verbatim:

```javascript
function captureStdout(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (chunk, ...rest) => {
    captured += chunk;
    return true;
  };
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = orig;
  }).then(() => captured);
}
```

**Table-driven cases per `<decisions>` "Doctor test coverage":**

- All-7-checks-pass exit 0 path (seed every fixture: write a valid `~/.claude/settings.json` with all four hooks + permissions; set `vaultPath` in user config; create the vault dir on disk; place skill file; mock `claude --version` via spawning a stub).
- Per-check ✗ path: one test each for the seven labels. Assert the expected `→ <hint>` string is present in captured stdout.
- Drift line surfacing: install valid hooks but mutate the command string slightly — assert the `i hooks:` line appears AND that the `✓ hooks merged …` line still appears (drift never flips exit code).
- Exit-code non-zero on any ✗: use `node:test`'s `mock.method(process, 'exit', …)` or assert that the doctor function returns a sentinel value the test wrapper inspects (planner discretion — the existing tests don't mock `process.exit`, so the cleanest path is to have `doctorCommand` return `{ failingCount }` and only call `process.exit(1)` at the cli.js `.action(...)` wrapper boundary).
- Summary line both shapes: assert `/summary: 7\/7 passing/` for happy path; assert `/summary: \d+\/7 passing — \d+ ✗ — fix the items above and re-run/` for failing path.

**`claude --version` testability:** `hasClaudeCli` spawns `claude` from PATH. To test:
- Happy path: write an executable stub at `${tmp}/bin/claude` that prints a version and exits 0; prepend `${tmp}/bin` to `PATH`.
- Failure path: prepend an empty `${tmp}/bin-empty` to `PATH` (or unset PATH to a dir with no `claude`).

This is new test scaffolding (Phase 06's first PATH-manipulation test) — flagged in `<code_context>` "Stale-state notes" §1 ("No existing `doctor` test fixtures. First diagnostic command; the planner creates the test scaffolding shape").

---

## Shared Patterns

### chalk import + symbols

**Source:** `src/commands/init.js` line 7 (import) + lines 33/41/46/57/76/77 (usage)
**Apply to:** `src/commands/doctor.js`

```javascript
import chalk from 'chalk';
// ✓ pass:        chalk.green('✓')
// ✗ fail:        chalk.red('✗')
// · neutral:     chalk.yellow('·')
// i drift info:  chalk.dim('i')
// section head:  chalk.bold('Runtime')
// command echo:  chalk.cyan('self-wiki init --hooks-only')
// bullet:        chalk.dim('•')
```

chalk auto-disables on non-TTY and respects `NO_COLOR` / `FORCE_COLOR`. Doctor test fixtures capture stdout; stripped output won't contain ANSI codes when `chalk.level === 0` (the default under `node --test` since stdout is piped). For tests that need TTY-style assertions, set `FORCE_COLOR=0` explicitly.

### Startup convention (CLAUDE.md "Patterns to follow")

**Source:** `src/core/config.js` lines 66-77 + every command file
**Apply to:** `src/commands/doctor.js` — calls `await applyUserConfig()`, does NOT call `ensureVaultConfigured()` (vault-missing is a `✗` line, not a fatal exit).

### Path helpers

**Source:** `src/utils/paths.js` lines 31-49 + `src/commands/init.js` line 251 (`rel()` helper)
**Apply to:** `src/commands/doctor.js` — uses `tryGetVaultPath()` (returns null instead of throwing) and `getUserConfigFilePath()`. `rel()` is a 1-line helper duplicated from init; doctor can either redefine it or the plan can extract it to `src/utils/paths.js` (recommend: redefine inline — 3 lines, no upside to extracting now).

### settings.json read pattern (ENOENT tolerance)

**Source:** `src/commands/init.js` lines 91-97
**Apply to:** `src/commands/doctor.js` Tier 1 hooks + permissions checks — wrap `JSON.parse(await readFile(SETTINGS_DEST, 'utf8'))` in try/catch; treat ENOENT as `current = {}` (both hooks and permissions checks then fail ✗ naturally).

### fileExists helper

**Source:** `src/commands/init.js` lines 242-249
**Apply to:** `src/commands/doctor.js` vault path / skill file existence checks. 7-line helper; redefine inline (do not import — keeps `init.js` exports minimal).

### Test harness (tmp XDG_* + captureStdout + dynamic import)

**Source:** `test/nudge.test.js` lines 1-49
**Apply to:** `test/doctor.test.js` — adds `process.env.HOME = tmp` (or equivalent) before the dynamic `import('../src/commands/doctor.js')` so `homedir()` resolves to the test tmp dir and `SETTINGS_DEST` / `SKILL_DEST` constants resolve into the fixture.

### Pipe-table markdown style

**Source:** `README.md` lines 147-153 (How sessions get framed) + lines 200-232 (Optional integrations subsections)
**Apply to:** `README.md` Troubleshooting section — 3-row pipe table, backticks around commands, no emoji, no alignment padding tricks (the existing tables use both padded and unpadded — either is fine; prefer matching the closest sibling table).

---

## No Analog Found

All five Phase-06 files have strong analogs in the existing codebase. No "no-analog" entries.

The only **structural** novelty is doctor's `claude --version` PATH-stub test fixture (Phase 06's first test that needs to control `PATH` to inject a spawn target). The pattern can be derived from any Node child_process testing recipe; the planner picks the simplest one.

## Metadata

**Analog search scope:** `src/commands/`, `src/core/`, `src/utils/`, `src/templates/`, `test/`, `README.md`
**Files scanned:** 11 (status.js, init.js, claude.js, cli.js, paths.js, config.js, hooks.json, permissions.json, nudge.test.js, session.test.js, README.md)
**Pattern extraction date:** 2026-05-11
