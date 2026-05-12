# Phase 04: Legal & Contributor Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 04-legal-contributor-onboarding
**Areas discussed:** LICENSE replacement mechanics, Issue intake destination, CONTRIBUTING.md shape & depth, Testing-bar specifics

---

## LICENSE replacement mechanics

### Q1 — Which Apache 2.0 text should land in `LICENSE`?

| Option | Description | Selected |
|--------|-------------|----------|
| Verbatim from apache.org incl. appendix | Full text from apache.org/licenses/LICENSE-2.0.txt incl. appendix, with placeholders REPLACED inline at the bottom by `2026 Liferay, Inc.` | |
| License body only, copyright line at top | Skip the appendix and put `Copyright 2026 Liferay, Inc.` as a header line above the license body | |
| Verbatim, no inline copyright at all | Drop the Apache 2.0 text exactly as published with `[yyyy]`/`[name]` placeholders LEFT IN; copyright statement in a separate NOTICE file | ✓ |

**User's choice:** Verbatim, no inline copyright at all
**Notes:** Implies a NOTICE file must accompany LICENSE.

### Q2 — What goes in the `NOTICE` file?

| Option | Description | Selected |
|--------|-------------|----------|
| Single-line copyright only | Bare attribution: `Copyright 2026 Liferay, Inc.` + Apache 2.0 reference | |
| Copyright + acknowledgement of prior MIT history | Same + 1–2 line note acknowledging v1.0 was MIT/Christian-Moura before relicense | |
| Copyright + acknowledgement + 3rd-party deps | Above + 'Third-Party Components' section enumerating runtime deps | |

**User's choice:** None — user rejected the options to clarify scope.
**Notes:** User stated: "dont put any Liferay Inc in the copyrights". Reformulated as Q2b below.

### Q2b — If no `Liferay, Inc.` in the copyright, what should the attribution look like?

| Option | Description | Selected |
|--------|-------------|----------|
| No NOTICE file, no copyright string anywhere | LICENSE stays pristine, no NOTICE, no copyright statement at all | |
| Author attribution (Christian Moura) | NOTICE credits `Copyright 2026 Christian Moura` | |
| Project attribution (`The self-wiki authors`) | NOTICE credits `Copyright 2026 The self-wiki authors`; forward-compatible | ✓ |

**User's choice:** Project attribution (`The self-wiki authors`)
**Notes:** Strong override of REQUIREMENTS.md LEG-01 which literally specifies `(Liferay, Inc.)`. Captured in CONTEXT.md as D-LEG-01-OVERRIDE.

### Q3 — Acknowledge the prior MIT history in `NOTICE`?

| Option | Description | Selected |
|--------|-------------|----------|
| No — keep NOTICE minimal | Single-line copyright + Apache 2.0 reference only | ✓ |
| Yes — one-line note | `v1.0 was released under the MIT License; re-licensed under Apache 2.0 starting v1.1.` | |
| Yes — keep both licenses available | Preserve v1.0 license text in `LICENSE-MIT` alongside `LICENSE` | |

**User's choice:** No — keep NOTICE minimal
**Notes:** Sole-original-author re-license; no third-party MIT permission grant to propagate.

---

## Issue intake destination

### Q1 — Where does CONTRIBUTING.md tell contributors to file issues?

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Issues on `liferay-appsec/liferay-self-wiki` | Standard; tracker lives with the code; gh CLI integration works | ✓ |
| Slack channel (aligns with Phase 07 LAUNCH-02) | Reuse the Slack feedback channel; downside: not searchable/assignable | |
| Both — GitHub Issues for bugs/features, Slack for chatter | Bifurcates the contributor surface | |
| Internal Liferay JIRA (decide project) | No obvious JIRA project for personal tooling | |

**User's choice:** GitHub Issues on `liferay-appsec/liferay-self-wiki`
**Notes:** URL: https://github.com/liferay-appsec/liferay-self-wiki/issues

### Q2 — How prescriptive should CONTRIBUTING.md be about how to file a good issue?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — just the URL | One line + URL; no template, no severity guidance | ✓ |
| URL + tiny etiquette block | 2–3 line 'include what command, what happened, what expected' | |
| URL + ship `.github/ISSUE_TEMPLATE/` in this phase | Adds templates; conflicts with FEEDBACK-01 deferral | |

**User's choice:** Minimal — just the URL
**Notes:** Respects FEEDBACK-01 deferral.

---

## CONTRIBUTING.md shape & depth

### Q1 — What shape should `CONTRIBUTING.md` take?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal pointer page | ~60–100 lines, four sections; matches LEG-02 30-second-comprehension bar | ✓ |
| Fuller guide with conventions | ~150–250 lines; branch naming, commit conventions, code style | |
| Two-tier (Quick + Full) | Quick block on top, detailed section below | |

**User's choice:** Minimal pointer page
**Notes:** Four sections: Issues → Architectural contract → Dev flow → Tests.

### Q2 — Architectural rules — restate or just link?

| Option | Description | Selected |
|--------|-------------|----------|
| Restate all four rules with one-line gist + 'read CLAUDE.md' | Names each rule + 1-line summary | |
| Just name the four rules + 'read CLAUDE.md' | Lists the four names by name; reader clicks through for gloss | ✓ |
| Just link to CLAUDE.md | One sentence; doesn't name the four rules; would fail LEG-02 criterion 2 literally | |

**User's choice:** Just name the four rules + 'read CLAUDE.md'
**Notes:** Satisfies LEG-02 success criterion 2 literally without duplicating CLAUDE.md content.

---

## Testing-bar specifics

### Q1 — What's the test bar in `CONTRIBUTING.md`?

| Option | Description | Selected |
|--------|-------------|----------|
| New features need tests; bug fixes need a regression test; docs/typos exempt | Standard OSS bar | ✓ |
| All PRs need green `npm test`; new features AND bug fixes need new tests | Stricter; doc-only PRs still run tests | |
| Loose — `npm test` should stay green; tests strongly encouraged but not gated | Soft bar | |

**User's choice:** New features need tests; bug fixes need a regression test; docs/typos exempt
**Notes:** Bug fix regression test must fail before / pass after the fix.

### Q2 — How much should the Tests section say about *how* to write tests?

| Option | Description | Selected |
|--------|-------------|----------|
| Bar + command only | State the bar, `npm test` command, `test/*.test.js` pattern, `node:test`+`node:assert/strict`, mirror closest existing file | ✓ |
| Bar + brief style guide | Above + describe/it conventions, assertions-per-test, temp-dir patterns | |
| Just the bar, no implementation guidance | Reader infers framework from package.json + test/ directory | |

**User's choice:** Bar + command only
**Notes:** Consistent with the minimal-pointer shape from Area 3.

---

## Claude's Discretion

- **Exact phrasing of every section** in CONTRIBUTING.md.
- **Line count of CONTRIBUTING.md** within the 60–150 line envelope.
- **Markdown heading-level choices** within the four-section structure.
- **The `NOTICE` filename** — capitalized `NOTICE`, no extension (Apache convention).
- **Whether to add a final 'See also' or 'License' line** at the foot of CONTRIBUTING.md.

## Deferred Ideas

- **LEG-03** — per-file copyright headers. Already deferred to v1.2+ in REQUIREMENTS.md.
- **FEEDBACK-01** — `.github/ISSUE_TEMPLATE/*.md`. Already deferred.
- **CLAUDE.md staleness cleanup** — CLAUDE.md says "no test suite yet (v0.1)" but 15 test files / 240-test suite exist. Phase 05 (Public-Grade Documentation) territory, not Phase 04.
- **README cross-links** to LICENSE / NOTICE / CONTRIBUTING. Phase 05 (DOCS-01..DOCS-05).
- **NOTICE third-party-dependencies section.** Considered and dropped — Apache 2.0 doesn't require it for permissively-licensed npm deps.
- **Dual-licensing (`LICENSE-MIT` legacy file).** Considered and dropped — sole-original-author re-license doesn't require it.
