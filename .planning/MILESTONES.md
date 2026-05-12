# Milestones

## v1.1 Public Release for Liferay Engineers (Shipped: 2026-05-12)

**Delivered:** self-wiki is announce-ready. A fresh Liferay engineer can clone, install, run `self-wiki doctor`, trust the wiring, and find their way to feedback surfaces — all within the first hour. Slack-paste-ready launch post lives at `docs/launch-post.md`.

**Phases completed:** 4 phases (04–07), 10 plans, 18 tasks

**Stats:**

- Tests: 257 passing (added 17 in v1.1: `test/doctor.test.js`, `test/init-narrow-flags.test.js`)
- Repo-level adds: `LICENSE` (Apache 2.0, 202 lines), `NOTICE`, `CONTRIBUTING.md` (72 lines), `docs/examples/{daily-log,weekly-report,monthly-report,self-review}.md`, `docs/launch-post.md` (43 lines), `src/commands/doctor.js` (248 lines)
- README expanded: demo-first reordering, inline example snippets, `## Troubleshooting`, `## Support / Feedback`
- Commits: 41 (Phases 04→07 + audit fixup)
- Timeline: 2026-05-11 → 2026-05-12 (2 calendar days)
- Audit status: `tech_debt` — 12/12 requirements satisfied, 0 BLOCKERs, 2 WARNINGs (INT-3 fixed inline, INT-8 cosmetic deferred)

**Key accomplishments:**

1. **Apache 2.0 legal hygiene** (Phase 04, LEG-01..02) — verbatim 202-line Apache License 2.0 + 4-line NOTICE under "The self-wiki authors", plus 72-line CONTRIBUTING.md naming all four CLAUDE.md architectural rules verbatim. Repo is legally publishable inside Liferay; no MIT residue, no Liferay-Inc copyright drift.
2. **Demo-first public-grade README** (Phase 05, DOCS-01..04) — value-prop and privacy posture lead before install. Real `liferay-appsec/liferay-self-wiki.git` clone URL replaces every `<this-repo-url>` placeholder. Three inline `**Example output:**` snippets (daily / weekly / self-review) + 4 `[→ Full example: docs/examples/...]` link rows. `### Captured` / `### Not captured` enumeration + scrub-pointer + "Nothing leaves your machine automatically." privacy line. Demo-first ordering inverts the prior install-first README.
3. **Four scrubbed reference artifacts** (Phase 05, DOCS-05) — `docs/examples/{daily-log,weekly-report,monthly-report,self-review}.md` synthesized from scratch on a fictional `EXAMPLE-NNN` storyline. Per-file HTML disclaimers. Linked by README and the launch post.
4. **`self-wiki doctor` + narrow-fix init flags** (Phase 06, INST-01..02) — 7-check diagnostic (Node ≥ 20, claude CLI on PATH, vault config present, vault path exists, hooks merged, permissions merged, wiki skill installed) across Runtime/Vault/Claude Code wiring. ✓/✗ with `→ ` remediation hints, Tier-2 drift `i` lines, summary, non-zero exit on any ✗. `init --hooks-only` / `--permissions-only` / `--skill-only` short-circuit init to a single repair surface so doctor's hints are executable.
5. **README Troubleshooting → doctor token contract** (Phase 06, INST-03) — 10-line section between Upgrading and License with a 3-row symptom-to-check-to-fix pipe table. Cross-source string identity locked: 7 check labels + 2 drift tokens (`i hooks:`, `i permissions:`) grep-verifiable in both `README.md` and `src/commands/doctor.js`.
6. **Launch kit** (Phase 07, LAUNCH-01..02) — `docs/launch-post.md` is a 1498-char GFM Slack-paste-ready announcement with locked section order (value prop → 30-second outcome-led pitch leading with the self-review payoff → 60-second install fenced block byte-mirroring README's install plus `self-wiki doctor` as the 6th line → first-week-outcome with 4 example links → feedback line). README `## Support / Feedback` tail-appended as the final section after License: two-line minimal pointer (Slack `#self-wiki-feedback (TODO: confirm channel name)` for chatter; `https://github.com/liferay-appsec/liferay-self-wiki/issues` for bugs). Slack placeholder string is byte-identical across both files.

**Carry-forward / known limitations:**

- Phase 04 human-needed verification: `npm install -g . && self-wiki --help` on a pristine machine (the executor's environment had a stale `npm link` symlink that masked the regression check). Pre-existing — not v1.1-introduced. Worth one real pristine-env test before any public-distribution work.
- INT-8 (cosmetic): trailing-period mismatch on the Issues URL line between README and launch-post. URL byte-identical, link resolves. Punted to v1.2.
- v1.0 carry-forward unchanged: TOCTOU race on refuse-without-force (CR-01) remains documented as single-user assumption; TREND-01..03 and TOOL-01..02 remain deferred to v2.

---

## v1.0 Self-Review Report (Shipped: 2026-05-11)

**Delivered:** A 4-month run of Claude Code work now leaves behind a paste-ready Liferay self-review draft — sourced from monthly reports, weekly reports, and topic pages, shaped to the three Liferay review questions, with accomplishments tagged by Liferay values.

**Phases completed:** 3 phases, 15 plans, 15 tasks

**Stats:**

- Code: ~7,885 LOC across `src/` (4,128) and `test/` (3,757)
- Tests: 240 passing
- Commits: 129 (21 phase-feat, 20 phase-test, plus chore/docs/fix)
- Timeline: 2026-04-27 → 2026-05-11 (14 days; first commit `774f730` → milestone close `5ebae32`)
- Diff vs. project root commit: 84 files changed, +13,639 / −1

**Key accomplishments:**

1. **`self-wiki self-review`** — milestone headline. Generates a Liferay-form-shaped draft at `Reviews/<YYYY>-cycleN.md` with the three review-question sections, value-tagged accomplishments (5 Liferay values inlined), and a `## Sources` provenance footer. Supports `--cycle`, `--last-cycle`, `--since`, `--prior-review`, `--dry-run`, `--force`, `--out`.
2. **`self-wiki report --month [YYYY-MM]`** — themed monthly synthesis as the primary building block for self-review. Deterministic metrics in code, prose through `claude -p`, partial-month note, regenerated marker, prior-month carry-over.
3. **Pure-UTC cycle calendar** — `resolveCycle(date, cycleEndMonths)` in `src/core/cycles.js` supports any cadence (Liferay's 4-month default `[5,9,12]`, semi-annual `[6,12]`, annual `[12]`) with year-boundary safety and 16 tests covering every invalid-input class.
4. **Auto-backfill cascade** — `self-wiki self-review` transparently invokes `reportMonthOrchestrator({internal: true})` for missing monthlies, which in turn backfills missing weeklies. Single `hasClaudeCli` preflight; dry-run never backfills.
5. **Vault-config writeback** — `review.lastReviewedAt` + `review.lastReviewedCycle` patched on success, so subsequent runs default to "since the last one I generated" with no manual tracking.
6. **Quality gates retroactive on Phase 3** — 240-test suite green, 15 structural prompt-shape guards, code review (1 BLOCKER + 6 warnings closed in WR-04/05/06 fixups), security audit (21/21 threats verified), human UAT (3/3 paste-readiness checks against real Liferay vault).

**Carry-forward / known limitations:**

- TOCTOU race on refuse-without-force (CR-01) closed via WR-* fixups but documented as single-user assumption.
- Trend analysis (TREND-01..03) and Liferay-form export helper (TOOL-01..02) deferred to v2 — see archived `milestones/v1.0-REQUIREMENTS.md`.

---
