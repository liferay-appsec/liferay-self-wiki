# Contributing to self-wiki

Thank you for your interest in contributing. This document gives you the
minimum you need to file a useful issue, set up a dev environment, and
get a PR through.

## Where to file issues

Open a GitHub issue:
https://github.com/liferay-appsec/liferay-self-wiki/issues

Please include the self-wiki version (`self-wiki --version`), the
operating system, and a reproduction step if you can produce one.
Feature requests are welcome via the same tracker.

## Architectural contract

Read [`CLAUDE.md`](./CLAUDE.md) before opening a PR. It is the canonical
source for all architectural rules and the rationale behind each one.
The four rules every PR is measured against:

- `autonomy-at-the-hook`
- `daily-logs-as-source-of-truth`
- `deterministic-vs-model`
- `soft-deps-degrade-silently`

These names are intentionally terse slugs — `CLAUDE.md` has the full
rule text, the constraints that follow from each rule, and the
"What NOT to do" section that flags common mistakes. Skipping this read
is the most common reason a PR needs rework.

## Dev flow

Local development uses `npm link` so your changes are picked up live
without a reinstall. The steps below assume Node 20+.

```bash
git clone https://github.com/liferay-appsec/liferay-self-wiki.git
cd liferay-self-wiki
npm install
npm link
self-wiki init /path/to/your/vault
```

After `npm link`, the `self-wiki` binary on your PATH points at your
working copy. Edit a source file and re-run `self-wiki <command>` — no
rebuild step required (ESM, no transpile).

Point `self-wiki init` at a scratch vault (not your real vault) while
developing. Pass `--no-set-default` if you do not want the init call to
rewrite your global config: `self-wiki init /tmp/test-vault --yes --no-set-default`.

## Tests

1. `npm test` must pass.
2. New features require new tests.
3. Bug fixes require a regression test that fails before the fix and passes after.

Doc-only PRs (`.md` changes) and pure typo fixes are exempt from the
new-test requirement, but `npm test` must still pass.

Tests live in `test/*.test.js` and use Node's built-in test runner
(`node:test` + `node:assert/strict`). When adding tests, mirror the
closest existing test file — the suite already covers config, cycles,
format, logger, log-parser, paths, session, state, topics, and more.
Avoid introducing new patterns or assertion libraries.

Run the suite:

```bash
npm test
```
