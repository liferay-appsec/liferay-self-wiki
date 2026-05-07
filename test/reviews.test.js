import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureReviewsDir } from '../src/core/reviews.js';

let tmp;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-reviews-'));
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('ensureReviewsDir creates Reviews/ in a fresh vault', async () => {
  const vault = join(tmp, 'fresh');
  mkdirSync(vault, { recursive: true });
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});

test('ensureReviewsDir succeeds when Reviews/ already exists (idempotent)', async () => {
  const vault = join(tmp, 'pre-existing');
  mkdirSync(join(vault, 'Reviews'), { recursive: true });
  // Should not throw.
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});

test('ensureReviewsDir is safe on repeated calls (double invocation)', async () => {
  const vault = join(tmp, 'double-call');
  mkdirSync(vault, { recursive: true });
  await ensureReviewsDir(vault);
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});

test('ensureReviewsDir creates intermediate parents (recursive mkdir)', async () => {
  const vault = join(tmp, 'deep', 'nested', 'vault');
  // Deliberately do NOT pre-create the parent — recursive: true should handle it.
  await ensureReviewsDir(vault);
  assert.ok(statSync(join(vault, 'Reviews')).isDirectory());
});
