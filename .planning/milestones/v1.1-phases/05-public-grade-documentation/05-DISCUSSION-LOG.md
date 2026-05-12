# Phase 05: Public-Grade Documentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 05-public-grade-documentation
**Areas discussed:** Example artifact provenance, README section order, README snippet depth, Privacy posture depth

---

## Example artifact provenance

### Q1 — Source of the four artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Real-vault, aggressively scrubbed | Start from real artifacts in the author's Obsidian vault, then scrub ticket IDs / PR titles / names. Most authentic shape; high scrub-review risk. | |
| Synthesized from scratch | Build the four artifacts as plausible fiction. Zero leakage risk by construction; risks feeling artificial. | ✓ |
| Hybrid — real shape, fictional content | Take structural shape from a real artifact and rewrite all content as fiction. Real rhythm + zero leakage; highest invention cost. | |

**User's choice:** Synthesized from scratch
**Notes:** Driver is leakage-risk elimination — zero chance of a real LPD ticket title slipping in. Authenticity loss is acceptable because the synthesis chain is what's being demoed; readers don't need real ticket bodies to evaluate the tool.

### Q2 — Continuity across the four artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| One coherent fictional storyline | Same engineer; tickets thread across files (daily ⊂ weekly ⊂ monthly ⊂ cycle). Most realistic synthesis-chain demo. | ✓ |
| Four independent artifacts | No cross-references. Each file stands alone; cheapest. | |
| Light continuity — shared persona only | Same persona + repo/component palette, but no ticket-level threading. Cheaper than full storyline. | |

**User's choice:** One coherent fictional storyline
**Notes:** Reader walks daily → self-review and sees the same tickets surface at each layer — proves the synthesis chain actually works.

### Q3 — Ticket-prefix convention

| Option | Description | Selected |
|--------|-------------|----------|
| LPD-99xxx (real prefix, fictional range) | Native-looking; matches default ticketRegex. Slight risk of brief confusion with real LPD tickets. | |
| EXAMPLE-001-style (clearly fictional) | Unambiguously a demo. Default `LPD-` regex won't match — needs config callout in the example. | ✓ |
| LPD- with a leading 0 (LPD-099001) | Even less collision risk than 99xxx. Reads slightly off (real LPD is 5-digit). | |

**User's choice:** EXAMPLE-001-style
**Notes:** Demo unambiguity beats native look. The regex mismatch is addressed in Q5.

### Q4 — Date/cycle window for the artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| 2026-cycle1 (Jan–May 2026) | Feels current today; ages slowly. | |
| Generic dates (YYYY-XX placeholders) | Never goes stale; harder to demonstrate ordered chain. | ✓ |
| Frozen recent date (2026-04) | Maximally concrete; ages fastest. | |

**User's choice:** Generic dates (YYYY-MM-DD-style placeholders)
**Notes:** Continuity comes from ticket-ID threading (EXAMPLE-001 etc.), not from chronology. Internal content can still use HH:MM and weekday names for realism.

### Q5 — Handling the EXAMPLE-NNN ↔ default `LPD-` ticketRegex mismatch

| Option | Description | Selected |
|--------|-------------|----------|
| Show daily log AS IF user customized regex | Daily log shows ticket detection working; small header comment notes the `ticketRegex: 'EXAMPLE-\d+'` config. | ✓ |
| Show fallback path — "no ticket detected, used repo name" | Faithful to default regex; less compelling demo. | |
| Claude's discretion — pick what reads best | Defer to planner/executor. | |

**User's choice:** Show daily log AS IF user customized regex
**Notes:** Readers want to see the happy path. The HTML-comment header acknowledges the non-default regex without polluting the demo.

---

## README section order

### Q1 — Top-level section order

| Option | Description | Selected |
|--------|-------------|----------|
| Demo-first, install-mid, depth-end | Hook → What you get → What gets logged → Install → How it works → ... → Upgrading → (Phase 07 stub). | ✓ |
| Demo-first, privacy-after-install | Hook → What you get → Install → What gets logged → ... | |
| Transparency-first (privacy before demo) | Hook → What gets logged → What you get → Install → ... | |

**User's choice:** Demo-first, install-mid, depth-end
**Notes:** Reader sees value + privacy posture before commitment. Privacy lands at position 3 (after the demo) because the demo establishes context for "what gets logged" to be meaningful.

### Q2 — Hook (between `# self-wiki` and first section)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current 2-paragraph hook | Value-prop sentence + architecture summary, verbatim. | ✓ |
| One-sentence hook + audience tag | "For Liferay engineers using Claude Code" + value prop. Ruthlessly demo-first. | |
| Hook + audience + outcome line | Three lines: value, fit, week-1 outcome. | |

**User's choice:** Keep current 2-paragraph hook nearly verbatim
**Notes:** The architecture framing helps readers decide if the model fits their workflow; losing it would be net negative even in a demo-first README.

### Q3 — Directory tree + example snippets coexistence in "What you get"

| Option | Description | Selected |
|--------|-------------|----------|
| Tree first, then example snippets | Directory tree at top, per-artifact subsections below. Structure-first orientation. | ✓ |
| Snippets first, tree at the bottom | Maximally demo-first; tree as the wrap-up. | |
| Split: separate "What you get" (snippets) + "In your vault" (tree) | Clean separation; more sections. | |

**User's choice:** Tree first, then per-artifact subsections
**Notes:** Tree gives orientation in one glance; per-artifact subsections (with inline excerpts + links) follow.

### Q4 — Phase 07 Support / Feedback stub

| Option | Description | Selected |
|--------|-------------|----------|
| No stub — Phase 07 adds the section | Clean phase ownership. Until Phase 07 ships, CONTRIBUTING.md is the canonical issue-intake surface. | ✓ |
| Empty stub with explicit TODO | Phase 07's edit is a pure content fill; TODO marker is ugly in public README. | |
| Minimal stub pointing at CONTRIBUTING.md | Section is "correct" on Phase 05 ship; redundant with CONTRIBUTING.md until Phase 07. | |

**User's choice:** No stub — Phase 07 adds the section
**Notes:** Phase 05's README ends at Upgrading. Phase 07 appends cleanly.

---

## README snippet depth

### Q1 — Inline excerpt length

| Option | Description | Selected |
|--------|-------------|----------|
| Short (~10-15 lines), with `...` truncation | Keeps README scannable; link does the heavy lifting. | ✓ |
| Medium (~25-40 lines), one full section per artifact | Each snippet stands alone. README grows to 7-8-minute read. | |
| Very short (3-5 lines) + link | Tiny inline weight; reader effectively must click 4 links. | |
| Collapsible `<details>` with full file inline | Compact when scanned, expandable. Sync risk between README and docs/examples. | |

**User's choice:** Short (~10-15 lines) with `...` truncation
**Notes:** Full file lives in `docs/examples/`; README snippet is a teaser that conveys shape.

### Q2 — How to reference the monthly report

| Option | Description | Selected |
|--------|-------------|----------|
| Mention with link, no inline snippet | 1-paragraph subsection under "What you get" + link to docs/examples/. Completes the symmetry. | ✓ |
| Mention only as "consumed by self-review" | No subsection; mentioned in passing inside the self-review subsection. | |
| Drop the monthly mention from README entirely | Monthly is an internal intermediate; user doesn't directly consume it. | |

**User's choice:** Mention with link, no inline snippet
**Notes:** Completes the four-artifact symmetry in "What you get" without bloating the README.

### Q3 — Visual convention for snippets

| Option | Description | Selected |
|--------|-------------|----------|
| `**Example output:**` label + ```markdown ``` fence | Literal phrase matches DOCS-03 sc-3 verbatim. | ✓ |
| GitHub callout block (`> [!NOTE]` style) | Strongly visually distinct. Nested fences in callouts are a known cross-renderer sharp edge. | |
| Plain ```markdown ``` fence (no label) | Cleanest visual. Doesn't literally contain "Example output:" the spec cites. | |

**User's choice:** `**Example output:**` label + fence
**Notes:** Literal-phrase compliance with DOCS-03 success criterion 3 makes future audits trivial.

### Q4 — `docs/examples/` self-description for direct-folder visitors

| Option | Description | Selected |
|--------|-------------|----------|
| `docs/examples/README.md` index file | One canonical place for the disclaimer; GitHub auto-renders on directory view. | |
| Per-file HTML-comment header | Disclaimer travels with every file; invisible in GitHub's rendered view. | ✓ |
| Both — index + per-file visible blockquote | Belt-and-suspenders; blockquote pollutes the artifact's appearance. | |

**User's choice:** Per-file HTML-comment header
**Notes:** A reader who clicks straight into `daily-log.md` sees the disclaimer in raw view. Tradeoff: rendered-view directory visitors get no disclaimer (acceptable — the artifact is clearly an example by content).

---

## Privacy posture depth

### Q1 — Depth of the "What gets logged" section

| Option | Description | Selected |
|--------|-------------|----------|
| Two lists + one-line scrub pointer | Minimum viable; honors DOCS-04 literally. | ✓ |
| Two lists + "how to scrub" subsection (concrete commands) | Privacy-skeptical reader can act without inventing a workflow. Technical depth. | |
| Two lists + before/after scrub mini-example | Concrete; meta-weird (scrubbing a fictional example). | |

**User's choice:** Two lists + one-line scrub pointer
**Notes:** Section stays scannable. The scrub workflow can land later if users actually need it.

### Q2 — Address external-call surface ("is this telemetry?")

| Option | Description | Selected |
|--------|-------------|----------|
| Add a "Nothing leaves your machine automatically" paragraph | Directly answers the telemetry question; cheap. | ✓ |
| Add the note + explicit "what `claude -p` sees" line | Maximally transparent; starts to look like a security audit. | |
| Skip the external-call note | Optional Integrations section already covers gh/JIRA opt-in. | |

**User's choice:** Add a "Nothing leaves your machine automatically" paragraph
**Notes:** Bolded heading sentence + 3-4 explanatory sentences. No deep dive into prompt content.

### Q3 — Surface the "Claude writes most notes" subtlety in Privacy

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — one-sentence annotation in the Captured list | Sets accurate expectations inline. Invites follow-up about skill primer. | |
| Yes — small note below the lists | More explanatory; points at the skill file. | |
| Skip — already in "How sessions get framed" | Trust the existing table; keep Privacy laser-focused. | ✓ |

**User's choice:** Skip — already conveyed elsewhere
**Notes:** Privacy stays focused on the actual privacy answer.

---

## Claude's Discretion

- **CLAUDE.md staleness cleanup.** Phase 04 handed the "no test suite yet (v0.1)" line fix to Phase 05. Phase 05 has discretion to fold this into the README rewrite plan or split into its own small plan.
- **README → LICENSE / NOTICE / CONTRIBUTING.md link wiring.** Phase 04 handed this to Phase 05 explicitly. Planner picks where the links land in the demo-first README (likely a small "License" line at the end + a CONTRIBUTING pointer in Install or Upgrading).
- **Intra-phase plan ordering** is locked at one constraint: `docs/examples/*` ships before the README rewrite that links to them. Everything else (commit boundaries, plan splits) is planner discretion.
- **Exact prose wording** of every paragraph in README and `docs/examples/`.
- **Fictional engineer's voice in the self-review draft** — first-person, paste-ready for the Liferay HR form. Match the tone the real prompt produces.

## Deferred Ideas

- `docs/examples/README.md` index (HTML-comment headers carry the disclaimer instead).
- Full "how to scrub" subsection with copy-paste commands.
- Before/after scrub mini-example in the README.
- One-sentence hook + audience tag (the more aggressive demo-first hook).
- Real-vault aggressive scrubbing as the source for examples.
- GitHub callout blocks (`> [!NOTE]`) for snippet styling.
- Video / GIF demo (DOCS-06 — deferred to v1.2+).
- Fresh-user dry-run on a clean machine (INST-04 — waits for `doctor`).
- `docs/launch-post.md` and Support / Feedback section (LAUNCH-01, LAUNCH-02 — Phase 07).
