# self-wiki

> _Optional: replace this line with one sentence on why you tried
> self-wiki and what stuck — or delete the whole quote before
> sending._

## What it is

A self-writing wiki — `claude` sessions leave daily logs, per-ticket history, and weekly reports. No per-session commands.

## What you get in 30 seconds

- **Cycle close:** paste-ready Liferay self-review draft, tagged by the five values.
- **Weekly:** themed report (decisions, lessons, carry-over) from daily logs.
- **Daily:** terse notes in `Daily/<date>.md` — no command needed.
- **Tickets:** history in `Tickets/LPD-xxxxx.md` across sessions.

## 60-second install

```sh
git clone https://github.com/liferay-appsec/liferay-self-wiki.git self-wiki
cd self-wiki
npm install
npm install -g .
self-wiki init /path/to/your/vault
self-wiki doctor
```

See the [README](../README.md#install) for prerequisites.

Internal Liferay tool — clone from `liferay-appsec/liferay-self-wiki` and `npm install -g .`.

## First-week outcome

After five days: ~5 `Daily/` files, `Tickets/LPD-xxxxx.md` pages, a weekly report via `self-wiki report --week`.

Shapes: [daily log](examples/daily-log.md), [weekly report](examples/weekly-report.md), [monthly report](examples/monthly-report.md), [self-review draft](examples/self-review.md).

## Feedback

Quick chatter / questions: `#self-wiki-feedback (TODO: confirm channel name)` on Liferay Slack.

Bugs / feature requests: https://github.com/liferay-appsec/liferay-self-wiki/issues
