---
phase: 04-legal-contributor-onboarding
verified: 2026-05-11T17:03:16Z
status: human_needed
score: 7/7
overrides_applied: 0
human_verification:
  - test: "Run `npm install -g . && self-wiki --help` on a clean machine (no prior npm link)"
    expected: "Both commands exit 0; self-wiki --help prints the commander usage banner including all subcommands"
    why_human: "The regression check passed with --force due to a pre-existing npm link symlink in the executor environment. A true clean-install test requires either a fresh machine or a wiped npm prefix. The regression check passed but the environment was not pristine."
---

# Phase 04: Legal & Contributor Onboarding — Verification Report

**Phase Goal:** Repo is legally publishable inside Liferay (Apache 2.0 LICENSE present) and a contributor can find the architecture bar and dev flow without spelunking through code.
**Verified:** 2026-05-11T17:03:16Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | LICENSE at repo root contains verbatim Apache License 2.0 text with appendix placeholders `[yyyy]` and `[name of copyright owner]` left intact | VERIFIED | 202-line file; `grep -Fc "[yyyy]" LICENSE` = 1; `grep -Fc "[name of copyright owner]" LICENSE` = 1; line 2 = "Apache License" (line 1 is blank per canonical apache.org form) |
| 2 | LICENSE contains no `Liferay, Inc.`, no `Christian Moura`, no MIT content | VERIFIED | `grep -c "Liferay, Inc." LICENSE` = 0; `grep -c "Christian Moura" LICENSE` = 0; `grep -c "MIT License" LICENSE` = 0 |
| 3 | NOTICE exists with exact D-NOTICE four-line content; copyright holder is "The self-wiki authors"; no Liferay Inc or MIT content | VERIFIED | 4-line NOTICE; "Copyright 2026 The self-wiki authors" on line 2; `grep -ic "MIT" NOTICE` = 0; `grep -c "Liferay, Inc." NOTICE` = 0 |
| 4 | CONTRIBUTING.md exists with four `##` sections in D-DOC-SHAPE order; 60–150 lines | VERIFIED | 72 lines; `grep -c "^## " CONTRIBUTING.md` = 4; sections at lines 7/16/32/53 → Where to file issues → Architectural contract → Dev flow → Tests |
| 5 | A 30-second reader can find: issues URL, four CLAUDE.md rule names verbatim, `npm link` dev flow, test bar | VERIFIED | Issues URL present (`github.com/liferay-appsec/liferay-self-wiki/issues` = 1); all four rule names present: `autonomy-at-the-hook`, `daily-logs-as-source-of-truth`, `deterministic-vs-model`, `soft-deps-degrade-silently` (each = 1); `npm link` = 3 matches; `npm test` = 3 matches |
| 6 | CONTRIBUTING.md contains no `Liferay, Inc.`, no Slack mention, no `npm install -g .` | VERIFIED | `grep -c "Liferay, Inc." CONTRIBUTING.md` = 0; `grep -ic "slack" CONTRIBUTING.md` = 0; `grep -Fc "npm install -g ." CONTRIBUTING.md` = 0 |
| 7 | `npm test` exits 0 — no regression from Phase 04 docs-only changes | VERIFIED | 240/240 tests pass, 0 failures (confirmed by executor and independently re-run) |

**Score:** 7/7 truths verified (all automated checks pass)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `LICENSE` | Apache License 2.0 verbatim, ≥150 lines, appendix placeholders intact | VERIFIED | 202 lines; canonical apache.org form; placeholders `[yyyy]` and `[name of copyright owner]` each appear exactly once in the appendix |
| `NOTICE` | Four-line D-NOTICE content; "The self-wiki authors" copyright | VERIFIED | Exact content: `self-wiki` / `Copyright 2026 The self-wiki authors` / (blank) / `Licensed under the Apache License, Version 2.0.` |
| `CONTRIBUTING.md` | Four-section pointer page; ≥60 lines; four rule names verbatim | VERIFIED | 72 lines; all four rule names as backtick-wrapped list items; four `##` sections in exact D-DOC-SHAPE order |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| NOTICE | LICENSE | "Licensed under the Apache License, Version 2.0." reference line | VERIFIED | `grep -Fq "Licensed under the Apache License, Version 2.0." NOTICE` matches |
| CONTRIBUTING.md §Architectural contract | CLAUDE.md | Named pointer: "Read `CLAUDE.md` before opening a PR" | VERIFIED | `grep -c "CLAUDE.md" CONTRIBUTING.md` = 2 (one in prose, one in link) |
| CONTRIBUTING.md §Where to file issues | GitHub Issues | `https://github.com/liferay-appsec/liferay-self-wiki/issues` | VERIFIED | Exact URL present, no URL shorteners, no redirect |
| CONTRIBUTING.md §Dev flow | npm link flow | `npm link` in fenced bash block | VERIFIED | `grep -c "npm link" CONTRIBUTING.md` = 3 (fenced block + prose) |
| CONTRIBUTING.md §Tests | test infrastructure | `test/*.test.js` + `npm test` | VERIFIED | `grep -c "test/" CONTRIBUTING.md` = 1; `grep -c "npm test" CONTRIBUTING.md` = 3 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LEG-01 | 04-01 | LICENSE file at repo root — Apache 2.0 (D-LEG-01-OVERRIDE: "The self-wiki authors", not "Liferay, Inc.") + NOTICE | SATISFIED | LICENSE: 202-line verbatim Apache 2.0 from apache.org; NOTICE: 4-line D-NOTICE content; no Liferay Inc anywhere |
| LEG-02 | 04-02 | CONTRIBUTING.md — issues URL, CLAUDE.md architectural rules (four names), npm link dev flow, no-PR-without-tests bar | SATISFIED | All four rule names verbatim; issues URL present; npm link in dev flow section; three-rule test bar in §Tests |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `package.json` | 6 | `"license": "MIT"` — inconsistent with LICENSE file (now Apache 2.0) | WARNING | No functional impact on Phase 04 goal (distribution is clone + npm install -g ., not npm publish). GitHub's license detector reads the LICENSE file, not package.json. Needs correction but is outside Phase 04 scope per all plan files; suggest fix in Phase 05 or as a standalone commit. |

No TODO/FIXME/placeholder comments found in LICENSE, NOTICE, or CONTRIBUTING.md. No stub implementations. No hardcoded empty data. All three files are complete static artifacts.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test` exits 0 | `npm test \| grep "^# (pass\|fail)"` | `# tests 240` / `# pass 240` / `# fail 0` | PASS |
| CONTRIBUTING.md has correct section order | `grep -n "^## " CONTRIBUTING.md` | Lines 7/16/32/53 — Where to file issues → Architectural contract → Dev flow → Tests | PASS |
| LICENSE first non-blank line is "Apache License" | `sed -n '2p' LICENSE` | `"                                 Apache License"` | PASS |
| NOTICE has exact D-NOTICE copyright line | `grep -E "^Copyright 2026 The self-wiki authors$" NOTICE` | 1 match | PASS |
| No Liferay Inc in any of the three files | `grep -c "Liferay, Inc." LICENSE NOTICE CONTRIBUTING.md` | 0 / 0 / 0 | PASS |

---

## Out-of-Scope Discipline

| Check | Result |
|-------|--------|
| No README.md changes in Phase 04 commits | PASS — `git diff` on bc0a81a, f8afca7, 39195cd, 9c46751 shows no README.md changes |
| No CLAUDE.md changes in Phase 04 commits | PASS — same diff inspection; CLAUDE.md untouched |
| No `.github/ISSUE_TEMPLATE/` added | PASS — `.github/` directory does not exist in repo |
| No per-file copyright headers added | PASS — no source file changes at all in Phase 04 (docs-only) |
| No Slack mention in any Phase 04 artifact | PASS — CONTRIBUTING.md Slack = 0 |

---

## Human Verification Required

### 1. Clean-install regression check

**Test:** On a machine without a prior `npm link` or `npm install -g .` of self-wiki, run:
```
npm install -g . && self-wiki --help
```
**Expected:** Both commands exit 0; `self-wiki --help` prints the commander usage banner (Usage, Options, Commands).
**Why human:** The executor's Task 2 regression check ran `npm install -g . --force` because the environment already had a `self-wiki` symlink from a prior `npm link`. The `--force` flag resolved a pre-existing EEXIST, not a Phase 04 regression. However, SC-3 ("npm install -g . continues to work") technically requires a clean install path to be fully confirmed. `npm test` (240/240) and the code content (docs-only changes) give high confidence this passes; the --force detail is the only residual uncertainty.

---

## Notable Observations (Non-Blocking)

1. **`package.json` `"license"` field is still `"MIT"`** — The LICENSE file is now Apache 2.0 but `package.json` still declares `"license": "MIT"`. npm's package metadata is inconsistent with the committed LICENSE file. This does not affect Phase 04's goal (the LICENSE file is what GitHub's detector reads; distribution is clone + npm install -g ., not npm publish) but should be corrected. Suggest a one-line fix in Phase 05 or a standalone commit.

2. **`package.json` `"files"` array omits LICENSE and NOTICE** — The `"files"` array lists `["src", "README.md", "CLAUDE.md"]` and does not include `LICENSE` or `NOTICE`. npm automatically includes all-caps `LICENSE` and `NOTICE` files in any package tarball regardless of the `"files"` field, so this is not a compliance gap. Informational only.

3. **Canonical apache.org `head -1` is blank** — The plan's acceptance criterion stated `head -1 LICENSE | grep -F "Apache License"` but the verbatim apache.org text begins with an empty line; "Apache License" is on line 2. The SUMMARY correctly documents this as a minor deviation (the plan criterion is wrong, not the file — the file IS the verbatim canonical text). Both the executor and this verifier confirm the file content is correct.

---

## Gaps Summary

No gaps blocking the phase goal. All 7 observable truths VERIFIED. The `human_needed` status is due to the clean-install regression test being executed with `--force` in a non-pristine environment. All automated evidence (240/240 tests, docs-only phase changes, no src/ modifications) points strongly toward SC-3 being satisfied; this is a low-confidence-gap, not a suspected failure.

---

_Verified: 2026-05-11T17:03:16Z_
_Verifier: Claude (gsd-verifier)_
