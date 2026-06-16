import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { parseFeedbackItems } from '../src/core/review-capture.js';

let tmp, vault;
const CLI_ENTRY = new URL('../src/cli.js', import.meta.url).pathname;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-review-record-'));
  process.env.XDG_DATA_HOME = join(tmp, 'data');
  process.env.XDG_CONFIG_HOME = join(tmp, 'cfg');

  vault = join(tmp, 'vault');
  mkdirSync(join(vault, 'Reviews'), { recursive: true });
  mkdirSync(join(vault, '.self-wiki'), { recursive: true });
  mkdirSync(join(tmp, 'cfg', 'self-wiki'), { recursive: true });

  writeFileSync(
    join(tmp, 'cfg', 'self-wiki', 'config.json'),
    JSON.stringify({ vaultPath: vault }, null, 2),
    'utf8',
  );
  writeFileSync(
    join(vault, '.self-wiki', 'config.json'),
    JSON.stringify({
      components: [],
      review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null },
    }, null, 2),
    'utf8',
  );
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runReview(args, opts = {}) {
  return spawnSync(process.execPath, [CLI_ENTRY, 'review', ...args], {
    env: {
      ...process.env,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    },
    encoding: 'utf8',
    ...opts,
  });
}

function fixture(name, body) {
  const p = join(tmp, name);
  writeFileSync(p, body, 'utf8');
  return p;
}

// Stub `claude` on PATH: the script ignores its args/stdin and prints a fixed
// body to stdout, exiting 0. It serves BOTH `claude --version` (hasClaudeCli
// only checks exit code) and `claude -p` (claudeHeadless reads stdout). Returns
// the bin dir to prepend to a child env's PATH.
function withStubbedClaude(stdoutBody) {
  const binDir = mkdtempSync(join(tmpdir(), 'self-wiki-claude-stub-'));
  const stub = join(binDir, 'claude');
  writeFileSync(stub, `#!/bin/sh\ncat <<'CLAUDE_EOF'\n${stdoutBody}\nCLAUDE_EOF\n`, 'utf8');
  chmodSync(stub, 0o755);
  return binDir;
}

// RCAP-01 — --self stores Reviews/<cycle>-final.md
test('review record --self writes Reviews/<cycle>-final.md (RCAP-01)', () => {
  const f = fixture('final.txt', 'My final submitted self-review body.');
  const r = runReview(['record', '--self', '--cycle', '2026-cycle1', f]);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /wrote .*2026-cycle1-final\.md/);
  const body = readFileSync(join(vault, 'Reviews', '2026-cycle1-final.md'), 'utf8');
  assert.match(body, /# Final Submitted Self-Review — 2026-cycle1/);
  assert.match(body, /My final submitted self-review body\./);
});

// RCAP-02/03 — --manager stores Reviews/<cycle>-manager.md with a ## Feedback Items section
// PATH is cleared so claude is absent — deterministic soft-degrade (D-07).
test('review record --manager writes Reviews/<cycle>-manager.md with a Feedback Items section (RCAP-02/03, soft-degrade stub)', () => {
  const f = fixture('mgr.txt', 'Be more proactive in design reviews. Deepen OSGi knowledge.');
  const r = runReview(
    ['record', '--manager', '--cycle', '2026-cycle1', f],
    {
      env: {
        ...process.env,
        PATH: '/nonexistent',
        XDG_DATA_HOME: process.env.XDG_DATA_HOME,
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      },
    },
  );
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);   // never fails on missing claude (D-07)
  assert.match(r.stderr, /warn:.*claude/);
  const body = readFileSync(join(vault, 'Reviews', '2026-cycle1-manager.md'), 'utf8');
  assert.match(body, /# Manager Review — 2026-cycle1/);
  assert.match(body, /Be more proactive in design reviews\./);  // verbatim text stored
  assert.match(body, /## Feedback Items/);
  assert.ok(!/^- \*\*FB-\d+\*\*:/m.test(body));       // no actual FB items in empty stub when claude absent
});

// Extraction path (claude present): the command prints a progress notice before
// the model call (so a multi-second `claude -p` is not mistaken for a hang) and
// writes the AI-extracted FB-N items. Hermetic via a stubbed claude on PATH.
test('review record --manager prints a progress notice and writes extracted FB items when claude is present', () => {
  const binDir = withStubbedClaude('- Be more proactive in design reviews\n- Deepen OSGi knowledge');
  try {
    const f = fixture('mgr-extract.txt', 'Manager prose to extract from.');
    const r = runReview(
      ['record', '--manager', '--cycle', '2027-cycle1', f],
      {
        env: {
          ...process.env,
          PATH: binDir + ':' + process.env.PATH,
          XDG_DATA_HOME: process.env.XDG_DATA_HOME,
          XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
        },
      },
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /extracting feedback items.*2027-cycle1.*claude -p/);  // progress notice (anti-hang UX)
    const body = readFileSync(join(vault, 'Reviews', '2027-cycle1-manager.md'), 'utf8');
    assert.match(body, /- \*\*FB-1\*\*: Be more proactive in design reviews/);    // extracted, verbatim-faithful
    assert.match(body, /- \*\*FB-2\*\*: Deepen OSGi knowledge/);
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
});

// RCAP-04 / D-02 / D-03 — refuse-without-force protects each file; sibling untouched
test('refuse-without-force on existing -final.md; -manager.md untouched (RCAP-04/D-02/D-03)', () => {
  writeFileSync(join(vault, 'Reviews', '2026-cycle2-final.md'), '# hand-edited final\n', 'utf8');
  writeFileSync(join(vault, 'Reviews', '2026-cycle2-manager.md'), '# hand-edited manager\n', 'utf8');
  const f = fixture('f2.txt', 'new final text');
  const r = runReview(['record', '--self', '--cycle', '2026-cycle2', f]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
  assert.match(r.stderr, /--force/);
  assert.match(readFileSync(join(vault, 'Reviews', '2026-cycle2-final.md'), 'utf8'), /hand-edited final/);     // untouched
  assert.match(readFileSync(join(vault, 'Reviews', '2026-cycle2-manager.md'), 'utf8'), /hand-edited manager/); // sibling untouched
});

// D-02 — --force overwrites only the targeted artifact file (file-scoped idempotency)
test('--force overwrites only the targeted artifact file (D-02)', () => {
  writeFileSync(join(vault, 'Reviews', '2026-cycle3-final.md'), '# old final\n', 'utf8');
  writeFileSync(join(vault, 'Reviews', '2026-cycle3-manager.md'), '# kept manager\n', 'utf8');
  const f = fixture('f3.txt', 'fresh final text');
  const r = runReview(['record', '--self', '--cycle', '2026-cycle3', '--force', f]);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const finalBody = readFileSync(join(vault, 'Reviews', '2026-cycle3-final.md'), 'utf8');
  assert.match(finalBody, /fresh final text/);
  assert.ok(!finalBody.includes('old final'));
  assert.match(readFileSync(join(vault, 'Reviews', '2026-cycle3-manager.md'), 'utf8'), /kept manager/);  // sibling untouched
});

// D-07 — --manager --no-extract writes an empty stub without invoking claude
test('--manager --no-extract writes an empty Feedback Items stub without invoking claude (D-07)', () => {
  const f = fixture('mgr2.txt', 'Some manager prose.');
  const r = runReview(['record', '--manager', '--no-extract', '--cycle', '2026-cycle1', '--force', f]);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const body = readFileSync(join(vault, 'Reviews', '2026-cycle1-manager.md'), 'utf8');
  assert.match(body, /## Feedback Items/);
  assert.ok(!/^- \*\*FB-\d+\*\*:/m.test(body));       // no actual FB items in empty stub
});

// Mutual-exclusion / required-flag validation
test('record requires exactly one of --self/--manager', () => {
  const f = fixture('m.txt', 'x');
  const none = runReview(['record', '--cycle', '2026-cycle1', f]);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /exactly one of --self or --manager/);
  const both = runReview(['record', '--self', '--manager', '--cycle', '2026-cycle1', f]);
  assert.equal(both.status, 1);
  assert.match(both.stderr, /exactly one of --self or --manager/);
});

// RCAP-05 — review status reports absent with exit 0 when no artifacts exist
test('review status reports absent with exit 0 when nothing captured (RCAP-05)', () => {
  const r = runReview(['status', '--cycle', '2025-cycle1']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);   // no error on absence
  assert.match(r.stdout, /Review status for 2025-cycle1:/);
  assert.match(r.stdout, /generated draft: absent/);
  assert.match(r.stdout, /final:\s+absent/);
  assert.match(r.stdout, /manager:\s+absent/);
  assert.match(r.stdout, /feedback items:\s+absent/);
});

// RCAP-05 — review status reports present + counts feedback items
test('review status reports present + feedback-item count (RCAP-05)', () => {
  writeFileSync(join(vault, 'Reviews', '2024-cycle1-final.md'), '# Final\n\nbody\n', 'utf8');
  writeFileSync(
    join(vault, 'Reviews', '2024-cycle1-manager.md'),
    '# Manager Review — 2024-cycle1\n\nprose\n\n## Feedback Items\n\n_note_\n\n- **FB-1**: a\n- **FB-2**: b\n',
    'utf8',
  );
  const r = runReview(['status', '--cycle', '2024-cycle1']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /final:\s+present/);
  assert.match(r.stdout, /manager:\s+present/);
  assert.match(r.stdout, /feedback items:\s+2 item\(s\)/);
});

// D-04 — stdin source ('-')
test('review record --self - reads from stdin (D-04)', () => {
  const r = runReview(['record', '--self', '--cycle', '2023-cycle1', '-'], { input: 'piped final review' });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(readFileSync(join(vault, 'Reviews', '2023-cycle1-final.md'), 'utf8'), /piped final review/);
});

// Unit test — parseFeedbackItems round-trip (no harness, import directly)
test('parseFeedbackItems extracts ID/text pairs and stops at the next heading', () => {
  const items = parseFeedbackItems(
    '## Feedback Items\n\n_n_\n\n- **FB-1**: alpha\n- **FB-2**: beta\n\n## Other\n- **FB-3**: ignored',
  );
  assert.deepEqual(items, [{ id: 'FB-1', text: 'alpha' }, { id: 'FB-2', text: 'beta' }]);
  assert.deepEqual(parseFeedbackItems('no section here'), []);
});

// CR-01 regression — the deterministic counter must not be steerable by the verbatim
// manager text. parseFeedbackItems binds to the sentinel-delimited section the writer
// emits last, so a "## Feedback Items" heading + fake FB bullets embedded in the review
// prose ABOVE it are ignored.
test('parseFeedbackItems ignores feedback markup embedded in the manager review text (CR-01)', () => {
  const START = '<!-- feedback-items:start -->';
  const END = '<!-- feedback-items:end -->';
  const body = [
    '# Manager Review — 2026-cycle1',
    '',
    'Great work this cycle. The manager even pasted a markdown section:',
    '',
    '## Feedback Items',
    '- **FB-1**: INJECTED malicious item',
    '- **FB-2**: INJECTED second',
    '',
    START,
    '## Feedback Items',
    '',
    '_note_',
    '',
    '- **FB-1**: the real, code-written item',
    '',
    END,
    '',
  ].join('\n');
  assert.deepEqual(parseFeedbackItems(body), [{ id: 'FB-1', text: 'the real, code-written item' }]);
});

// CR-01 regression (integration) — an injected Feedback Items block in the verbatim
// manager review must not inflate `review status`. With --no-extract the real section
// is an empty stub, so the count is 0 regardless of the injected bullets.
test('review status is not spoofed by injected feedback markup in the manager text (CR-01)', () => {
  const injected = [
    'Solid cycle overall.',
    '',
    '## Feedback Items',
    '- **FB-1**: INJECTED',
    '- **FB-2**: INJECTED',
  ].join('\n');
  const f = fixture('mgr-injected.txt', injected);
  const rec = runReview(['record', '--manager', '--no-extract', '--cycle', '2022-cycle1', f]);
  assert.equal(rec.status, 0, `stderr: ${rec.stderr}`);
  const st = runReview(['status', '--cycle', '2022-cycle1']);
  assert.equal(st.status, 0, `stderr: ${st.stderr}`);
  assert.match(st.stdout, /manager:\s+present/);
  assert.match(st.stdout, /feedback items:\s+0 item\(s\)/);  // injected bullets NOT counted
});
