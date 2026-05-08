import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmp, vault, paths, metrics;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-metrics-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');
  paths = await import('../src/utils/paths.js');
  metrics = await import('../src/core/metrics.js');
  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Daily'), { recursive: true });
  paths.setVaultPath(vault);

  // Canned fixture: 2 days, 3 sessions, mixing tickets/PRs/force-pushes/notes.
  writeFileSync(join(vault, 'Daily', '2026-04-27.md'),
    `## Session 1 — Task: LPD-12345 — fix login
- Started: 09:00
- Note [09:15]: opened PR #4521 against master
- Note [09:45]: had to force-push after rebase
- Ended: 10:00
- Duration: 60 min
- Completed: ✅

## Session 2 — Task: LPD-99913 — wiki cleanup
- Started: 10:30
- Note [11:00]: closed pull/9999, touched src/commands/report.js
- Ended: 11:30
- Duration: 60 min
- Completed: ✅
`, 'utf8');

  writeFileSync(join(vault, 'Daily', '2026-04-28.md'),
    `## Session 1 — Task: LPD-12345 — login follow-up
- Started: 14:00
- Note [14:10]: review feedback on #4521; bumped tests in topics module
- Note [14:45]: skill spec update
- Ended: 15:00
- Duration: 60 min
- Completed: ✅
`, 'utf8');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('buildMetrics shape:week matches the pre-refactor weekly format', async () => {
  const out = await metrics.buildMetrics(['2026-04-27', '2026-04-28'], { shape: 'week' });
  // Every line of the historical weekly block is present.
  assert.match(out, /^- \*\*Sessions:\*\* 3 total \(3 completed\)\. Days with logs: 2\./m);
  assert.match(out, /^- \*\*Tickets touched:\*\* LPD-12345, LPD-99913\.$/m);
  assert.match(out, /^- \*\*PRs touched:\*\* #4521, #9999\.$/m);
  assert.match(out, /^- \*\*Force-push mentions:\*\* 1\.$/m);
  // Weekly shape MUST NOT include the month-only lines.
  assert.ok(!out.includes('Components touched'));
  // Weekly shape Sessions line keeps Days-with-logs as a tail clause and
  // does NOT add a separate "**Days with logs:**" line.
  assert.ok(!out.includes('- **Days with logs:**'));
});

test('buildMetrics shape:week defaults to week when shape is omitted', async () => {
  const explicit = await metrics.buildMetrics(['2026-04-27'], { shape: 'week' });
  const implicit = await metrics.buildMetrics(['2026-04-27']);
  assert.equal(explicit, implicit);
});

test('buildMetrics shape:month adds Days-with-logs and Components touched', async () => {
  const out = await metrics.buildMetrics(
    ['2026-04-27', '2026-04-28'],
    {
      shape: 'month',
      components: [
        { slug: 'topics', keywords: ['topics'] },
        { slug: 'wiki', keywords: ['wiki'] },
        { slug: 'unmentioned', keywords: ['unmentioned-keyword'] },
      ],
    },
  );
  assert.match(out, /^- \*\*Days with logs:\*\* 2 \(of 2\)\.$/m);
  assert.match(out, /^- \*\*Components touched:\*\* topics, wiki\.$/m);
});

test('buildMetrics shape:month uses whole-word matching (not substring) per D-11', async () => {
  // 'rep' is a substring of 'report.js' but NOT a whole word in the fixture.
  const out = await metrics.buildMetrics(
    ['2026-04-27'],
    { shape: 'month', components: [{ slug: 'rep-component', keywords: ['rep'] }] },
  );
  // Whole-word: 'rep' should NOT match 'report.js'.
  assert.match(out, /^- \*\*Components touched:\*\* —\.$/m);
});

test('buildMetrics shape:month accepts string-shaped component config', async () => {
  const out = await metrics.buildMetrics(
    ['2026-04-27'],
    { shape: 'month', components: ['wiki'] },
  );
  assert.match(out, /^- \*\*Components touched:\*\* wiki\.$/m);
});

test('buildMetrics empty input renders dashes consistently', async () => {
  const out = await metrics.buildMetrics([], { shape: 'week' });
  assert.match(out, /^- \*\*Sessions:\*\* 0 total\. Days with logs: 0\.$/m);
  assert.match(out, /^- \*\*Tickets touched:\*\* —\.$/m);
  assert.match(out, /^- \*\*PRs touched:\*\* —\.$/m);
  assert.match(out, /^- \*\*Force-push mentions:\*\* 0\.$/m);
});

test('buildMetrics month with empty dates emits month-only lines too', async () => {
  const out = await metrics.buildMetrics([], { shape: 'month', components: ['wiki'] });
  assert.match(out, /^- \*\*Days with logs:\*\* 0 \(of 0\)\.$/m);
  assert.match(out, /^- \*\*Components touched:\*\* —\.$/m);
});
