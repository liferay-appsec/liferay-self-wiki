import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { claudeHeadless } from '../src/core/claude.js';

// A fake `claude` on PATH echoes its argv and stdin byte-length on stdout, so
// these tests assert how claudeHeadless spawns the CLI without a real model call.

let binDir, origPath;

before(() => {
  binDir = mkdtempSync(join(tmpdir(), 'self-wiki-fakeclaude-'));
  const shim = `#!/usr/bin/env node
let stdin = '';
process.stdin.on('data', (c) => { stdin += c; });
process.stdin.on('end', () => {
  process.stdout.write('ARGS:' + process.argv.slice(2).join(' ') + '\\n');
  process.stdout.write('STDIN_LEN:' + Buffer.byteLength(stdin) + '\\n');
});
`;
  const p = join(binDir, 'claude');
  writeFileSync(p, shim, 'utf8');
  chmodSync(p, 0o755);
  origPath = process.env.PATH;
  process.env.PATH = binDir + ':' + origPath;
});

after(() => {
  process.env.PATH = origPath;
  rmSync(binDir, { recursive: true, force: true });
});

test('claudeHeadless pins --permission-mode so it never inherits plan mode', async () => {
  const out = await claudeHeadless('synthesize this week');
  assert.match(out, /--permission-mode default/);
});

test('claudeHeadless honors an explicit opts.permissionMode override', async () => {
  const out = await claudeHeadless('x', { permissionMode: 'acceptEdits' });
  assert.match(out, /--permission-mode acceptEdits/);
});

test('claudeHeadless pipes the prompt to the child via stdin', async () => {
  const out = await claudeHeadless('a non-empty prompt');
  const m = out.match(/STDIN_LEN:(\d+)/);
  assert.ok(m, `expected STDIN_LEN line, got: ${out}`);
  assert.ok(Number(m[1]) > 0, 'prompt should be piped to stdin');
});

test('claudeHeadless forwards --model when opts.model is set', async () => {
  const out = await claudeHeadless('x', { model: 'claude-opus-4-8' });
  assert.match(out, /--model claude-opus-4-8/);
});
