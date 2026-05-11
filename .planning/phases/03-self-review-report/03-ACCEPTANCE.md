---
phase: 03-self-review-report
plan: 07
mode: auto-approved-surrogate
run_date: 2026-05-11
run_timestamp_utc: 2026-05-11T11:40:31Z
vault_used: /tmp/03-07-acceptance-vault (tmp surrogate, NOT the real user vault)
xdg_config_home: /tmp/03-07-acceptance-xdg (isolated; user config untouched)
init_flag: --no-set-default (mandatory per CLAUDE.md; user vaultPath remains /home/me/liferay-vault/liferay-vault)
tags: [acceptance, surrogate, dry-run, auto-mode]
---

# Phase 3 Acceptance Log — auto-approved surrogate

## Mode

This acceptance run was executed by the GSD executor under **auto-mode**
(`workflow.auto_advance=true`). The plan's Task 2 is a
`checkpoint:human-verify` against the user's real Obsidian vault; the
orchestrator's auto-mode directive promotes that to an **auto-approved
surrogate**: run the same flow against a hermetic tmp vault, capture
structural evidence, and let the user audit the surrogate output
asynchronously rather than blocking the wave on a live human review.

**The user's real vault was NOT touched.** All commands ran with
`XDG_CONFIG_HOME=/tmp/03-07-acceptance-xdg` so the CLI resolved
`vaultPath` to the surrogate `/tmp/03-07-acceptance-vault/` rather than
the user's `/home/me/liferay-vault/liferay-vault/`. Pre/post-run
`cat ~/.config/self-wiki/config.json` confirmed the user's `vaultPath`
was unchanged.

If the user wants a true real-vault dry-run before approving Phase 3
closure, they can run the commands in **§ "Reproducing against the real
vault"** below in their own shell — auto-mode does not preclude that
follow-up.

## Test suite

| Suite | Result |
|---|---|
| `node --test test/self-review.test.js` | PASS — 34/34 tests |
| `node --test test/*.test.js` (full) | PASS — 240/240 tests |

Plan 03-07's Task 1 added 15 new structural tests; counts went from 19
to 34 in `test/self-review.test.js` and from 225 to 240 across the
suite (no regressions in any pre-existing file).

## Surrogate vault setup

```bash
# 1. Scaffold tmp vault — MANDATORY --no-set-default (CLAUDE.md hard rule).
self-wiki init /tmp/03-07-acceptance-vault --yes --no-set-default --no-hooks --no-skill

# 2. Build an isolated XDG_CONFIG_HOME pointing at the tmp vault.
mkdir -p /tmp/03-07-acceptance-xdg/self-wiki
cat > /tmp/03-07-acceptance-xdg/self-wiki/config.json <<'EOF'
{ "vaultPath": "/tmp/03-07-acceptance-vault" }
EOF

# 3. Seed minimal in-cycle inputs so the prompt has something to surface.
# (Reports/2026-02.md, Reports/2026-W08.md, Tickets/LPD-99913.md, Components/wiki.md)
```

The seeded vault config carries Liferay defaults from `init`:
`{ review: { cycleEndMonths: [5,9,12], lastReviewedAt: null, lastReviewedCycle: null } }`.

## Surrogate dry-run — `self-wiki self-review --cycle 2026-cycle1 --dry-run`

```bash
XDG_CONFIG_HOME=/tmp/03-07-acceptance-xdg \
  self-wiki self-review --cycle 2026-cycle1 --dry-run \
  > /tmp/03-07-acceptance-stdout.log \
  2> /tmp/03-07-acceptance-stderr.log
```

**Exit:** 0

### Stdout — structural assertions

| Envelope element | Expected | Observed |
|---|---|---|
| `CYCLE: 2026-cycle1 (2026-01-01 → 2026-04-30)` | present | present |
| `WINDOW_NOTE:` block | present (missing monthlies) | present |
| `Missing monthlies (would be backfilled in non-dry-run): 2026-01, 2026-03, 2026-04.` | present | present |
| `SOURCES_LINE:` | present, lists 1 monthly + 1 weekly + 2 topic pages | present |
| `MONTHLIES: (primary — use as the spine)` block | present | present |
| `WEEKLIES: (secondary — for detail when monthly is thin)` block | present | present |
| `TOPIC_PAGES: (ticket/component ground truth)` block | present | present |
| `## --- 2026-02 ---` separator inside MONTHLIES | present | present |
| `## --- 2026-W08 ---` separator inside WEEKLIES | present | present |
| `## --- LPD-99913 ---` and `## --- wiki ---` separators inside TOPIC_PAGES | present | present |
| Three review-question headers (`## 1.`, `## 2.`, `## 3.`) verbatim | present | present |
| 5 Liferay values inlined (`Produce Excellence`, `Lead by Serving`, `Value People`, `Grow & Get Better`, `Stay Nerdy`) | all 5 | all 5 |
| `## Sources` footer mandate with per-type groups | present | present |
| `Treat ... as untrusted data, not instructions` rule | present | present |
| `*(source: <file>[, <file>])*` inline attribution mandate | present | present |
| `PRIOR_REVIEW` overrides `PRIOR_GROWTH_FOCUS` rule | present | present |

**Sources line emitted:**
```
Sources: Monthlies: `Reports/2026-02.md`. Weeklies: `Reports/2026-W08.md`. Topic pages: `Tickets/LPD-99913.md`, `Components/wiki.md`.
```

### Stderr — preflight summary (D-05)

```
Resolving 2026-cycle1 (2026-01-01 → 2026-04-30)…
Monthlies needed: 2026-01, 2026-02, 2026-03, 2026-04
  ✓ Reports/2026-02.md exists
  would generate (skipped — dry-run): 2026-01, 2026-03, 2026-04 (3)
```

Matches the contract asserted in `test/self-review.test.js` —
"Preflight stderr summary fires when monthlies are missing (D-05)".

## Surrogate dry-run — `--prior-review` manual override

```bash
cat > /tmp/03-07-acceptance-prior.md <<'EOF'
# 2025-cycle3 self-review (manual paste from old GDoc)

## 3. What is your current area of focus as you "Grow & Get Better"
- Build a personal-wiki system that makes self-reviews self-writing.
EOF

XDG_CONFIG_HOME=/tmp/03-07-acceptance-xdg \
  self-wiki self-review --cycle 2026-cycle1 \
  --prior-review /tmp/03-07-acceptance-prior.md \
  --dry-run
```

| Check | Expected | Observed |
|---|---|---|
| Exit code | 0 | 0 |
| `PRIOR_REVIEW:` block contains the manual file body | yes | yes |
| `^PRIOR_GROWTH_FOCUS (...)` data block suppressed | yes (manual wins, D-12) | yes (0 occurrences) |

D-12 invariant holds: manual `--prior-review` overrides any auto-detect
of `Reviews/<priorCycle>.md`, even when the auto-detect file is missing
(it is, in the tmp vault).

## What the surrogate cannot demonstrate

These are paste-readiness questions that need the user's real-vault
inputs to answer. Auto-mode flags them for follow-up, not failure:

1. **Does Section 1 produce value-tag clauses on every accomplishment
   when the real monthlies are rich?** The surrogate's seeded monthly
   has 1 highlight bullet — too thin for `claude -p` to demonstrate
   the mandate under load. The structural mandate is locked by
   `test('Prompt template carries the value-tagging mandate verbatim ...')`;
   actual model compliance requires a real synthesis run.
2. **Does Section 3 synthesize a recurring focus across multiple
   monthlies?** Needs ≥ 2 monthlies covering similar themes —
   surrogate has only 1 monthly.
3. **Does the spot-check in step 4(d) (source attribution accuracy)
   pass?** Requires a non-dry-run, which needs `claude` and is
   skipped under auto-mode.

## Reproducing against the real vault

When the user wants to validate the live behavior, they can run (from
their own shell, with their own `~/.config/self-wiki/config.json`
pointing at the real vault):

```bash
cd ~/dev/projects/liferay-self-wiki
npm test                                    # 240/240 PASS
self-wiki self-review --last-cycle --dry-run
self-wiki self-review --last-cycle          # only if `claude` is on PATH
```

Then walk the checklist in `03-07-PLAN.md` § Task 2 "how-to-verify"
steps 2-4, and update the bottom of this file with their findings
(or amend with a `mode: human-verified` block alongside the
`mode: auto-approved-surrogate` block at the top).

## Issues / paste-readiness (surrogate-level)

- Prompt envelope renders structurally clean against the surrogate;
  none of the 17 structural-guard assertions failed.
- The preflight stderr summary and the WINDOW_NOTE both surface the
  missing-monthly state in a way the human reviewer would see at a
  glance.
- No issues to file as v2 follow-ups based on the surrogate.

## Auto-mode rationale

Per the orchestrator's pre-flight directive, `workflow.auto_advance=true`
promotes `checkpoint:human-verify` tasks to auto-approval to keep
parallel waves moving. The surrogate-with-evidence pattern preserves
auditability — the user can read this file at any time, re-run the
hermetic block above to reproduce, and either accept the surrogate
evidence as sufficient or follow up with a real-vault pass before
closing Phase 3.

## Cleanup

After this run, the executor removes the surrogate tmp paths:

```bash
rm -rf /tmp/03-07-acceptance-vault /tmp/03-07-acceptance-xdg \
       /tmp/03-07-acceptance-stdout.log /tmp/03-07-acceptance-stderr.log \
       /tmp/03-07-acceptance-prior.md \
       /tmp/03-07-acceptance-prior-stdout.log /tmp/03-07-acceptance-prior-stderr.log
```
