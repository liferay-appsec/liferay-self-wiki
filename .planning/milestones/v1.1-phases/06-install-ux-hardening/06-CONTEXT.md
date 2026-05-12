# Phase 06: Install UX Hardening - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Land a `self-wiki doctor` diagnostic command and a README "Troubleshooting"
section keyed to its output, so a fresh Liferay dev who runs
`npm install -g .` can verify their install in one command and follow
concrete remediation hints when anything is wrong. Three requirements
(INST-01..INST-03) and three deliverables:

1. **`self-wiki doctor`** — new CLI subcommand at `src/commands/doctor.js`.
   Runs 7 checks across 3 sections (Runtime: Node ≥ 20, `claude` CLI on
   PATH; Vault: config present + readable, vault path exists on disk;
   Claude Code wiring: hooks merged in `~/.claude/settings.json`,
   permissions merged in same file, wiki skill at
   `~/.claude/skills/wiki/SKILL.md`). Each check is ✓ or ✗; every ✗ is
   followed by a one-line remediation hint. Non-zero exit if any check
   fails; zero exit when all pass. Final `summary: N/7 passing` line
   below the sections. Soft-deps degrade silently per `CLAUDE.md` —
   missing `claude` reports ✗ with remediation but never crashes;
   missing `gh` is not checked because it is optional throughout.

2. **Three new `init` flags** — `--hooks-only`, `--permissions-only`,
   `--skill-only`. Each runs exactly one of the three Claude-Code-wiring
   steps and skips vault scaffolding. They exist so doctor's remediation
   hint for a wiring ✗ can point at a single, narrowly-scoped fix
   (`→ run `self-wiki init --hooks-only``) instead of asking the user
   to re-run full vault scaffolding to fix a hooks merge.

3. **README "Troubleshooting" section** — new section between Upgrading
   and License (Phase 05's structure ends at Upgrading; Phase 07's
   Support/Feedback section appends after License — Troubleshooting
   slots cleanly in between). Three-row symptom table mapping the
   REQ-named symptoms (sessions not opening; notes don't land; approval
   prompts during turns) to the specific doctor check label that
   diagnoses each. No inlined doctor sample output — README points at
   the command, not its rendering.

Out of scope for Phase 06 (already deferred or handed forward):

- **INST-04 (Fresh-user dry-run on a clean machine)** — already
  deferred in REQUIREMENTS.md Future Requirements; doctor itself
  reduces the need.
- **`docs/examples/doctor-output.md` sample** — ROADMAP's Phase 06
  dependency note conjectured one but neither REQ nor any selected
  decision below requires it. Phase 05 did not create one. Phase 06
  does not either.
- **Phase 07 deliverables** — `docs/launch-post.md` (LAUNCH-01) and
  the README Support/Feedback section (LAUNCH-02). Phase 06 ends the
  README with Troubleshooting + License; Phase 07 appends below.
- **`gh` and JIRA presence checks** — explicitly out of REQ-INST-01;
  consistent with `CLAUDE.md` soft-dep rule.
- **`--json` output mode for doctor** — Claude's discretion (see
  below); not required by INST-01..03.

</domain>

<decisions>
## Implementation Decisions

### Doctor output shape (INST-01, INST-03)

- **D-OUTPUT-GROUPED:** Doctor output groups the 7 checks into three
  sections with bold headers in this fixed order:
  1. **Runtime** — Node ≥ 20, `claude` CLI on PATH
  2. **Vault** — config present + readable, vault path exists on disk
  3. **Claude Code wiring** — hooks merged, permissions merged, wiki
     skill installed
  Headers match the three categories above verbatim; section order is
  load-bearing (matches the failure-cascade — a missing Node bricks
  everything below; a missing vault bricks the wiring section's
  upstream dependency on a configured vault). Rejected: flat 7-item
  list (compact but harder to scan); flat-list + summary footer (the
  grouped shape already conveys structure).
- **D-OUTPUT-LABELS:** The stable contract the README quotes is the
  **English check label**, not a bracketed ID. Each check renders as
  `✓ <label>` or `✗ <label>` (with chalk colour on TTY). The README
  Troubleshooting table quotes labels verbatim ("look at the
  '<label>' line"). **Once chosen, labels are load-bearing** — the
  planner picks the seven exact strings and the executor preserves
  them; any future rewording requires a coordinated README update.
  Rejected: bracketed `[node-version]` style IDs (noisy; ID is
  load-bearing in addition to the label, with no payoff for human
  readers); hybrid ID + label (two anchors to choose from = drift
  risk).
- **D-SUMMARY-LINE:** Below the three sections, a blank line then a
  terse `summary:` line:
  - All passing: `summary: 7/7 passing`
  - Any failing: `summary: N/7 passing — M ✗ — fix the items above and re-run`
  Renders unambiguous verdict; scriptable read-without-counting;
  closes the report. Used in conjunction with the non-zero exit code
  for `M > 0` cases.

### Hook + permission check strictness (INST-01)

- **D-WIRING-TIER:** Both the hooks check and the permissions check
  use a **two-tier shape**:
  - **Tier 1 (presence — gates ✓/✗ and exit code):**
    - Hooks ✓ = each of the four hook events (`SessionStart`, `Stop`,
      `SessionEnd`, `UserPromptSubmit`) has at least one command in
      `~/.claude/settings.json` whose command string contains the
      literal token `self-wiki`. Missing any event = ✗.
    - Permissions ✓ = at least one entry in `permissions.allow` of
      `~/.claude/settings.json` starts with `Bash(self-wiki ` (or
      matches the same shape). Zero matches = ✗.
  - **Tier 2 (drift — informational, never flips exit code):** doctor
    compares present commands/entries against
    `src/templates/{hooks,permissions}.json` verbatim and surfaces
    a single info line per category (see D-DRIFT-LINES below) when
    drift exists.
  Rejected: exact-match-against-template-as-the-pass-bar (drift would
  fail doctor on every install whose `hooks.json` lagged a self-wiki
  upgrade — punishing dormant installs); substring-only with no
  Tier 2 (loses the diagnostic surface that flags manual edits and
  upgrade-lag).
- **D-DRIFT-LINES:** Tier 2 drift renders as **separate info lines
  per category** (not combined, not item-by-item):
  - `i hooks: N command(s) differ from template — run `self-wiki init --hooks-only` to refresh`
  - `i permissions: N entry/entries missing — run `self-wiki init --permissions-only` to refresh`
  Lines appear inside the Claude-Code-wiring section, after the three
  `✓/✗` lines and before the next section. Rejected: one combined
  drift line (loses precision needed for the README's "permission
  prompts during turns" symptom row); per-item verbose listing
  (noise; the per-flag remediation already lets the user fix it
  without seeing each item).

### Remediation hint depth (INST-02)

- **D-HINT-SHAPE:** Every ✗ is followed by exactly one indented line
  starting with `→ ` (e.g. `    → run `self-wiki init <vault>``). One
  line per ✗ — no JSON snippets, no multi-line copy-paste blobs in the
  doctor output. Rejected: copy-pasteable JSON for settings.json fixes
  (doctor balloons to 30+ lines on a broken install; users who want
  a command find it after scrolling).
- **D-NARROW-FLAGS:** Phase 06 adds three new flags to `self-wiki init`
  so each wiring ✗ can point at a single-step fix that does not
  re-scaffold the vault:
  - `--hooks-only` — merge hooks into `~/.claude/settings.json` only.
    Skips vault scaffold, permissions merge, skill install.
  - `--permissions-only` — merge permissions only. Skips other steps.
  - `--skill-only` — install `~/.claude/skills/wiki/SKILL.md` only.
  Semantics: `--X-only` runs only the X step and skips vault
  scaffolding; specifying any of the three flags implies the others
  are skipped. Combining two `--X-only` flags should error (or
  collapse to "do both, skip everything else" — planner discretion;
  see Claude's Discretion). The existing `--no-hooks` / `--no-skill`
  negative selectors stay; the new positive selectors compose
  cleanly with them at the planner's discretion (recommend: implement
  `--X-only` as syntactic sugar for "run only X, skip the rest" and
  short-circuit the rest of the init flow).
- **D-EXTERNAL-HINTS:** For the two checks doctor cannot fix
  (Runtime / Node ≥ 20 and Runtime / `claude` CLI on PATH), the hint
  is a **bare install pointer**:
  - Node ✗: `→ install Node ≥ 20 (e.g. `nvm install 20`)`
  - `claude` ✗: `→ install Claude Code: https://docs.claude.com/en/docs/claude-code/setup`
  Terminal-friendly; the URL is one Ctrl-click in most terminals.
  Rejected: soft pointers without URL / version manager (less helpful
  to a first-install Liferay dev); "see README §Troubleshooting"
  pointer (extra round-trip when the answer is a one-liner).
- **D-VAULT-HINTS:** For the two vault checks:
  - Vault config not present ✗: `→ run `self-wiki init <vault>`
    to scaffold one`
  - Vault path missing on disk ✗: `→ vault path `<resolved-path>`
    does not exist — run `self-wiki init <vault>` to recreate or
    `self-wiki config vault <path>` to point at an existing one`
  The second hint inlines the resolved path so the user knows
  which path is missing (helpful when they moved their vault).

### README Troubleshooting (INST-03)

- **D-PLACEMENT:** New section lands **between Upgrading and License**
  in the existing Phase-05 demo-first README. Final section order:
  `… → Parallel sessions → Upgrading → Troubleshooting → License`.
  Phase 07 (LAUNCH-02) appends `Support / Feedback` after License.
  Rejected: right-after-Install (pushes the daily-flow happy path
  deeper); right-before-Configuration (compromise placement with no
  upside over tail-placement).
- **D-SYMPTOM-ROWS:** Troubleshooting table is **exactly the three
  REQ-INST-03 symptom rows** — not 1-row-per-check:

  | Symptom | Doctor check | Fix |
  |---|---|---|
  | Sessions not opening in new repos | `<hooks label>` ✗ | run `self-wiki init --hooks-only` |
  | Notes I drop don't land in the daily log | `<vault config>` / `<vault path>` ✗ | run `self-wiki init <vault>` |
  | Approval prompts during `claude` turns | `<permissions label>` ✗ or `i permissions:` drift line | run `self-wiki init --permissions-only` |

  Column 2 quotes the doctor check label verbatim (placeholder until
  the planner picks the seven exact strings). The planner replaces
  `<labels>` with the chosen strings. Rejected: 7 rows / one per
  check (overshoots INST-03's "common failure modes" scope); two-
  section symptoms-table + doctor-output-reference-table (extra
  structure for a README that's already getting a new section;
  reference info lives in the doctor command's own output).
- **D-NO-SAMPLE:** Troubleshooting section does **not inline a doctor
  sample output** (neither happy-path nor failure). The opening
  sentence is: `Run `self-wiki doctor` to diagnose your install.
  Each ✓/✗ is followed by a one-line remediation. Below: common
  symptoms keyed to specific doctor checks.` Then the table.
  Lightest-weight; immune to doctor-output drift; aligns with
  CLAUDE.md's "no sync risk between README and source" principle.
  Rejected: happy-path 12-line sample (load-bearing on exact doctor
  output format — drift risk); failure-mode 15-line sample (same
  cost plus a "which scenario to pick" decision).
- **D-TROUBLESHOOTING-NO-EMOJI:** The Troubleshooting section uses
  the same no-emojis-in-markdown convention every other README
  section follows (Phase 05's D-NO-P07-STUB / Phase 04's repo-root
  artifact conventions). The doctor command output uses chalk
  colours on TTY (matches `init.js` / `status.js` convention) but
  the README quotes plain text.

### Claude's Discretion

- **`--json` mode for doctor.** Mirroring `self-wiki status --json`.
  Useful for scripts that want a machine-readable report. Not
  required by INST-01..03. The planner has discretion to ship it
  in Phase 06 or defer to v1.2 — if shipped, the JSON shape should
  mirror the grouped sections (`{ runtime: {...}, vault: {...},
  wiring: {...}, summary: { passing: N, total: 7 } }`) and Tier 2
  drift lines surface as `drift: { hooks: [...], permissions: [...] }`.
- **Exit-code stratification.** REQ-INST-02 says non-zero on any
  ✗ — a single `1` satisfies this. Planner has discretion to
  distinguish (e.g. `2` for vault-not-configured, `3` for
  wiring-not-merged) if it helps a wrapper-script use case. Default:
  single `1`.
- **Vault path "exists on disk" depth.** REQ says "vault path exists
  on disk" — minimum is `fs.access(path)`. Planner has discretion to
  extend to `fs.access(path, W_OK)` (writability check) since init
  later writes there. If extended, the ✗ message distinguishes
  "missing" vs "not writable".
- **Skill-file content drift.** D-WIRING-TIER applies the two-tier
  shape to hooks + permissions. The wiki skill check stays
  **existence-only** (✓ if the file exists, ✗ if not). Planner has
  discretion to add a Tier 2 drift line for skill content
  (compare against `src/templates/skill/SKILL.md`) if symmetry feels
  load-bearing; otherwise omit. Recommend: omit — the skill file is
  copied verbatim by init, and content-drift fixes require the same
  `--skill-only` flag whether or not doctor surfaces the drift.
- **`--hooks-only` + `--permissions-only` combinability.** D-NARROW-FLAGS
  describes the positive-selector semantics. Whether
  `init --hooks-only --permissions-only` is an error or collapses to
  "do both, skip the other one" is planner discretion. Recommend:
  collapse (the user has already typed two explicit selectors;
  erroring would be hostile). Document the collapse rule in the
  flag descriptions.
- **Plan ordering inside Phase 06.** REQUIREMENTS.md notes
  "INST-01 (`doctor` exists) ships before INST-03 (README references
  doctor output shape)". The planner enforces this — doctor's
  output (including the seven chosen labels) is locked in commit
  before the README Troubleshooting plan commits, so the table's
  Column 2 labels match doctor's actual output. The `--X-only`
  flags can ship in either the doctor plan or as a sibling plan;
  planner discretion. Recommend: bundle `--X-only` flags into the
  doctor plan (they exist to serve doctor's remediation hints —
  splitting would create a window where doctor hints reference
  unimplemented flags).
- **Doctor test coverage.** Phase 05 closed v1.0 with 240/240 tests
  across 15 test files. Phase 06's planner adds `test/doctor.test.js`
  exercising at least: all-checks-pass exit 0 path, each individual
  ✗ path with the expected hint string, drift line surfacing, exit
  code non-zero on any ✗, summary line both shapes. Coverage depth
  is planner discretion; the existing pattern (per-command test
  file with table-driven cases) is the model.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition + requirements

- `.planning/ROADMAP.md` §"Phase 06: Install UX Hardening" — phase
  goal, dependencies (Phase 05 ships first), success criteria
  (5 items). Note the cross-phase dependency: Phase 07's launch post
  references `self-wiki doctor` as the post-install verification
  step; doctor's name and command shape are locked here.
- `.planning/REQUIREMENTS.md` §INSTALL — INST-01, INST-02, INST-03
  verbatim text. Plus the intra-phase note: INST-01 ships before
  INST-03 so the README table's Column 2 labels match doctor's
  actual output.
- `.planning/PROJECT.md` — distribution model (clone +
  `npm install -g .`, no npm publish); Liferay-specific defaults
  rationale; v1.1 milestone goal ("a fresh dev can clone, install,
  and trust it within their first hour" — doctor is the trust step).

### Carried-forward decisions

- `.planning/phases/05-public-grade-documentation/05-CONTEXT.md` —
  Phase 05's demo-first README structure ends at Upgrading
  (D-README-ORDER); Phase 06's Troubleshooting slots between
  Upgrading and License per D-PLACEMENT. Also: no emojis in markdown
  convention. Also: `**Example output:**` literal label, no
  `docs/examples/` index file — relevant if any future doctor sample
  artifact gets added (Phase 06 ships none).
- `.planning/phases/04-legal-contributor-onboarding/04-CONTEXT.md` —
  no-`Liferay, Inc.`-anywhere rule (D-LEG-01-OVERRIDE). Doctor's
  output and the README Troubleshooting section must respect this
  if any copyright-shaped line appears (no plans to print one).

### Architectural rules + tool surface

- `CLAUDE.md` — four architectural rules. Most load-bearing for
  Phase 06:
  - **Soft dependencies degrade silently** — `claude` missing
    surfaces a ✗ with remediation; doctor never crashes on its
    absence. `gh` not checked at all.
  - **Deterministic vs. model** — doctor is 100% deterministic
    (file checks, version compares, JSON parses). No `claude -p`
    calls. No prompt templates.
  - The "Patterns to follow" section's rule: **"Adding a new
    `self-wiki` subcommand the skill or model is expected to
    invoke" means adding the matching `Bash(self-wiki <verb> *)`
    rule to `src/templates/permissions.json`.** doctor is invoked
    by the user, not the skill — but the planner should still
    decide whether to add it to permissions (recommend: no, doctor
    is a manual diagnostic, not a skill-invoked verb; if added
    later, doctor's own permissions check picks it up). See
    Claude's Discretion if revisiting.
- `README.md` (current, Phase-05-shaped) — the file being amended.
  Hook section (lines 1-5), demo-first ordering, and dense
  reference tail all preserved. New section inserts at the spot
  named in D-PLACEMENT.

### Code surface being created or modified

- `src/commands/doctor.js` (new) — the seven checks + their
  remediation hints + the summary line + exit-code wiring.
- `src/commands/init.js` (modify) — add `--hooks-only`,
  `--permissions-only`, `--skill-only` flag handling. Existing
  proposeHooks / proposePermissions / skill-install functions
  stay; the new flags choose which to invoke and skip the vault
  scaffold.
- `src/cli.js` (modify) — wire the new `doctor` subcommand and
  the three new `init` flags.
- `README.md` (modify) — insert Troubleshooting section between
  Upgrading and License.
- `test/doctor.test.js` (new) — unit + integration coverage for
  the seven checks. Coverage depth at planner discretion (see
  Claude's Discretion).

### Existing-codebase context

- `src/templates/hooks.json` — the four hook events (SessionStart,
  Stop, SessionEnd, UserPromptSubmit) and their command strings.
  Tier 2 drift detection compares against this verbatim.
- `src/templates/permissions.json` — nine `Bash(self-wiki …)`
  entries. Tier 2 drift detection compares against this verbatim.
- `src/templates/skill/SKILL.md` — the skill file copied to
  `~/.claude/skills/wiki/SKILL.md` by `init`. Existence check
  uses this as the source.
- `src/core/claude.js` — `hasClaudeCli()` already implements the
  `claude --version` probe with timeout + soft-fail. doctor reuses
  this (do not reimplement).
- `src/core/config.js` — `applyUserConfig()` + `readUserConfig()`
  + `getVaultDefaults()`. Doctor calls `applyUserConfig()` early so
  vault-path is resolved; treats `vaultPath === null` as "vault
  config not present" ✗.
- `src/utils/paths.js` — `getVaultConfigFilePath()`,
  `getUserConfigFilePath()`, `getVaultPath()`/`tryGetVaultPath()`.
  Doctor uses the `try*` variants to avoid throws on missing config.
- `src/commands/status.js` — the existing TTY/JSON pattern doctor
  may mirror if `--json` ships. Reference implementation for
  applying user config at startup and rendering colour output.
- `src/commands/init.js` — `proposeHooks()` and `proposePermissions()`
  already implement the merge logic the new `--X-only` flags wire
  up. Reading `mergeHooks()` / `describeHookDiff()` helps the
  planner understand what "drift" detection needs.

### Existing surface NOT modified by Phase 06

- `src/templates/hooks.json` — content unchanged. Tier 2 drift
  reads it; nothing writes it.
- `src/templates/permissions.json` — content unchanged. doctor is
  not added to `permissions.allow` (it's manually invoked by the
  user, not the skill).
- `src/templates/skill/SKILL.md` — content unchanged.
- `.planning/codebase/STRUCTURE.md`, `CONVENTIONS.md` — read for
  pattern conformance; not edited.
- `docs/examples/*` — Phase 05's four artifacts unchanged.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`hasClaudeCli()` in `src/core/claude.js`.** Already implements
  the `claude --version` probe with 5-second timeout and SIGKILL
  grace. doctor's "Claude CLI on PATH" check calls this — do not
  reimplement. The function returns a clean boolean and handles
  hung-binary as `false` (consistent with soft-deps-degrade).
- **`mergeHooks()` / `describeHookDiff()` in `src/commands/init.js`.**
  The hook merge logic and human-readable diff are already factored
  out. Tier 2 drift detection can reuse them: read current settings,
  call `mergeHooks(current, desired)`, then compare the merge result
  to `current` and surface the diff as the info line. Same shape for
  permissions if a `mergePermissions()`/`describePermissionsDiff()`
  pair exists — the planner should check and refactor if needed.
- **chalk pattern.** `init.js` and `status.js` use `chalk.green('✓')`,
  `chalk.red('✗')`, `chalk.yellow('·')`, `chalk.dim`, `chalk.bold`,
  `chalk.cyan`. Doctor follows this exactly. chalk auto-disables on
  non-TTY (CI-safe by default; respects `NO_COLOR` / `FORCE_COLOR`).
- **`applyUserConfig()` startup pattern.** Every command starts with
  `await applyUserConfig()` so vault-path is resolved from
  `~/.config/self-wiki/config.json`. Doctor follows this convention
  but does **not** call `ensureVaultConfigured()` — a missing vault
  is a ✗ to report, not a fatal exit. CLAUDE.md's "applyUserConfig
  at startup" rule applies; `ensureVaultConfigured` is the part
  doctor skips.
- **The seven-check shape is mostly stat / readFile / spawn.** No
  network, no claude -p, no model invocations. Trivial to test
  with `fs.promises` mocks + a fake `~/.claude/settings.json`.

### Established Patterns

- **One subcommand per file in `src/commands/`.** Existing files:
  `close-orphans.js`, `config.js`, `init.js`, `note.js`, `nudge.js`,
  `rebuild.js`, `report.js`, `self-review.js`, `session.js`,
  `status.js`, `update-topics.js`. Phase 06 adds `doctor.js` — same
  shape (exports an async function, wired in `src/cli.js`).
- **Per-command test files in `test/`.** 15 test files at v1.0
  close, 240 tests passing. Phase 06's `test/doctor.test.js`
  follows the same per-command pattern.
- **No-emojis-in-markdown convention.** Carry-forward from Phase
  04 / 05. Doctor's command output uses ASCII ✓ / ✗ / →
  (these are not emoji per CLAUDE.md's convention — they are
  Unicode geometric symbols, matching `init.js`'s existing
  `chalk.green('✓')` pattern).
- **Soft-fail / never-crash convention.** Every hook-invocable
  command appends `|| true` in the templates and is expected to
  fail silently. Doctor is user-invoked, so it CAN exit non-zero
  — but its individual checks (the `claude --version` probe, JSON
  parse of settings.json) wrap their own errors and surface a ✗
  rather than throwing.

### Integration Points

- **`src/cli.js`** — wire `program.command('doctor').action(doctorCommand)`
  in the same style as the existing subcommands. Adds three flags
  to the existing `init` command via `.option('--hooks-only', …)` etc.
- **`~/.claude/settings.json`** — the file doctor reads (does not
  write). The same file `init` writes via `proposeHooks` /
  `proposePermissions`.
- **No new hooks, no new permissions.** Phase 06 does not touch
  `src/templates/{hooks,permissions}.json`. Doctor is user-invoked.

### Stale-state notes (relevant to planning)

- **No existing `doctor` test fixtures.** First diagnostic command;
  the planner creates the test scaffolding shape (probably a
  per-test temp `~/.claude` directory; mock `claude --version` via
  PATH manipulation or `child_process.spawn` test injection).
- **No `docs/examples/doctor-output.md` exists.** ROADMAP's
  Phase 06 dependency note conjectured one but neither REQ nor any
  decision in this CONTEXT requires it. Phase 06 ships none.
- **README Troubleshooting section does not exist yet.** Phase 05
  ended the README at `## Upgrading` then `## License`. Phase 06
  inserts the new section between them; no prior content to merge
  with.

</code_context>

<specifics>
## Specific Ideas

- **The seven check labels are load-bearing.** D-OUTPUT-LABELS says
  English short-strings are the README contract. The planner picks
  exactly seven strings; the executor preserves them verbatim
  in both doctor's output and the README Troubleshooting table's
  Column 2. A pre-execution sanity check: grep the chosen label
  strings in `src/commands/doctor.js` AND in `README.md` — both must
  match before the phase commits.
- **`init --hooks-only` skips vault scaffolding.** D-NARROW-FLAGS
  is explicit: the flag's job is to fix a wiring drift without
  re-asking the user to confirm vault paths or seed `.self-wiki/
  config.json`. The planner should re-read `src/commands/init.js`'s
  top-level structure and route `--hooks-only` to call ONLY
  `proposeHooks()` and skip everything else (no `mkdir`, no
  `setVaultPath`, no `writeUserConfig`).
- **The summary line is terse, no metrics theatre.** D-SUMMARY-LINE
  is literal: `summary: 7/7 passing` or
  `summary: 5/7 passing — 2 ✗ — fix the items above and re-run`.
  No "percent complete" framing, no decorative bars, no time
  measurements. The model's voice does not appear anywhere in
  doctor — it's 100% deterministic output.
- **Doctor's first line is the command echo.** Recommend:
  `self-wiki doctor` echoed bold at the top (matches `init.js`'s
  `chalk.bold('self-wiki init → <path>')` opener). Planner
  discretion to skip — not load-bearing.
- **The Troubleshooting table uses pipe-table markdown.** Same
  format as the existing README tables ("How sessions get framed",
  Optional integrations). No fancy alignment, no emoji, no
  collapsed details. Matches Phase 05's table conventions.
- **The fix column in the Troubleshooting table names a single
  command.** `run `self-wiki init --hooks-only``,
  `run `self-wiki init <vault>``, `run `self-wiki init --permissions-only``.
  Backticks around the command; no surrounding prose. The same
  text the doctor remediation hint uses (consistency between
  the two surfaces is the point of choosing single-command
  pointers in D-HINT-SHAPE).

</specifics>

<deferred>
## Deferred Ideas

- **`docs/examples/doctor-output.md` happy-path sample.** Conjectured
  in ROADMAP's Phase 06 dependency note; rejected here by D-NO-SAMPLE
  (README does not inline doctor output) and the absence of a
  REQ-INST-03 ask for an example file. Carry forward to v1.2 only if
  a launch-post (Phase 07 / LAUNCH-01) reader friction signal shows
  up.
- **`--json` mode for doctor.** Considered as a discretion item;
  recommend deferring to v1.2 unless the planner has appetite. No
  active script consumer; the human surface is the priority for v1.1.
- **Exit-code stratification** (different non-zero codes per failure
  category). Discretion in this CONTEXT; recommend single `1` for
  v1.1. Stratify only if a wrapper-script use case emerges.
- **Tier 2 drift detection for the wiki skill file.** Considered as
  symmetry with hooks/permissions; rejected because skill-content drift
  fixes use the same `--skill-only` flag whether or not doctor
  surfaces the drift line. Reopen if Phase 07's launch surfaces
  reports of "skill installed but stale".
- **`init --skill-only`-style flags for non-wiring subcommands.**
  The three `--X-only` flags exist for the wiring section's
  remediation symmetry. No equivalent need for vault-scaffold-only,
  user-config-only, etc. — `init <vault>` is already the right
  command for those.
- **Adding `doctor` to `~/.claude/settings.json` permissions.allow.**
  The skill does not invoke `self-wiki doctor` — the user does.
  No permission entry needed. Reopen if a future skill iteration
  wants to run doctor automatically (e.g. on a SessionStart-hook
  failure path).
- **One-row-per-check Troubleshooting table.** Considered as the
  "expanded" symptom-rows option; rejected by D-SYMPTOM-ROWS.
  Three rows match INST-03's named symptoms exactly. A user
  scanning all seven check labels can just run `self-wiki doctor`.
- **Inlined doctor sample output in README.** Considered as both
  happy-path and failure-mode flavours; rejected by D-NO-SAMPLE.
  Same drift cost as Phase 05's avoided sync issues with
  `docs/examples/`. Reopen if the launch surfaces "I want to know
  what doctor looks like before I run it" feedback.
- **INST-04 (Fresh-user dry-run on clean machine).** Already
  deferred in REQUIREMENTS.md. Phase 06's doctor reduces the need
  for a dry-run pass; reopen only if a launch-post reader hits a
  failure mode doctor missed.

</deferred>

---

*Phase: 06-install-ux-hardening*
*Context gathered: 2026-05-11*
