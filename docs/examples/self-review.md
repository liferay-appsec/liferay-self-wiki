<!--
This is a fictional scrubbed example for self-wiki.
`EXAMPLE-NNN` tickets are made up. For the full storyline see ../../README.md.
-->

# Self-Review — YYYY-cycle1 (YYYY-01-01 → YYYY-04-30)

Sources: drew from `Reports/YYYY-01.md`, `Reports/YYYY-02.md`, `Reports/YYYY-03.md`, `Reports/YYYY-04.md`, weekly reports `Reports/YYYY-W04.md`, `Reports/YYYY-W09.md`, `Reports/YYYY-W14.md`, `Reports/YYYY-W17.md`, and topic pages `Tickets/EXAMPLE-001.md`, `Tickets/EXAMPLE-002.md`, `Tickets/EXAMPLE-003.md`.

## 1. What have you accomplished since your last review? What work are you proud of?

- **Designed and shipped the OAuth `Provider` interface and migrated all four legacy call sites (`EXAMPLE-001`, PRs #421, #427, #428, #431, #436)** *(source: `Reports/YYYY-04.md`, `Reports/YYYY-W14.md`, `Tickets/EXAMPLE-001.md`)* — Produce Excellence, Stay Nerdy
- **Diagnosed and fixed a cross-tab session-expiry race (`EXAMPLE-002`, PR #422), with a two-tab regression test that doubled as the repro fixture** *(source: `Reports/YYYY-04.md`, `Reports/YYYY-W14.md`, `Tickets/EXAMPLE-002.md`)* — Produce Excellence
- **Stood up the coverage-delta signal in the GitHub Actions run summary (`EXAMPLE-003`, PR #423), unblocking the team's "is the trend improving?" question without waiting on org-level fork permissions** *(source: `Reports/YYYY-04.md`, `Reports/YYYY-W17.md`, `Tickets/EXAMPLE-003.md`)* — Produce Excellence, Lead by Serving
- **Mentored a junior engineer on my team through the W15 call-site migrations, pairing on the first two and code-reviewing the rest** *(source: `Reports/YYYY-04.md`, `Reports/YYYY-W17.md`)* — Lead by Serving, Value People
- **Drove the W09 session-store consolidation that retired three legacy code paths the auth refactor would have had to honour otherwise** *(source: `Reports/YYYY-03.md`, `Reports/YYYY-W09.md`)* — Produce Excellence, Grow & Get Better

## 2. Since your last review, what is something you would have done differently in your work?

- **Lock scope follows the data, not the request.** Initially sketched the session-expiry single-flight lock at session-id; the reported race was cross-tab on the same user, so the first attempt would have shipped a fix that missed the reported failure mode. The rule going forward — lock the smallest entity that owns the contested write — would have saved an iteration in W14. *(source: `Reports/YYYY-04.md`, `Reports/YYYY-W14.md`)*
- **Up-front call-site enumeration is worth the session-one cost.** The auth refactor's interface shape held across all four migrations without revision because every call site was inventoried before the interface was drawn. The W04 session-store work, by contrast, took two revisions because two call sites surfaced after the first sketch. *(source: `Reports/YYYY-01.md`, `Reports/YYYY-04.md`, `Reports/YYYY-W04.md`)*

## 3. What is your current area of focus as you "Grow & Get Better", and how will that positively impact your work?

My focus for the next cycle is **deepening test-first discipline for concurrency-class bugs**. Three of the four monthlies this cycle flagged race-condition or single-flight work as the source of either a real production bug (the session-expiry race in `YYYY-04`) or a near-miss that the test suite did not catch on the first pass. The W14 fix landed with a regression test that doubled as the repro fixture — a pattern that paid off again in W15 and again on a different surface in `YYYY-03`'s session-store work. The next cycle should generalise that pattern: every concurrency-class change opens with the two-flow repro test, and the test is the merge gate. The prior cycle's growth focus on observability is paying through here too — the W14 regression test exists because the prior-cycle work made it easy to write.

- *(source: `Reports/YYYY-04.md`)* The session-expiry race fix is the cleanest example of the repro-as-test pattern this cycle.
- *(source: `Reports/YYYY-03.md`, `Reports/YYYY-W09.md`)* The W09 session-store consolidation also benefited from the same repro-as-test approach.
- *(source: `Reports/YYYY-01.md`)* The W04 work, by contrast, missed the pattern and took two revisions — that is the counter-example pointing at the focus area.

## Sources

### Monthly reports
- `Reports/YYYY-01.md`
- `Reports/YYYY-02.md`
- `Reports/YYYY-03.md`
- `Reports/YYYY-04.md`

### Weekly reports
- `Reports/YYYY-W04.md`
- `Reports/YYYY-W09.md`
- `Reports/YYYY-W14.md`
- `Reports/YYYY-W17.md`

### Topic pages
- `Tickets/EXAMPLE-001.md`
- `Tickets/EXAMPLE-002.md`
- `Tickets/EXAMPLE-003.md`
