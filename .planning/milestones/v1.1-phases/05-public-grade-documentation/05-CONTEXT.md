# Phase 05: Public-Grade Documentation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Land the public-grade documentation surface so a Liferay engineer can read
the README in five minutes, see real-shaped artifacts proving the tool
works, and understand what the tool captures in their vault before
installing. Five requirements (DOCS-01..DOCS-05) and four artifact files
under `docs/examples/`:

1. **`README.md`** — restructured demo-first (inverts today's
   install-first ordering). The current 2-paragraph hook stays nearly
   verbatim. New section order: Hook → What you get → What gets logged in
   your vault → Install → How sessions get framed → Daily commands →
   Weekly reports + topic pages → Optional integrations → Configuration
   → Parallel sessions → Upgrading. The placeholder `<this-repo-url>` is
   replaced with `liferay-appsec/liferay-self-wiki` (DOCS-02).
2. **`docs/examples/`** — new directory, four scrubbed reference
   artifacts: `daily-log.md`, `weekly-report.md`, `monthly-report.md`,
   `self-review.md`. The README's "What you get" section links to each
   and inlines short excerpts (~10-15 lines) of three of them (daily,
   weekly, self-review). The monthly is link-only — no inline snippet.
3. **"What gets logged in your vault" section in README** (DOCS-04) —
   two lists (captured / not captured) + one-line scrub pointer +
   `**Nothing leaves your machine automatically.**` paragraph.

Out of scope for Phase 05 (handed forward or deferred elsewhere):

- **Support / Feedback README section** — Phase 07 (LAUNCH-02). Phase 05
  ends the README at Upgrading; Phase 07 appends.
- **`self-wiki doctor` command and README Troubleshooting section** —
  Phase 06 (INST-01..INST-03).
- **`docs/launch-post.md`** — Phase 07 (LAUNCH-01).
- **Video / GIF demos** (DOCS-06) — deferred to v1.2+.
- **CI green-check badge in README** (CI-01) — deferred.
- **Real-vault scrubbing pipeline** — bypassed entirely by the
  synthesized-from-scratch decision below. No scrub tooling is built.

</domain>

<decisions>
## Implementation Decisions

### Example artifacts: source & continuity (DOCS-03, DOCS-05)

- **D-EXAMPLES-SOURCE:** Four `docs/examples/` artifacts are
  **synthesized from scratch** — fictional content from end to end. No
  real-vault material is copied in, scrubbed, or paraphrased. Zero
  leakage risk by construction. Rejected: real-vault aggressive
  scrubbing (high review risk; one missed name/title leaks) and the
  hybrid "real shape, fictional content" approach (highest effort with
  no incremental authenticity over pure synthesis given the audience).
- **D-EXAMPLES-CONTINUITY:** The four artifacts form **one coherent
  fictional storyline**. Same fictional engineer; same fictional ticket
  set (EXAMPLE-001, EXAMPLE-002, EXAMPLE-003 minimum); the daily log's
  ticket activity surfaces in the weekly's themes; the weekly's
  themes surface in the monthly; the monthly is one of the sources the
  self-review draft cites. A reader walking from `daily-log.md` to
  `self-review.md` should see the synthesis chain working — daily
  detail → weekly themes → monthly threads → self-review accomplishments
  tagged by Liferay value.
- **D-EXAMPLES-PREFIX:** Fictional tickets use the **`EXAMPLE-NNN`**
  prefix (e.g. `EXAMPLE-001`, `EXAMPLE-002`, `EXAMPLE-003`). Chosen
  over `LPD-99xxx` (the real Liferay prefix in a fictional range)
  because `EXAMPLE-` is unambiguously a demo — no risk of a reader
  briefly mistaking a 99xxx-range LPD ticket for real.
- **D-EXAMPLES-DATES:** Filenames inside the artifacts use **generic
  placeholders**: `Daily/YYYY-MM-DD.md`, `Reports/YYYY-Www.md`,
  `Reports/YYYY-MM.md`, `Reviews/YYYY-cycle1.md`. Content inside each
  file may still use specific times (HH:MM) and weekday names (Mon /
  Tue / ...) for realism. The trade is concreteness for never-goes-
  stale — the examples don't age in 2027+.
- **D-EXAMPLES-REGEX-DEMO:** The example daily log shows **ticket
  detection working** (the session header lists `Ticket: EXAMPLE-001`).
  To make this faithful, the daily log file opens with a small HTML
  comment indicating the vault config used:
  `<!-- vault config: { ticketRegex: 'EXAMPLE-\\d+' } -->`. The reader
  sees the happy-path detection, with the explicit acknowledgement
  that the example uses a non-default regex. Rejected: showing the
  bare-repo-name fallback path (less compelling — readers want to see
  the value prop, not the fallback).
- **D-EXAMPLES-SELF-DESCRIBE:** Each file in `docs/examples/` opens
  with an HTML-comment header (visible in raw view, invisible in
  rendered markdown) explaining: "This is a fictional scrubbed example
  for self-wiki. `EXAMPLE-NNN` tickets are made up. For the full
  storyline see ../../README.md." No `docs/examples/README.md` index
  file is created — the disclaimer travels with every file.

### README structure (DOCS-01, DOCS-02)

- **D-README-ORDER:** New top-level section order:
  1. (Title + 2-paragraph hook, see D-README-HOOK)
  2. **What you get** (DOCS-03 lands here)
  3. **What gets logged in your vault** (DOCS-04 lands here)
  4. **Install** (DOCS-02 real-URL replacement lands here)
  5. **How sessions get framed**
  6. **Daily commands**
  7. **Weekly reports**
  8. **Topic pages**
  9. **Optional integrations** (gh / JIRA)
  10. **Configuration**
  11. **Parallel Claude Code sessions**
  12. **Upgrading**
  (END — Phase 07 appends Support / Feedback)
  Pure inversion of today's install-first README; everything past
  Install retains its existing depth.
- **D-README-HOOK:** Keep the **current 2-paragraph hook nearly
  verbatim** — "A self-writing personal wiki for engineers..." + "The
  model: Claude Code hooks frame sessions; a skill instructs Claude to
  drop terse decision/outcome notes...". Rejected: compression to a
  one-sentence hook + audience tag (loses the architectural framing
  that helps readers decide if the model fits their workflow).
- **D-WHAT-YOU-GET-SHAPE:** "What you get" leads with the existing
  directory tree (showing `<your-vault>/{Daily,Reports,Tickets,
  Components,Reviews,.self-wiki}/`), then per-artifact subsections
  in this order: Daily log → Weekly report → Monthly report →
  Self-review draft. Each subsection has the format described in
  D-SNIPPET-STYLE below.
- **D-NO-P07-STUB:** Phase 05's README **does not pre-create a Support
  / Feedback section**. Phase 07 (LAUNCH-02) appends it cleanly. No
  TODO marker, no placeholder. Until Phase 07 ships, `CONTRIBUTING.md`
  (from Phase 04) is the canonical "where to file issues" surface.

### README snippet shape (DOCS-03)

- **D-SNIPPET-LEN:** Each inline excerpt in "What you get" is
  **short — roughly 10-15 lines** with `...` for truncation. The full
  file lives in `docs/examples/`. Rejected: medium (~25-40 lines —
  pushes the README past the 5-minute scan), very short (3-5 lines —
  too thin to convey value), and collapsible `<details>` (creates a
  sync risk between README and `docs/examples/`).
- **D-SNIPPET-MONTHLY:** The monthly report gets **a 1-paragraph
  subsection with a link, but no inline snippet**. The paragraph
  describes the monthly as "the themed synthesis at
  `Reports/<YYYY-MM>.md`, consumed by `self-wiki self-review` as the
  primary input". Locked because DOCS-03 only requires inline daily /
  weekly / self-review snippets; the monthly is in `docs/examples/` but
  not in the README snippet block.
- **D-SNIPPET-STYLE:** Each inline snippet uses the format:

  ```markdown
  ### [Artifact name]

  **Example output:**

  ```markdown
  [scrubbed 10-15-line excerpt with `...` for truncation]
  ```

  [→ Full example: docs/examples/[file].md]
  ```

  The literal phrase `**Example output:**` appears in bold before each
  fenced block, satisfying DOCS-03 success criterion 3 verbatim. The
  fence uses the `markdown` language tag (GitHub renders this fine and
  the syntax highlighting is light enough not to distract). Rejected:
  GitHub callout blocks (`> [!NOTE]` style) because nested fences
  inside blockquoted callouts are a known cross-renderer sharp edge,
  and plain fences without the label (doesn't literally contain the
  "Example output:" phrase the spec cites).
- **D-SNIPPET-LINK:** The link line below each snippet uses the form
  `[→ Full example: docs/examples/<file>.md](docs/examples/<file>.md)`
  — the arrow disambiguates the link from prose; the relative path is
  GitHub-friendly.

### Privacy posture (DOCS-04)

- **D-PRIVACY-DEPTH:** The "What gets logged in your vault" section is
  **minimum viable depth**: two bullet lists (Captured / Not captured)
  + a one-line scrub pointer + a `**Nothing leaves your machine
  automatically.**` paragraph. Rejected: a full "how to scrub" with
  copy-paste commands (technical depth where the section should be
  reassurance) and a before/after scrub mini-example (meta-weird to
  show a scrub of a fictional example).
- **D-PRIVACY-LISTS:** The two lists enumerate at least the items in
  REQUIREMENTS.md DOCS-04 (branch names, ticket IDs, `self-wiki note`
  text, force-push counts; file diffs, prompts, AI responses). The
  planner should verify the lists are accurate against the actual
  logger / topics implementation before committing. Integration-
  dependent captures (PR titles from `gh`, JIRA ticket titles)
  should be annotated `(only if <integration> is configured)` so a
  reader knows which items only apply when they opted in.
- **D-PRIVACY-EXTERNAL:** Add an explicit
  `**Nothing leaves your machine automatically.**` paragraph below
  the scrub pointer. Content: "self-wiki itself makes no network
  calls. `claude -p` is invoked only when you explicitly run a
  synthesis command (`self-wiki report`, `self-review`). `gh` and
  JIRA are read-only, opt-in, and only invoked during `session
  open`. Your daily logs never leave your vault unless you copy
  them out." Rejected: the deeper "what `claude -p` actually sees"
  breakdown (this turns Privacy into a security audit; the
  reader who wants that depth can read the synthesis prompts in
  `src/templates/prompts/`).
- **D-PRIVACY-NOTE-ORIGIN:** Do **not** call out in this section that
  `self-wiki note` lines are typically dropped by Claude (via the
  wiki skill) rather than typed manually. The "How sessions get
  framed" table already conveys this. Keeping Privacy laser-focused
  on the privacy answer.

### Claude's Discretion

- **CLAUDE.md staleness cleanup.** Phase 04's CONTEXT.md flagged that
  CLAUDE.md contains a stale "There is no test suite yet (v0.1)" line
  in the "Testing locally" section and explicitly handed the fix to
  Phase 05. Phase 05 has discretion to fix this as a side-effect of
  the demo-first rewrite — the test surface is real (15 test files,
  240 tests per PROJECT.md). New wording should reflect the actual
  state: `npm test` runs `node --test test/*.test.js`, ~240 tests
  pass on v1.0 close. The planner should add this as a small
  dedicated plan or fold it into the README-rewrite plan; either way,
  the line should be corrected in the same milestone as the README
  rewrite so contributors don't get conflicting signals.
- **README → LICENSE / NOTICE / CONTRIBUTING.md links.** Phase 04
  landed these three files but did not update the README. Phase 04's
  CONTEXT.md explicitly said: "Phase 05 owns that link wiring." The
  planner has discretion over where in the demo-first README those
  links land — likely a small "License" line at the end (before or
  after Upgrading) and a CONTRIBUTING pointer inside the Install or
  Upgrading section. Wherever they go, all three must be linked from
  the README by the end of Phase 05.
- **Intra-phase plan ordering.** REQUIREMENTS.md's intra-phase note
  says "DOCS-05 ships first within this phase so DOCS-03 README
  snippets can point to the canonical examples." The planner enforces
  this — `docs/examples/*` lands before the README rewrite step that
  links to it. Anything else (file-level commit boundaries, plan
  splits) is planner discretion.
- **Exact wording of every prose paragraph** in README and
  `docs/examples/` is planner / executor discretion. The decisions
  above lock structure, ordering, length, and visual conventions —
  not the specific sentences.
- **Fictional engineer's voice in the self-review draft.** First-
  person, present-perfect, paste-ready for a Liferay HR form. No
  marketing-speak, no buzzwords. Match the tone the real
  `self-review` prompt produces (see `src/templates/prompts/
  self-review.md`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition + requirements

- `.planning/ROADMAP.md` §"Phase 05: Public-Grade Documentation" —
  phase goal, dependencies (Phase 04 ships first), success criteria
  (5 items). Note the intra-phase dependency: DOCS-05 before DOCS-03.
- `.planning/REQUIREMENTS.md` §DOCS — DOCS-01 through DOCS-05 verbatim
  text, plus the cross-phase dependency notes (Phase 06's
  Troubleshooting keys off Phase 05's README shape; Phase 07's launch
  post links to Phase 05's README).
- `.planning/PROJECT.md` — distribution model (clone + `npm install
  -g .`, no npm publish, no public github), Liferay-specific
  defaults rationale (LPD- regex, [5,9,12] cycle, 5 Liferay values
  are the value prop), and v1.1 milestone goal.

### Carried-forward decisions from Phase 04

- `.planning/phases/04-legal-contributor-onboarding/04-CONTEXT.md` —
  Phase 04 explicitly handed two items to Phase 05:
  (a) **CLAUDE.md staleness fix** (see `<deferred>` "CLAUDE.md
  staleness cleanup. ... Belongs in Phase 05 ... Phase 05 fixes it.");
  (b) **README → LICENSE / NOTICE / CONTRIBUTING.md link wiring**
  (see `<code_context>` "Phase 05 (README rewrite) will later link
  to LICENSE and CONTRIBUTING.md — Phase 05 owns that link wiring").
  Also defines the no-`Liferay, Inc.`-anywhere rule (D-LEG-01-OVERRIDE)
  which the README's copyright / about lines must also respect.

### Architectural rules + tool surface

- `CLAUDE.md` — the four architectural rules (autonomy-at-the-hook,
  daily-logs-as-source-of-truth, deterministic-vs-model,
  soft-deps-degrade-silently); also the project layout convention
  (single-file root artifacts). Phase 05 does not duplicate these in
  README — it points at `CONTRIBUTING.md` which points at `CLAUDE.md`.
  **Has a known stale line in "Testing locally" — see Claude's
  Discretion above.**
- `README.md` (current) — the file being rewritten. The hook (lines
  1-5) stays; everything else gets re-ordered per D-README-ORDER. The
  existing dense sections (Configuration, Parallel sessions,
  Upgrading) keep their depth.

### Prompt templates that shape the example artifacts

- `src/templates/prompts/weekly-report.md` — the real weekly synthesis
  prompt. The fictional `docs/examples/weekly-report.md` must look
  like real output from this prompt: deterministic metrics block,
  themes, decisions, risks, carry-over.
- `src/templates/prompts/monthly-report.md` — the real monthly prompt.
  Fictional `docs/examples/monthly-report.md` must match its shape:
  themes / threads / recurring tickets, not session-by-session detail.
- `src/templates/prompts/self-review.md` — the real self-review prompt.
  Fictional `docs/examples/self-review.md` must produce the three
  Liferay-form-shaped sections with accomplishments tagged by Liferay
  values (Produce Excellence, Lead by Serving, Value People, Grow &
  Get Better, Stay Nerdy) and a `## Sources` provenance footer.

### Files being created or modified

- `README.md` (replace in place — keep hook lines 1-5, rewrite the
  rest per D-README-ORDER).
- `docs/examples/daily-log.md` (new).
- `docs/examples/weekly-report.md` (new).
- `docs/examples/monthly-report.md` (new).
- `docs/examples/self-review.md` (new).
- `CLAUDE.md` (minor edit — fix the "no test suite yet (v0.1)" line
  in §"Testing locally"; see Claude's Discretion).

### Existing-codebase context

- `.planning/codebase/STRUCTURE.md` — repo layout convention (single-
  file root artifacts; flat `src/`/`test/` mirror). Phase 05 adds the
  first `docs/` subtree at the repo root.
- `.planning/codebase/CONVENTIONS.md` — already followed by the
  README's existing sections; the rewrite continues these
  conventions (fenced code blocks for shell snippets, tables for
  reference, no emojis).
- `src/core/logger.js` — what actually gets written into the daily
  log; the source of truth for D-PRIVACY-LISTS accuracy.
- `src/core/topics.js`, `src/core/detect.js` — same accuracy concern
  for the "Captured" list's PR-title / JIRA-title bullets.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Existing README hook + structure of dense reference sections.**
  Lines 1-5 (title + 2-paragraph hook), plus Configuration, Parallel
  Claude Code sessions, Upgrading — these stay as-is. Phase 05
  reorders rather than rewrites.
- **The three prompt templates** at `src/templates/prompts/{weekly,
  monthly,self-review}.md` define the *shape* the example artifacts
  must mirror. The planner should read each prompt to understand
  what its output looks like before synthesizing the fictional
  example.
- **The existing "How sessions get framed" table** in README. The
  table is dense but accurate; Phase 05 keeps it intact, just moves
  it after Install per D-README-ORDER.

### Established Patterns

- **Single-file root artifacts.** README, CLAUDE.md, LICENSE, NOTICE,
  CONTRIBUTING.md — all live at repo root. Phase 05 introduces the
  first sub-directory tree (`docs/examples/`) at the repo root. This
  is a one-off — no convention shift toward sub-directories.
- **No emojis in any markdown.** None of the existing root artifacts
  use emojis. Phase 05 sticks to this — no decorative icons in the
  README rewrite, no emoji headers in `docs/examples/`. (The model
  outputs that `claude -p` produces are also emoji-free per the
  weekly / monthly / self-review prompts.)
- **HTML-comment headers in docs.** `src/templates/prompts/*.md`
  files open with HTML comments. Phase 05's `docs/examples/*.md`
  files use the same convention for the "fictional example"
  disclaimer.

### Integration Points

- **None new.** Phase 05 is markdown only. No code paths, no commands,
  no hooks, no permissions. The intra-phase coupling is structural:
  `docs/examples/` lands first, then the README rewrite references
  those files.

### Stale-state notes (relevant to planning)

- **CLAUDE.md says "There is no test suite yet (v0.1)" in §"Testing
  locally".** Wrong as of v1.0 close (15 test files, 240 tests per
  PROJECT.md). Phase 04's CONTEXT.md explicitly handed the fix to
  Phase 05. The planner should add a small step to fix this line in
  CLAUDE.md as part of Phase 05.
- **No `docs/` directory exists yet.** This is the first time the
  repo gets a `docs/` subtree. The planner's first step under DOCS-05
  is `mkdir -p docs/examples/`; commit hygiene is "create the
  directory and the four files together, not as separate commits".

</code_context>

<specifics>
## Specific Ideas

- **Synthesized-from-scratch wins by safety, not authenticity.** The
  user picked option A (synthesized) over option C (hybrid real-shape)
  even though hybrid is more authentic. The driver was leakage-risk
  elimination: zero chance of a real LPD ticket title or PR title
  slipping into the public artifact. The planner should not "improve"
  the authenticity by reaching back into the author's vault for shape
  cues — the EXAMPLE-NNN storyline is the contract.
- **EXAMPLE-NNN is the literal token to use.** Not `EXAMPLE-1`, not
  `EX-001`, not `LPD-99001`. The format is `EXAMPLE-<3-digit-number>`,
  starting at `EXAMPLE-001`. Use at least three distinct tickets across
  the four artifacts (EXAMPLE-001, EXAMPLE-002, EXAMPLE-003); more is
  fine if the storyline benefits, but three is the minimum to make the
  monthly's "recurring tickets" section non-trivial.
- **Placeholder dates are literal `YYYY-MM-DD`-style strings in
  filenames.** The daily log inside `docs/examples/` is titled
  `# Daily/YYYY-MM-DD.md` at the top of the file, not `# Daily/2026-
  04-21.md` or similar. The weekly is `Reports/YYYY-Www.md`. The
  monthly is `Reports/YYYY-MM.md`. The self-review is
  `Reviews/YYYY-cycle1.md`. Inside the content, specific times
  (`09:00`, `12:08`) and weekday names (Mon, Tue, ...) are fine and
  expected — the *date anchor* is the placeholder; the *internal
  rhythm* is concrete.
- **"Example output:" is the literal label.** Not "Sample:" or
  "Output:" or "Excerpt:". The phrase satisfies DOCS-03 success
  criterion 3 verbatim, which is testable by a future audit.
- **The `Nothing leaves your machine automatically.` paragraph is
  the bottom of the Privacy section.** Below the two lists and the
  scrub pointer. Bolding goes on the heading sentence, not the
  whole paragraph.

</specifics>

<deferred>
## Deferred Ideas

- **`docs/examples/README.md` index file.** Considered and dropped in
  D-EXAMPLES-SELF-DESCRIBE. Per-file HTML-comment headers carry the
  disclaimer; the index would duplicate.
- **Full "how to scrub" subsection with copy-paste commands.** Considered
  and dropped in D-PRIVACY-DEPTH. If a privacy-skeptical reader wants a
  scrub workflow, they can ask — adding the workflow now would push
  Privacy past the 5-minute scan budget.
- **Before/after scrub mini-example in the README.** Considered and
  dropped — meta-weird to scrub a fictional example.
- **One-sentence hook + audience tag** (the more aggressive demo-first
  hook). Considered and dropped in D-README-HOOK — the current hook's
  architectural framing is worth preserving.
- **Real-vault aggressive scrubbing** as a source for `docs/examples/`.
  Rejected in D-EXAMPLES-SOURCE — leakage risk outweighs the
  authenticity gain for a synthesis-chain demo where the gap between
  fictional and real is invisible to a reader.
- **GitHub callout blocks (`> [!NOTE]`) for snippet styling.** Rejected
  in D-SNIPPET-STYLE — nested-fence-in-callout is a known cross-
  renderer sharp edge.
- **DOCS-06 (Video / GIF demo).** Already deferred in REQUIREMENTS.md
  Future Requirements. Phase 05 sticks to text only.
- **INST-04 (Fresh-user dry-run on clean machine).** Already deferred
  in REQUIREMENTS.md. Phase 05's docs-driven verification is enough;
  fresh-user dry-run waits for `doctor` (Phase 06) before it has
  diagnostic teeth.
- **`docs/launch-post.md` (LAUNCH-01) and Support / Feedback section
  (LAUNCH-02).** Phase 07 territory. Phase 05's README explicitly stops
  at Upgrading; Phase 07 appends.

</deferred>

---

*Phase: 05-public-grade-documentation*
*Context gathered: 2026-05-11*
