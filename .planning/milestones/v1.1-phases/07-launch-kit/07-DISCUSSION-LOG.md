# Phase 07: Launch Kit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 07-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 07-launch-kit
**Mode:** `--auto` (single-pass; recommended defaults selected for every area without AskUserQuestion)
**Areas discussed:** Launch post structure & ordering, Launch post markdown flavor, 30-second pitch framing, 60-second install reference, Expected first-week outcome shape, Feedback surfaces (launch + README), Honest distribution language

---

## Launch post structure & ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Success-criterion order | Title → optional personal sentence → value prop → 30s pitch → 60s install → first-week outcome → feedback. Matches REQUIREMENTS.md LAUNCH-01 listing and the demo-first ordering Phase 05 chose for the README. | ✓ |
| Install-first | Lead with `git clone …`, then pitch, then outcomes. | |
| FAQ-style | Bullets-first then a Q&A block. | |

**Selected:** Success-criterion order (recommended default).
**Notes:** Locked as D-POST-ORDER in CONTEXT.md. Personal-sentence placeholder is a block-quoted line above the value prop (D-POST-PERSONAL-SENTENCE) so it's unmistakable in Slack preview and the post still flows if deleted.

---

## Launch post markdown flavor

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub-flavored markdown | `## Section`, `**bold**`, `-` bullets, fenced `sh` blocks. Renders correctly in GitHub; Slack's "Format pasted text" handles it on paste. | ✓ |
| Slack mrkdwn | `*bold*`, no headers, Slack-native rendering. | |
| Plain text | No formatting; relies on whitespace. | |

**Selected:** GitHub-flavored markdown (recommended default).
**Notes:** Locked as D-POST-FORMAT-GFM. The `.md` source has to render correctly on GitHub for repo browsers; the user adjusts last-mile in Slack if the paste-render surprises them. Rejected Slack-mrkdwn because the GitHub view would look broken.

---

## 30-second pitch framing

| Option | Description | Selected |
|--------|-------------|----------|
| Outcome-led | 3–4 bullets describing what the engineer ends up with (cycle-close self-review draft, weekly report, daily decision notes, per-ticket history). Bullet 1 leads with the self-review outcome. | ✓ |
| Feature-led | Bullets list daily logs / weekly reports / topic pages / self-review as a feature catalogue. | |
| Workflow-led | Bullets describe the mechanism (hook-framed, branch-aware, zero per-session commands). | |
| Problem-led | Bullets lead with "performance reviews suck", then position the tool. | |

**Selected:** Outcome-led (recommended default).
**Notes:** Locked as D-PITCH-OUTCOME-LED + D-PITCH-LEAD-WITH-SELF-REVIEW. Outcome-led is a different angle from the README's `## What you get` section so the launch post is doing fresh work, not duplicating. Self-review-first because that's the strongest hook for the Liferay-engineer audience.

---

## 60-second install reference

| Option | Description | Selected |
|--------|-------------|----------|
| Fenced `sh` block, mirrors README install verbatim, + `self-wiki doctor` as the sixth line | Paste-ready six-line block; doctor closes the install handshake. | ✓ |
| Link-only ("see README → Install") | No fenced block; reader clicks through. | |
| Long prose | "First install Node 20, then npm install, then…" | |

**Selected:** Fenced block + doctor line (recommended default).
**Notes:** Locked as D-INSTALL-FENCED-BLOCK. Doctor (Phase 06) is the trust step the milestone promised; the launch post invokes it by name as the closing verification. Distribution honesty (D-INSTALL-DISTRIBUTION-HONEST) is one sentence below the block — explicit "internal Liferay tool, no npm publish".

---

## Expected first-week outcome shape

| Option | Description | Selected |
|--------|-------------|----------|
| Concrete-artifact list | 4 bullets naming files (`Daily/`, `Tickets/`, `Components/`, `Reports/`) and the one command (`self-wiki report --week`) that produces synthesis. Optional `docs/examples/` preview link at the bottom. | ✓ |
| Qualitative framing | "A week of context you can actually search." | |
| Pure example-driven | Inline a 3-line weekly-report snippet. | |

**Selected:** Concrete-artifact list (recommended default).
**Notes:** Locked as D-FIRSTWEEK-CONCRETE-ARTIFACTS + D-FIRSTWEEK-LINK-EXAMPLES. Concrete artifacts answer the "is this worth five working days of trust" question better than adjectives. The `docs/examples/` link lets readers preview the shape without installing.

---

## Feedback surfaces (launch post + README)

| Option | Description | Selected |
|--------|-------------|----------|
| Both surfaces with intent split | Slack channel placeholder for quick chatter / questions; GitHub Issues URL for bugs / feature requests. Appears in both the launch post's feedback line and the README §Support/Feedback section. | ✓ |
| Slack-only everywhere | Only the Slack channel placeholder; GitHub Issues not mentioned. | |
| Strict separation | Slack-only in launch post; GitHub-only in README. | |
| Merged "support" surface | Single surface, no intent split. | |

**Selected:** Both surfaces with intent split (recommended default).
**Notes:** Locked as D-FEEDBACK-BOTH-SURFACES + D-FEEDBACK-PLACEHOLDER-VERBATIM + D-README-SECTION-MINIMAL. Phase 04 D-ISSUE-DEST locked GitHub Issues as the actionable surface; D-ISSUE-NOT-SLACK explicitly preserved the Slack mention for Phase 07 — this is the call. Slack-only would orphan GitHub Issues and contradict CONTRIBUTING.md. The README section stays minimal (two lines) per CONTRIBUTING.md's "minimal pointer page" precedent.

---

## Honest distribution language (success criterion 4)

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit "internal Liferay tool, no npm publish, no public github" line under install | One sentence makes the distribution model unambiguous. No forbidden tokens anywhere else in the post. | ✓ |
| Silent ("just clone and install") | No explicit statement; trust the reader to infer. | |
| Aspirational hedge ("we may publish later") | Acknowledges npm publish as a future possibility. | |

**Selected:** Explicit honesty line (recommended default).
**Notes:** Locked as D-INSTALL-DISTRIBUTION-HONEST + D-NO-V2-MENTIONS + D-NO-EMOJIS. Success criterion 4 forbids npm publish / public github.com / v2.0 references — explicit statement is the lowest-risk path. Aspirational hedging would create a Slack-thread debate ("when?") that the milestone has no answer for.

---

## Claude's Discretion

- Exact prose wording inside `docs/launch-post.md` (the planner / executor writes the sentences; CONTEXT.md locks structure / ordering / framing / length / install-block shape).
- Indicative ticket-ID-shape inside the first-week outcome bullets (planner picks `LPD-xxxxx`-style placeholders).
- Whether to inline a 1-line snippet of weekly-report output in the launch post (recommend: skip; `docs/examples/` link does this job).
- Exact heading text of the README section: `## Support / Feedback` vs `## Feedback` vs `## Support` (recommend: `## Support / Feedback` to match the success-criterion phrasing and signal dual intent).
- Plan ordering inside Phase 07: one plan per deliverable (parallel-safe) vs one combined plan (both deliverables together fit comfortably in ~60 lines of markdown).

## Deferred Ideas

- FAQ.md (LAUNCH-03) — deferred in REQUIREMENTS.md.
- Issue templates (`.github/ISSUE_TEMPLATE/`, FEEDBACK-01) — deferred in REQUIREMENTS.md.
- Video / GIF demo in launch post (DOCS-06) — deferred to v1.2+.
- CI badge / GitHub Actions wiring (CI-01) — deferred.
- npm registry publish — permanent out-of-scope.
- Public github.com release — permanent out-of-scope.
- Slack-native mrkdwn formatting — rejected (GitHub source has to render).
- `docs/launch-post-thread.md` companion file for the Slack reply thread.
- Inline 3-line example output snippet inside the launch post.
- Retroactive test that greps `docs/launch-post.md` for forbidden tokens (`npm publish`, non-`liferay-appsec` github URLs, "v2"). Could land as Nyquist-validation belt-and-suspenders if verifier wants it.
- Adding the Slack channel to `CONTRIBUTING.md` (kept GitHub-Issues-only per Phase 04 D-ISSUE-NOT-SLACK).
- A hypothetical `self-wiki launch` subcommand that copies the post to clipboard.
