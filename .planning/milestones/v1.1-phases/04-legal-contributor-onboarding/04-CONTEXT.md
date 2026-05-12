# Phase 04: Legal & Contributor Onboarding - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Land two repo-root artifacts so the repo is legally publishable inside
Liferay and a would-be contributor knows the bar before they open a PR:

1. **`LICENSE`** — replace the existing MIT/Christian-Moura file with the
   verbatim Apache License 2.0 text from
   https://www.apache.org/licenses/LICENSE-2.0.txt. The `[yyyy]` /
   `[name of copyright owner]` placeholders in the appendix are **left in
   as-is** — copyright lives in a separate `NOTICE` file.
2. **`NOTICE`** — new file at repo root. Two-line attribution:
   `Copyright 2026 The self-wiki authors` + the standard Apache 2.0
   reference line. **No `Liferay, Inc.` anywhere** (overrides
   REQUIREMENTS.md LEG-01, see D-LEG-01-OVERRIDE below). No MIT-history
   acknowledgement.
3. **`CONTRIBUTING.md`** — new file at repo root. Minimal pointer page
   (~60–100 lines), four sections in this order: Where to file issues →
   Architectural contract → Dev flow → Tests. Optimized for the
   30-second-comprehension bar in LEG-02 success criterion 2.

Out of scope for Phase 04 (already deferred in REQUIREMENTS.md):

- **LEG-03** — per-file copyright headers. Apache 2.0 doesn't require
  them; LICENSE + NOTICE at root is sufficient for compliance.
- **FEEDBACK-01** — `.github/ISSUE_TEMPLATE/*.md`. CONTRIBUTING.md
  points at GitHub Issues by URL only, no templates added.
- **README rewrite** — Phase 05 territory. Phase 04 does not touch
  `README.md` except where Phase 05 will later link to LICENSE /
  CONTRIBUTING (no Phase 04 README writes).
- **`self-wiki doctor`** — Phase 06.
- **Slack announcement / feedback section** — Phase 07.

</domain>

<decisions>
## Implementation Decisions

### LICENSE file (LEG-01)

- **D-LICENSE-TEXT:** `LICENSE` at the repo root contains the **verbatim
  Apache License 2.0 text** from
  https://www.apache.org/licenses/LICENSE-2.0.txt, including the
  "APPENDIX: How to apply the Apache License to your work" section.
  The appendix's `[yyyy]` and `[name of copyright owner]` placeholders
  are **left in as-is** — the actual copyright string lives in `NOTICE`.
- **D-LICENSE-REPLACE:** This is a **replacement**, not a new file. The
  current `LICENSE` is MIT with `Copyright (c) 2026 Christian Moura`.
  The plan must overwrite this file in place. No `LICENSE-MIT` legacy
  file is preserved.
- **D-LEG-01-OVERRIDE:** REQUIREMENTS.md LEG-01 literally says
  `(Liferay, Inc.)` as the copyright holder. The user explicitly
  rejected this during discussion: **no `Liferay, Inc.` anywhere** in
  LICENSE, NOTICE, or CONTRIBUTING.md. The plan step that updates
  LEG-01's wording (or the traceability entry) belongs in the planner's
  output. Reasoning: distribution stays inside Liferay (no public
  github), but IP attribution stays with the project / its authors —
  not the company.

### NOTICE file (new, supports LEG-01)

- **D-NOTICE:** Add a new `NOTICE` file at the repo root with the
  following exact content (two non-empty lines + Apache reference):
  ```
  self-wiki
  Copyright 2026 The self-wiki authors

  Licensed under the Apache License, Version 2.0.
  ```
- **D-NOTICE-OWNER:** Owner-of-record string is literally
  `The self-wiki authors` — forward-compatible if other Liferay
  engineers contribute later without re-attributing each.
- **D-NO-MIT-NOTE:** NOTICE does **not** acknowledge prior MIT history.
  Sole-original-author (Christian Moura) re-licenses v1.1+ under Apache
  2.0 under his own prerogative; no third-party MIT permission grant
  needs to propagate. Anyone who finds an old v1.0 fork can read the
  old commit's LICENSE — git history is the audit trail.

### Issue intake (LEG-02)

- **D-ISSUE-DEST:** CONTRIBUTING.md tells contributors to file issues at
  **https://github.com/liferay-appsec/liferay-self-wiki/issues**.
- **D-ISSUE-GUIDANCE:** Minimal — URL only. No issue templates, no
  required fields, no severity guidance, no etiquette block. Matches
  FEEDBACK-01's deferral rationale (don't design templates until we
  know the actual failure modes).
- **D-ISSUE-NOT-SLACK:** CONTRIBUTING.md does **not** mention the Slack
  channel that Phase 07 LAUNCH-02 will plan. Slack is for
  announcement-time chatter; GitHub Issues is the actionable surface.
  Phase 07 may add a "Support / Feedback" line to README that mentions
  Slack — that's Phase 07's call, not Phase 04's.

### CONTRIBUTING.md shape (LEG-02)

- **D-DOC-SHAPE:** Minimal pointer page (target: 60–100 lines, hard
  ceiling: 150). Four sections in exactly this order — issues first
  because that's the highest-frequency contributor action:
  1. **Where to file issues** — one line + the GitHub Issues URL.
  2. **Architectural contract** — read `CLAUDE.md` before opening a PR.
     **Name the four rules by name** (see D-ARCH-SECTION) so the
     30-second reader sees what they're signing up for.
  3. **Dev flow** — clone → `npm install` → `npm link` → `self-wiki init
     /path/to/your/vault`. Four shell lines in a fenced block. Use
     `npm link` (not `npm install -g .`) because this is the
     contributor dev flow, not the end-user install — CLAUDE.md
     "Testing locally" section already specifies `npm link`.
  4. **Tests** — see D-TEST-BAR and D-TEST-DETAIL.
- **D-ARCH-SECTION:** The Architectural contract section **names the
  four CLAUDE.md rules by name** (no per-rule gloss): autonomy-at-the-
  hook, daily-logs-as-source-of-truth, deterministic-vs-model,
  soft-deps-degrade-silently. Then a single sentence pointing the
  reader at `CLAUDE.md` for the full rule text. This satisfies LEG-02
  success criterion 2 literally (the four names appear in
  CONTRIBUTING.md) while keeping the file under the 30-second-read
  ceiling. Do **not** restate the rules with one-line glosses — that
  duplicates CLAUDE.md and rots when CLAUDE.md evolves.

### Testing bar (LEG-02)

- **D-TEST-BAR:** Three lines, three rules:
  1. `npm test` must pass.
  2. **New features** require new tests.
  3. **Bug fixes** require a regression test that **fails before the
     fix and passes after**.
  4. **Doc-only PRs** (`.md` changes) and **pure typo fixes** are
     exempt from the new-test requirement (but `npm test` must still
     pass).
- **D-TEST-DETAIL:** The Tests section also points contributors at the
  test infrastructure: tests live in `test/*.test.js`, use Node's
  built-in test runner (`node:test` + `node:assert/strict`), and
  contributors should **mirror the closest existing test file** rather
  than introducing new patterns. No prescriptive style guide
  (describe/it conventions, assertion-per-test rules, etc.) — let
  proximity to existing tests carry the conventions.

### Claude's Discretion

- **Exact phrasing of every section** in CONTRIBUTING.md is the
  planner/executor's call as long as the four-section structure, the
  four-rule naming, the test bar, and the issue URL all land as
  specified above.
- **Line count of CONTRIBUTING.md** can flex within 60–150 lines.
- **Markdown heading levels** — file uses `#` for the title and `##`
  for the four sections. Within sections, `###` is fine if needed but
  the goal is one screen of content.
- **The `NOTICE` filename** — capitalized `NOTICE` (Apache convention),
  no `.md` extension, no `.txt` extension. Matches what Apache 2.0's
  appendix expects and what GitHub's license detector looks for.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition + requirements

- `.planning/ROADMAP.md` §"Phase 04: Legal & Contributor Onboarding" —
  phase goal, dependencies, success criteria (3 items).
- `.planning/REQUIREMENTS.md` §LEGAL — LEG-01 and LEG-02 verbatim text.
  **Note: LEG-01 literally says `(Liferay, Inc.)` — overridden by
  D-LEG-01-OVERRIDE above.**
- `.planning/PROJECT.md` — Apache 2.0 rationale ("patent grant +
  industry-default for dev tooling; safe posture if the repo ever moves
  to public github.com").

### Architectural contract (CONTRIBUTING.md links here)

- `CLAUDE.md` — the four rules CONTRIBUTING.md names by name:
  autonomy-at-the-hook (§"Architectural rules" rule 1),
  daily-logs-as-source-of-truth (rule 2), deterministic-vs-model
  (rule 3), soft-deps-degrade-silently (rule 4). Also: §"Testing
  locally" specifies the `npm link` dev flow that CONTRIBUTING.md's
  Dev flow section mirrors.

### Files being created or replaced

- `LICENSE` (at repo root) — currently MIT/Christian-Moura; **replace**
  with Apache 2.0 verbatim text per D-LICENSE-TEXT.
- `NOTICE` (at repo root) — **new file** per D-NOTICE.
- `CONTRIBUTING.md` (at repo root) — **new file** per D-DOC-SHAPE.

### External canonical sources

- https://www.apache.org/licenses/LICENSE-2.0.txt — the verbatim text
  to drop into `LICENSE`. Planner: prefer this URL over any reformatted
  copy that ships with a Linux distro or a license-picker tool — the
  apache.org text is the canonical line-wrapped form GitHub's license
  detector matches against.

### Existing-codebase context

- `.planning/codebase/STRUCTURE.md` — repo layout convention: README,
  CLAUDE.md, LICENSE all at repo root. Phase 04 adds NOTICE and
  CONTRIBUTING.md alongside them — no new directories.
- `test/` (15 files) and `package.json` — the test surface the Tests
  section in CONTRIBUTING.md references. Test script:
  `node --test test/*.test.js`. Per PROJECT.md the suite runs to 240
  tests; do not invent that number — re-derive at planning time if it
  matters.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Existing CLAUDE.md** at the repo root (already authoritative).
  CONTRIBUTING.md does not duplicate its content — it points at it by
  name and surfaces only the four rule-names.
- **Existing test infrastructure** at `test/*.test.js`. CONTRIBUTING.md
  references this directly; planner does not need to create test
  scaffolding.
- **Existing `package.json` test script** (`node --test test/*.test.js`).
  CONTRIBUTING.md says `npm test`; planner verifies that command
  resolves to that script.

### Established Patterns

- **Single-file root artifacts.** README, CLAUDE.md, LICENSE all live
  at repo root, each is a single self-contained file. Phase 04 follows
  the same pattern: NOTICE and CONTRIBUTING.md are single files at
  repo root, no sub-directories.
- **Apache appendix convention.** The Apache 2.0 license file
  conventionally keeps `[yyyy]` and `[name of copyright owner]`
  placeholders in the appendix while the real copyright lives in
  NOTICE. This is the GitHub-license-detector-friendly shape and is
  the pattern Phase 04 uses (D-LICENSE-TEXT + D-NOTICE).

### Integration Points

- **None new.** Phase 04 is documentation + legal text only. No code
  paths, no commands, no hooks, no permissions. The only "integration"
  is that Phase 05 (README rewrite) will later link to `LICENSE` and
  `CONTRIBUTING.md` — Phase 05 owns that link wiring, not Phase 04.

### Stale-state notes (relevant to planning)

- **CLAUDE.md says "There is no test suite yet (v0.1)"** — but `test/`
  has 15 files and PROJECT.md cites a 240-test suite. CONTRIBUTING.md
  will point at CLAUDE.md as the architectural contract; that stale
  sentence will mislead a fresh contributor who follows the pointer.
  See deferred-ideas section — this is **Phase 05 cleanup**, not
  Phase 04 scope. But the planner should be aware so it doesn't try
  to "fix" CLAUDE.md as a Phase 04 side-effect.

</code_context>

<specifics>
## Specific Ideas

- **No `Liferay, Inc.` anywhere.** This is the strongest user
  preference from this discussion and it overrides REQUIREMENTS.md as
  written. Captured in D-LEG-01-OVERRIDE and reinforced in D-NOTICE-
  OWNER. The planner must not "helpfully" re-introduce the company
  name in any of the three files.
- **Apache verbatim, placeholders intact.** Per D-LICENSE-TEXT, the
  `[yyyy]` and `[name of copyright owner]` placeholders in the
  appendix stay literally in the file. Don't substitute them with a
  blank, a TODO marker, or a real string.
- **GitHub Issues URL is the *only* issue-intake mention** in
  CONTRIBUTING.md. Phase 07 owns Slack feedback wording (LAUNCH-02);
  Phase 04 must not pre-empt it.

</specifics>

<deferred>
## Deferred Ideas

- **LEG-03 — per-file copyright headers.** Already deferred in
  REQUIREMENTS.md to v1.2+. Apache 2.0 doesn't require them; root
  LICENSE + NOTICE is sufficient. Phase 04 does **not** add per-file
  headers.
- **FEEDBACK-01 — `.github/ISSUE_TEMPLATE/*.md`.** Already deferred in
  REQUIREMENTS.md. CONTRIBUTING.md references GitHub Issues by URL
  only; templates land later when the actual failure modes are known.
- **CLAUDE.md staleness cleanup.** CLAUDE.md's "no test suite yet
  (v0.1)" line is wrong (15 test files, 240-test suite per
  PROJECT.md). Belongs in Phase 05 (Public-Grade Documentation) since
  that's where doc accuracy lands. Phase 04 will create a CONTRIBUTING
  pointer to CLAUDE.md that surfaces the inconsistency — accept that
  for one phase; Phase 05 fixes it.
- **README updates** linking to LICENSE / NOTICE / CONTRIBUTING. Phase
  05 territory (DOCS-01 through DOCS-05). Phase 04 deliberately does
  not touch README.
- **NOTICE third-party-dependencies section.** Considered and dropped:
  Apache 2.0 doesn't require enumerating permissively-licensed npm
  deps; package.json + npm already make them transitively
  discoverable. Revisit if Liferay legal raises it for the v1.1
  release.
- **Dual-licensing (`LICENSE-MIT` legacy file).** Considered and
  dropped: sole-original-author re-license under D-NO-MIT-NOTE
  doesn't require it.

</deferred>

---

*Phase: 04-legal-contributor-onboarding*
*Context gathered: 2026-05-11*
