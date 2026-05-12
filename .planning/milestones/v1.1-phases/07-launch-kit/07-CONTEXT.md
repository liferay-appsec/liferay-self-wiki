# Phase 07: Launch Kit - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Land the launch kit so a Liferay engineer can paste-edit a single Slack post
to announce self-wiki, and any engineer who arrives via that post knows
where to send feedback. Two requirements (LAUNCH-01, LAUNCH-02) and two
deliverables — both documentation, no `src/` changes:

1. **`docs/launch-post.md`** (new file, LAUNCH-01) — Slack announcement
   draft, markdown-formatted. Contains, in this fixed order:
   1. Title + an optional personal-sentence placeholder (block-quoted so
      it's obvious to delete or fill in before sending).
   2. **Value prop** — one sentence.
   3. **30-second pitch** — 3–4 bullets, outcome-led (what the engineer
      ends up with at cycle close, not a feature catalogue).
   4. **60-second install** — a fenced shell block matching the README's
      `git clone … && npm install -g .` shape, then a link to the README
      for the full flow. Explicitly references `self-wiki doctor` (Phase
      06) as the post-install verification step.
   5. **Expected first-week outcome** — concrete-artifact list (5 daily
      logs, 1 weekly report, populated `Tickets/<id>.md` pages, runnable
      `self-wiki report --week`) so the reader knows what their vault
      looks like after a normal Mon–Fri.
   6. **Feedback line** — names both surfaces with intent: Slack channel
      (placeholder `#self-wiki-feedback (TODO: confirm channel name)`)
      for quick chatter / questions; GitHub Issues
      (`https://github.com/liferay-appsec/liferay-self-wiki/issues`) for
      bugs and feature requests.
   Target length: one readable Slack message that fits the "Show more"
   threshold (~1000–1500 chars / 20–30 lines including bullets). Long
   enough to sell the tool; short enough to scan before the reader's
   first interruption.

2. **README `## Support / Feedback` section** (LAUNCH-02) — appended at
   the very end of `README.md`, after `## License`. Final README section
   order (carried from Phase 05's D-README-ORDER through Phase 06's
   D-PLACEMENT): `… → Upgrading → Troubleshooting → License → Support /
   Feedback`. Content is a minimal two-line section: one line for the
   Slack channel placeholder, one line for the GitHub Issues URL. Same
   surfaces as the launch post's feedback line, same intent split.

Out of scope for Phase 07 (already deferred or owned elsewhere):

- **FAQ.md / FAQ section in launch post** — REQUIREMENTS.md
  LAUNCH-03 is deferred until users actually ask things.
- **Issue templates (`.github/ISSUE_TEMPLATE/`)** — FEEDBACK-01,
  deferred. Phase 04 D-ISSUE-GUIDANCE intentionally kept the issue
  surface unstructured until failure modes are known.
- **Real Slack channel creation** — Out of repo scope. The placeholder
  is unambiguous and the launch post's "edit 2-3 placeholders" step
  is where the user fills it in.
- **CONTRIBUTING.md edits** — Phase 04 locked CONTRIBUTING.md's
  "Where to file issues" section to GitHub Issues only
  (D-ISSUE-NOT-SLACK). Phase 07 does NOT add Slack to CONTRIBUTING.md.
  Slack lives on the README Support / Feedback section + the launch
  post — not on the contributor-facing surface.
- **Video / GIF demo, CI badges, npm registry publish** — DOCS-06,
  CI-01, npm-publish all out of scope per REQUIREMENTS.md.
- **Trend analysis (TREND-01..03), Liferay-form export (TOOL-01..02)**
  — v2.0 backlog. The launch post does NOT mention them.

</domain>

<decisions>
## Implementation Decisions

### Launch post structure & ordering (LAUNCH-01)

- **D-POST-ORDER:** Sections appear in this exact order, matching the
  REQUIREMENTS.md LAUNCH-01 listing: optional personal sentence (block-
  quoted placeholder above the value prop) → **Value prop** (one
  sentence) → **30-second pitch** (3–4 bullets) → **60-second install**
  (fenced block + README link) → **Expected first-week outcome**
  (concrete artifact list) → **Feedback** (Slack + GitHub Issues).
  Rationale: matches the success-criterion listing; mirrors the
  demo-first ordering Phase 05 chose for the README (value before
  install before mechanics). Rejected: install-first (repeats the
  README's pre-Phase-05 ordering that was explicitly inverted);
  FAQ-style (adds structure no success criterion asks for).

- **D-POST-FORMAT-GFM:** Source file is **GitHub-flavored markdown**:
  `## Section` headers, `**bold**`, `-` bullets, fenced code blocks
  with `sh` language tag for install commands. Rationale: the file
  lives in the repo as `.md` and needs to render correctly on GitHub
  for would-be contributors browsing the repo; Slack's "Format pasted
  text" handles standard markdown on paste; the user is editing 2–3
  placeholders then sending — they can adjust last-mile formatting if
  Slack's preview surprises them. Rejected: Slack mrkdwn (`*bold*`,
  no headers) — renders cleanly in Slack but the `.md` source looks
  broken in GitHub's renderer; plain text (loses scannable structure
  the 4-section post needs).

- **D-POST-LENGTH:** Target ~1000–1500 chars / ~20–30 lines including
  bullets. Long enough to deliver value-prop + pitch + install +
  first-week + feedback; short enough to scan before the reader's
  first interruption. Slack will collapse it under "Show more" at
  ~700 chars; that's acceptable because the value prop + first bullet
  appear above the fold. Rejected: under-700-chars (would gut either
  the first-week outcome or the install ref); 2000+ chars (Slack
  readers won't tap "Show more" for an unannounced tool).

- **D-POST-PERSONAL-SENTENCE:** The optional personal sentence lives
  as a **block-quoted placeholder** at the very top of the file,
  between the title and the value prop:
  ```markdown
  > _Optional: replace this line with one sentence on why you tried
  > self-wiki and what stuck — or delete the whole quote before
  > sending._
  ```
  Rationale: block-quote is visually distinct so the user can't miss
  it; the italic emphasis + explicit "or delete the whole quote"
  makes the placeholder unambiguous; if deleted, the post still
  flows directly from title → value prop. Rejected: an HTML comment
  (`<!-- placeholder -->`) — invisible in Slack preview so the user
  forgets it's there; an inline TODO line (`TODO: add personal
  sentence`) — same shape as the Slack channel placeholder, hurts
  scanability.

### 30-second pitch framing (LAUNCH-01)

- **D-PITCH-OUTCOME-LED:** The 3–4 bullets are **outcome-led** — they
  describe what the engineer ends up with, not what the tool does.
  Anchor bullet leads with the Liferay-review-cycle deliverable
  because that's the deepest pain point and the strongest hook for
  this audience. Indicative bullet set (planner's discretion to
  refine wording; structure and emphasis locked here):
  1. _Cycle close: a paste-ready Liferay-form self-review draft,
     tagged by the five values, with monthly + weekly sources cited._
  2. _Every week: a themed weekly report (decisions, lessons,
     carry-over), built from your daily logs._
  3. _Every day: terse decision/outcome notes from Claude land in
     `Daily/<date>.md` — no per-session command from you._
  4. _Per-ticket history that grows across sessions in
     `Tickets/LPD-xxxxx.md`._
  Rejected: feature-led ("daily logs, weekly reports, topic pages,
  self-review") — that's already the README's "What you get"
  section and reads as a TL;DR rather than a separate angle;
  workflow-led ("hook-framed, branch-aware, zero per-session
  commands") — speaks to mechanism, too abstract for a 30-second
  pitch; problem-led ("performance reviews suck") — over-cynical
  for a peer-to-peer announcement.

- **D-PITCH-LEAD-WITH-SELF-REVIEW:** Bullet 1 leads with the
  self-review outcome (cycle close, Liferay-form paste-ready). This
  is v1.0's headline command (`self-wiki self-review`) and the
  thing that justifies the daily-log effort. Rejected: leading with
  the daily log (no payoff yet — the reader has to read three more
  bullets to see what the daily log becomes); leading with weekly
  reports (less differentiated — every standup-prep tool has one).

### 60-second install reference (LAUNCH-01)

- **D-INSTALL-FENCED-BLOCK:** The install section is a **fenced `sh`
  block matching the README's verbatim install shape**, followed by
  a one-line README link and an explicit `self-wiki doctor`
  verification step. Shape:
  ```sh
  git clone https://github.com/liferay-appsec/liferay-self-wiki.git self-wiki
  cd self-wiki
  npm install
  npm install -g .
  self-wiki init /path/to/your/vault
  self-wiki doctor
  ```
  Then a single sentence linking to the README's full Install
  section for the explanation. Rationale: a paste-ready block is
  the highest-value install reference; matching the README exactly
  means there's one source of truth for the install flow;
  `doctor` (Phase 06) is the post-install trust step the milestone
  promised. Rejected: link-only ("see README → Install") —
  hostile to readers who'd install in the next 60 seconds; long
  prose ("first you'll need Node 20, then...") — duplicates the
  README's depth.

- **D-INSTALL-DISTRIBUTION-HONEST:** A short prose line below the
  fenced block makes the distribution model explicit: _"Internal
  Liferay tool. Distribution stays clone + `npm install -g .` from
  the `liferay-appsec/` GitHub org — no npm registry publish, no
  public github.com."_ Locked by success criterion 4. Rejected:
  not stating it (readers assume `npm install self-wiki` works —
  inevitable Slack thread about that); long disclaimer paragraph
  (over-engineered for a launch post; the README's existing
  "Self-wiki is distributed as a clone-and-link Node CLI (no npm
  registry publish)" already carries the longer form).

### Expected first-week outcome shape (LAUNCH-01)

- **D-FIRSTWEEK-CONCRETE-ARTIFACTS:** The "after 5 working days"
  section is a **concrete-artifact list**, not a qualitative
  framing. Five small bullets / one short paragraph naming the
  files that will exist in the vault and the commands that will
  produce a synthesis:
  - ~5 files in `Daily/` — one per working day, with whatever
    `self-wiki note` lines Claude dropped while you worked.
  - A handful of `Tickets/<id>.md` files growing across the week
    for the LPD tickets you touched.
  - A `Components/<slug>.md` page or two if you crossed the same
    code surface in multiple sessions.
  - One weekly report at `Reports/YYYY-Www.md` produced by
    `self-wiki report --week` (one command, ~30 seconds).
  - Optional: link the four scrubbed examples in `docs/examples/`
    so the reader sees the shape before they install.
  Rationale: a Liferay engineer's first decision is "is this worth
  five working days of trust" — concrete artifacts answer that
  better than adjectives. Rejected: qualitative framing ("a week
  of context you can actually search") — pretty but doesn't tell
  the reader what landed; pure example-driven ("one command:
  `self-wiki report --week` gives you this:") — too narrow a
  slice of the weekly outcome.

- **D-FIRSTWEEK-LINK-EXAMPLES:** The first-week section ends with
  a one-line pointer to `docs/examples/` so a reader who wants to
  preview the shape can click through without installing. Same
  links Phase 05's README already provides. Rejected: inlining a
  snippet (redundant with README); not linking (extra round-trip
  for a reader who's actually considering installing).

### Feedback surfaces — launch post + README (LAUNCH-01, LAUNCH-02)

- **D-FEEDBACK-BOTH-SURFACES:** Both the launch post's feedback line
  and the README `## Support / Feedback` section name **both
  surfaces with intent**:
  - **Slack channel** `#self-wiki-feedback (TODO: confirm channel
    name)` — quick chatter, questions, "is this the right tool for
    X?", or "anyone else seeing Y?".
  - **GitHub Issues**
    `https://github.com/liferay-appsec/liferay-self-wiki/issues` —
    bugs, feature requests, anything actionable.
  Rationale: the launch is a Slack post, so the Slack thread is
  the natural reply surface for first questions; Phase 04
  D-ISSUE-DEST locked GitHub Issues as the actionable surface for
  CONTRIBUTING.md, and the README has to be consistent with that;
  D-ISSUE-NOT-SLACK explicitly preserved the Slack mention for
  Phase 07's call — this is the call. Rejected: Slack-only
  everywhere (orphans GitHub Issues, contradicts Phase 04); strict
  separation (Slack only in launch, GitHub only in README) —
  hostile to readers crossing between the two surfaces; one merged
  "support" surface — Slack and GitHub serve different latencies.

- **D-FEEDBACK-PLACEHOLDER-VERBATIM:** The Slack channel placeholder
  is the literal string `#self-wiki-feedback (TODO: confirm channel
  name)` — exactly the form REQUIREMENTS.md success criterion 3
  shows. It appears verbatim in both the launch post and the
  README section. The `(TODO: confirm channel name)` parenthetical
  is the unambiguous marker; the user replaces the whole
  parenthetical when the real channel exists. Rejected: Slack
  channel-ID syntax (`<#CXXXXX>`) — Slack-only rendering; broken
  in the `.md` source; bare `#self-wiki-feedback` with no marker —
  the success criterion explicitly forbids a placeholder that can
  be mistaken for live content.

- **D-README-SECTION-MINIMAL:** README `## Support / Feedback` is a
  **two-line section** below `## License`. One line names Slack
  with the placeholder; one line names GitHub Issues with the URL.
  Each line carries one intent annotation in parentheses (questions
  / bugs). Mirrors CONTRIBUTING.md's "minimal pointer page" shape
  (Phase 04 D-DOC-SHAPE), keeps the README tail uncluttered.
  Rejected: prose paragraph + bullets (overengineered for two
  pointers); one-liner that omits the URL ("questions to Slack,
  bugs to GitHub Issues") — drops the actionable link, which is
  the whole point of the section.

- **D-README-PLACEMENT:** New section appends **after `## License`
  as the final section** in `README.md`. Locked by Phase 05
  D-NO-P07-STUB ("Phase 05's README does not pre-create a Support /
  Feedback section. Phase 07 (LAUNCH-02) appends it cleanly. No
  TODO marker, no placeholder.") and Phase 06 D-PLACEMENT
  ("Phase 07 (LAUNCH-02) appends Support / Feedback after
  License."). Final README section order:
  `… → Upgrading → Troubleshooting → License → Support / Feedback`.

### Honest distribution language (success criterion 4)

- **D-NO-V2-MENTIONS:** Nothing in `docs/launch-post.md` references
  npm registry publish, public github.com, future v2.0 features
  (TREND-01..03, TOOL-01..02), or "open source release". Distribution
  reality is the only language used: `liferay-appsec/liferay-self-wiki`
  on internal GitHub, clone + `npm install -g .`. Locked by success
  criterion 4 and reinforced by PROJECT.md's Out of Scope section.
  Rejected: aspirational "we may publish to npm later" line (every
  reader will treat this as a roadmap promise — and it's not one).

- **D-NO-EMOJIS:** Carry-forward from Phase 04 / 05 / 06
  (D-TROUBLESHOOTING-NO-EMOJI, D-NO-P07-STUB et al.). The launch
  post uses plain markdown — no emojis, no shortcodes (`:rocket:`
  etc). The post is paste-edit-ready Slack content but it lives
  in the repo as `.md`; emojis would be inconsistent with every
  other Phase 04–06 documentation surface. The user can add
  emojis last-mile in Slack if they want; the source stays clean.

### Claude's Discretion

- **Exact prose wording in `docs/launch-post.md`.** D-POST-ORDER,
  D-POST-FORMAT-GFM, D-PITCH-OUTCOME-LED, D-INSTALL-FENCED-BLOCK,
  D-FIRSTWEEK-CONCRETE-ARTIFACTS lock structure, ordering, framing,
  length, and the install block's exact shape. The planner /
  executor write the actual sentences. Target tone: dry, peer-to-
  peer, Liferay-engineer-to-Liferay-engineer. No marketing-speak,
  no buzzwords, no exclamation marks (matches the README's
  established voice).

- **Exact ticket-set / artifact-count in the first-week outcome.**
  D-FIRSTWEEK-CONCRETE-ARTIFACTS specifies the shape (concrete
  artifacts, ~5 files) and the commands to mention (`self-wiki
  report --week`). The planner picks the indicative
  ticket-ID-shape (`LPD-12345` style works) and whether
  `Components/<slug>.md` gets one bullet or two. Recommend: keep
  it tight — 4 bullets total in the first-week section.

- **Whether to inline a 1-line example output in the launch post.**
  Considered: a 3-line snippet from the weekly report under the
  first-week outcome ("you'll get something like:" + 3 lines of
  themes-of-the-week prose). Discretion: include it if and only
  if the post stays under ~1500 chars total after adding it.
  Recommend: skip — the `docs/examples/` link does this job
  already, and the launch post's job is to point readers, not to
  preview content.

- **README Support / Feedback section: section heading style.**
  D-README-PLACEMENT and D-README-SECTION-MINIMAL lock placement
  and content. The exact heading text is planner discretion: the
  options are `## Support / Feedback`, `## Feedback`, or
  `## Support`. Recommend: `## Support / Feedback` because both
  surfaces serve both intents and the slash makes the dual purpose
  visible at a glance. The success-criterion text uses
  "Support / Feedback" so matching it removes ambiguity.

- **Test bar for Phase 07.** Phase 07 is doc-only — no `src/`
  changes, no new commands, no new flags. The 257/257 test count
  inherited from Phase 06 stays. Recommend: planner adds no new
  test files; non-regression is "tests stay at 257 and `self-wiki
  --help` still prints". If a future verification cycle wants a
  test that greps `docs/launch-post.md` for the forbidden tokens
  (`npm publish`, `github.com/` outside `liferay-appsec/`, the
  word "v2"), that's a Nyquist-validation-style retroactive add
  rather than a Phase-07 deliverable.

- **Plan ordering inside Phase 07.** Two deliverables, no intra-
  phase dependency (the launch post references the README's
  install section by link, but the README install section already
  exists from Phase 05 — and the README Support / Feedback
  section is a tail append). Recommend: one plan for each
  deliverable, parallel-safe (no file conflicts). If the planner
  prefers a single plan, both deliverables fit comfortably in
  one — the entire phase is ~60 lines of markdown.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition + requirements

- `.planning/ROADMAP.md` §"Phase 07: Launch Kit" — phase goal,
  dependencies (Phase 05 + Phase 06 ship first), 4 success criteria.
  Note especially success criterion 4 (no npm publish / public
  github.com / v2.0 references) and success criterion 3 (the literal
  placeholder example `#self-wiki-feedback (TODO: confirm channel
  name)`).
- `.planning/REQUIREMENTS.md` §LAUNCH — LAUNCH-01, LAUNCH-02 verbatim
  text. LAUNCH-01 lists the five launch-post sections in the
  required order (value prop / 30-second pitch / 60-second install /
  expected first-week outcome / feedback line). LAUNCH-03 (FAQ.md)
  is explicitly deferred — not in scope.
- `.planning/PROJECT.md` — distribution model (clone +
  `npm install -g .`, no npm publish, no public github.com surface);
  Liferay-specific defaults stay baked in; v1.1 milestone goal
  ("a fresh dev can clone, install, and trust it within their first
  hour" — the launch post is the trust-on-arrival surface).

### Carried-forward decisions

- `.planning/phases/06-install-ux-hardening/06-CONTEXT.md` —
  D-PLACEMENT locks `Troubleshooting → License → Support / Feedback`
  ordering. D-TROUBLESHOOTING-NO-EMOJI / no-emojis-in-markdown
  carries to the launch post. `self-wiki doctor` is the
  post-install verification step the launch post references —
  doctor's command name + shape are locked here.
- `.planning/phases/05-public-grade-documentation/05-CONTEXT.md` —
  D-README-ORDER ends Phase 05's README at Upgrading; Phase 07
  appends after License. D-NO-P07-STUB explicitly says Phase 05
  did not create a stub — Phase 07's section is appended cleanly.
  D-EXAMPLES-PREFIX (`EXAMPLE-NNN`) governs any example artifacts
  the launch post points at; the indicative ticket shape in the
  pitch bullets (`LPD-xxxxx`) is a real Liferay prefix because the
  launch post is about real Liferay work, not the demo storyline.
- `.planning/phases/04-legal-contributor-onboarding/04-CONTEXT.md` —
  D-ISSUE-DEST locks GitHub Issues URL
  (`https://github.com/liferay-appsec/liferay-self-wiki/issues`).
  D-ISSUE-NOT-SLACK explicitly preserves the Slack mention for
  Phase 07's call (this CONTEXT) — Slack lives on README §Support/
  Feedback + the launch post, not CONTRIBUTING.md.
  D-ISSUE-GUIDANCE (minimal: URL only, no templates) carries to
  the README's Support / Feedback section.

### Architectural rules

- `CLAUDE.md` — load-bearing rules for Phase 07:
  - **"No `obsidian-cli`. Direct `.md` writes only. Wikilinks
    (`[[…]]`) work in raw markdown."** — Phase 07 writes plain
    `.md` files at known paths (`docs/launch-post.md`, append
    to `README.md`). No tooling, no special render path.
  - **Soft dependencies degrade silently.** The launch post does
    not promise behavior that depends on `gh` or JIRA — those
    stay opt-in per the README's Optional integrations section.

### Code surface being created or modified

- `docs/launch-post.md` (new file) — the Slack announcement draft.
  Markdown source; Slack-paste-friendly at the GitHub-flavored-
  markdown layer (D-POST-FORMAT-GFM).
- `README.md` (modify, append-only) — add `## Support / Feedback`
  section as the new final section, after `## License`. Two lines:
  Slack placeholder + GitHub Issues URL.

### Existing surface NOT modified by Phase 07

- No `src/` changes. Phase 07 is documentation-only.
- `CONTRIBUTING.md` (Phase 04) — unchanged. Slack mention does NOT
  leak into CONTRIBUTING.md (D-ISSUE-NOT-SLACK carry-forward).
- `LICENSE`, `NOTICE` (Phase 04) — unchanged.
- `docs/examples/*` (Phase 05) — unchanged. The launch post links
  to them but does not modify them.
- `src/commands/doctor.js`, `src/commands/init.js` (Phase 06) —
  unchanged. The launch post references `self-wiki doctor` by name
  only; nothing in the doctor surface needs to move.
- `src/templates/{hooks,permissions}.json` — unchanged. Launch is
  not a new self-wiki subcommand.

### Existing-codebase context (for the planner's awareness)

- `README.md` (current, Phase-06-shaped at lines 266-274 for
  Troubleshooting + 276-278 for License) — the file being appended
  to. Last section currently ends at line 278; Phase 07 appends a
  new `## Support / Feedback` section below it.
- `docs/examples/{daily-log,weekly-report,monthly-report,
  self-review}.md` — the four scrubbed artifacts the launch post's
  first-week-outcome section optionally links to. Already shipped
  in Phase 05; no edits needed.
- `src/commands/doctor.js` — Phase 06's deliverable. The launch
  post's install block ends with `self-wiki doctor` so a reader
  can verify their install in one command. Doctor's name and
  invocation are locked by Phase 06; the launch post just
  references them.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **README.md `## Install` section (lines 117–143).** The
  launch-post's 60-second install fenced block is the exact same
  shape as the README's install block — five `sh` lines —
  optionally plus a sixth line for `self-wiki doctor`. Single
  source of truth: when the README install changes, the launch
  post's install block changes alongside it. The planner / executor
  copies the README block verbatim then adds the doctor line.
- **README.md `## What you get` section (lines 7–89).** The pitch
  bullets in the launch post describe outcomes the README already
  illustrates with snippets — the launch post does NOT inline
  snippets (the README does that). The planner can mine this
  section for the right outcome vocabulary (e.g. "themed weekly
  report (decisions, lessons, carry-over)").
- **CONTRIBUTING.md `## Where to file issues` (lines 7–16).** The
  README Support / Feedback section's GitHub Issues line mirrors
  CONTRIBUTING.md's URL. Both surfaces point at the same place
  with the same intent (bugs / feature requests).

### Established Patterns

- **No-emojis-in-markdown convention.** Carry-forward from Phase
  04 / 05 / 06. Launch post and README §Support/Feedback follow it.
- **Phase-07-is-tail-appended-to-README pattern.** Phase 05 ended
  the README at Upgrading; Phase 06 inserted Troubleshooting
  between Upgrading and License; Phase 07 appends Support / Feedback
  after License. Every phase since the demo-first rewrite has
  added at the right end of the file — no mid-document edits.
- **Minimal-pointer-section style for contributor-facing sections.**
  CONTRIBUTING.md's "Where to file issues" is one line + URL.
  README §Support/Feedback follows the same shape.
- **Liferay-real-prefix in non-demo content.** `docs/examples/` uses
  `EXAMPLE-NNN` (Phase 05 D-EXAMPLES-PREFIX) because that content
  is a fictional storyline; the launch post is about real Liferay
  work and uses real prefixes (`LPD-`) when ticket shapes appear
  in pitch bullets.

### Integration Points

- **No CLI integration.** Phase 07 is documentation-only — no
  `src/cli.js` changes, no new `commands/` files, no new flags.
- **No hooks, no permissions.** `src/templates/{hooks,
  permissions}.json` stays unchanged. The launch post mentions
  `self-wiki doctor` but doctor is user-invoked (Phase 06 already
  decided not to add doctor to permissions.allow).
- **No test integration.** No new test files. The 257-test suite
  from Phase 06 stays green; "non-regression" for Phase 07 is
  `npm test` passes and `self-wiki --help` still prints.

### Stale-state notes (relevant to planning)

- **No `docs/launch-post.md` exists yet.** Phase 06 did not create
  one. The file is born in Phase 07 and never reads from an older
  draft.
- **No README §Support / Feedback section exists yet.** Phase 05
  explicitly did not stub one (D-NO-P07-STUB). The append is
  clean; no prior content to merge with.
- **The Slack channel `#self-wiki-feedback` does not exist yet.**
  Confirmed not-an-error-state: the placeholder is the deliverable.
  The user creates the channel out-of-band; once it exists, they
  edit the README + launch post in one find-replace pass.

</code_context>

<specifics>
## Specific Ideas

- **Pitch bullet 1 leads with the self-review outcome.**
  D-PITCH-LEAD-WITH-SELF-REVIEW. The bullet's first phrase should
  name the Liferay review cycle and the paste-ready draft, then
  the value-tagging and source-citation as supporting clauses. This
  is the v1.0 headline command and the strongest hook for the
  Liferay-engineer audience.

- **The install block is six lines, not five.** D-INSTALL-FENCED-BLOCK
  adds `self-wiki doctor` as the sixth line — the post-install
  trust step Phase 06 promised. A reader who runs all six lines
  ends with a printed 7/7 passing summary; that's the launch's
  closing handshake.

- **The Slack channel placeholder is literal.** D-FEEDBACK-
  PLACEHOLDER-VERBATIM. The string `#self-wiki-feedback (TODO:
  confirm channel name)` appears verbatim in both
  `docs/launch-post.md` and `README.md`. A pre-execution sanity
  check: grep both files for the literal string — they should
  match exactly, including the parenthetical.

- **The first-week outcome links `docs/examples/`.** D-FIRSTWEEK-
  LINK-EXAMPLES. Single line at the bottom of the first-week
  section: "Preview the shapes: [Daily log](docs/examples/
  daily-log.md), [weekly report](docs/examples/weekly-report.md),
  [monthly report](docs/examples/monthly-report.md), [self-review
  draft](docs/examples/self-review.md)." Same paths the README
  already uses for the "→ Full example" links.

- **The README Support / Feedback section is two lines.**
  D-README-SECTION-MINIMAL. Indicative wording the planner can use
  verbatim:
  ```markdown
  ## Support / Feedback

  Quick chatter / questions: `#self-wiki-feedback (TODO: confirm
  channel name)` on Liferay Slack.

  Bugs / feature requests: https://github.com/liferay-appsec/
  liferay-self-wiki/issues.
  ```
  Two lines, each carrying its intent in the opening clause, each
  ending with the surface (Slack channel or GitHub Issues URL).

- **Honest distribution sits in the install section, not standalone.**
  D-INSTALL-DISTRIBUTION-HONEST. One sentence below the fenced
  block, calling out the `liferay-appsec/` org name + the no-npm-
  publish reality. Not a separate section, not a footer — embedded
  where readers are already thinking about install.

- **No exclamation marks, no marketing voice.** Carry-forward from
  Phase 05's README tone. Sentences end with periods. The post
  reads peer-to-peer: "I built this. Here's what it does. Here's
  how to try it. Here's where to talk about it."

</specifics>

<deferred>
## Deferred Ideas

- **FAQ.md** (LAUNCH-03 in REQUIREMENTS.md). Already deferred.
  Reopen if launch-time questions reveal a pattern.
- **Issue templates** (`.github/ISSUE_TEMPLATE/`, FEEDBACK-01).
  Already deferred per Phase 04. Reopen once we know the failure
  modes that actually land.
- **Video / GIF demo in the launch post** (DOCS-06). Deferred to
  v1.2+. The launch post links to `docs/examples/` instead.
- **CI green-check badge** (CI-01). Deferred. Not blocking launch
  on the badge.
- **npm registry publish.** Permanent out-of-scope per PROJECT.md
  and REQUIREMENTS.md. The launch post is honest about this
  (D-INSTALL-DISTRIBUTION-HONEST).
- **Public github.com release.** Repo stays under `liferay-appsec/`
  GitHub org. The launch post says so explicitly.
- **Slack-native announcement formatting (mrkdwn).** Rejected
  upstream (D-POST-FORMAT-GFM). Reopen only if Slack's paste-
  rendering of GitHub-flavored markdown actively breaks for the
  user during the paste-edit step.
- **A `docs/launch-post-thread.md` companion file for the reply
  thread.** Considered as a structured "first reply with details /
  links" Slack-thread convention. Rejected: out of LAUNCH-01's
  scope (the requirement is the post, not the thread); the post
  already links to the README and `docs/examples/` for depth.
- **An inline 3-line example output snippet inside the launch
  post.** Considered as a "you'll get something like:" preview.
  Rejected by D-FIRSTWEEK-CONCRETE-ARTIFACTS + Claude's Discretion
  recommend-skip: the `docs/examples/` link does this job and the
  post stays under length.
- **A test that greps `docs/launch-post.md` for forbidden tokens
  (`npm publish`, `github.com/<non-liferay-appsec>`, "v2").**
  Recommended as a Nyquist-validation-style retroactive add if
  Phase 07's verifier wants belt-and-suspenders confidence on
  success criterion 4. Not a Phase 07 deliverable.
- **Mentioning self-wiki in CONTRIBUTING.md's Slack section.**
  Out of scope by D-ISSUE-NOT-SLACK carry-forward. Slack stays on
  the README + launch post; CONTRIBUTING.md stays on GitHub
  Issues only.
- **Adding a `self-wiki launch` subcommand.** Considered (and
  rejected) as a thought experiment: a command that copies
  `docs/launch-post.md` to clipboard. Out of scope — launching
  is a once-per-version action, not a tool surface.

</deferred>

---

*Phase: 07-launch-kit*
*Context gathered: 2026-05-12*
