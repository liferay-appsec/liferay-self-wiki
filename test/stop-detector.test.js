import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { inspectTranscript } from '../src/core/stop-detector.js';
import { looksLikeClosingSummary } from '../src/core/closing-tells.js';

let tmp;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'self-wiki-stop-'));
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeJsonl(name, entries) {
  const path = join(tmp, name);
  const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(path, body, 'utf8');
  return path;
}

function userPrompt(text) {
  return { type: 'user', message: { role: 'user', content: text } };
}

function assistantText(text) {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

function assistantWithNote(text, command) {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text },
        { type: 'tool_use', name: 'Bash', input: { command } },
      ],
    },
  };
}

function toolResult(id) {
  return {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
  };
}

test('looksLikeClosingSummary catches "I had finished the implementation"', () => {
  assert.ok(looksLikeClosingSummary('I had finished the implementation. The four planned changes are in place and formatSource passes on all three modules.'));
});

test('looksLikeClosingSummary catches a 3+ bullet wrap-up', () => {
  const text = 'Wrap-up:\n- changed file A\n- updated config B\n- ran the test\n';
  assert.ok(looksLikeClosingSummary(text));
});

test('looksLikeClosingSummary catches "PR #2800 opened"', () => {
  assert.ok(looksLikeClosingSummary('PR #2800 opened against liferay-appsec.'));
});

test('looksLikeClosingSummary catches "force-pushed"', () => {
  assert.ok(looksLikeClosingSummary('force-pushed to liferay-appsec.'));
});

test('looksLikeClosingSummary is silent on neutral progress messages', () => {
  assert.equal(looksLikeClosingSummary('Looking into the parser issue.'), false);
  assert.equal(looksLikeClosingSummary('Reading the file now.'), false);
});

test('inspectTranscript flags a wrap-up turn with no self-wiki note', async () => {
  const path = writeJsonl('case1.jsonl', [
    userPrompt('previous'),
    assistantText('intermediate response'),
    userPrompt('what next?'),
    assistantText('I had finished the implementation. The four planned changes are in place and `formatSource` passes on all three modules:\n- file A\n- file B\n- file C'),
  ]);
  const result = await inspectTranscript(path);
  assert.equal(result.closingTellDetected, true);
  assert.equal(result.noteAdded, false);
  assert.match(result.lastTextSnippet, /three modules/);
});

test('inspectTranscript clears the flag when a self-wiki note ran in the same turn', async () => {
  const path = writeJsonl('case2.jsonl', [
    userPrompt('what next?'),
    assistantWithNote(
      'PR #2800 opened against liferay-appsec.',
      'self-wiki note "LPD-86317 PR #2800 opened (draft) — playwright + integration tests green"',
    ),
  ]);
  const result = await inspectTranscript(path);
  assert.equal(result.closingTellDetected, true);
  assert.equal(result.noteAdded, true);
});

test('inspectTranscript ignores neutral progress turns', async () => {
  const path = writeJsonl('case3.jsonl', [
    userPrompt('check the parser'),
    assistantText('Reading the file now to understand the structure.'),
  ]);
  const result = await inspectTranscript(path);
  assert.equal(result.closingTellDetected, false);
  assert.equal(result.noteAdded, false);
});

test('inspectTranscript stops at the previous user prompt — earlier turns do not contaminate', async () => {
  const path = writeJsonl('case4.jsonl', [
    userPrompt('first prompt'),
    assistantText('done — all tests pass'), // earlier "tell"
    userPrompt('next prompt'),
    assistantText('investigating the issue'), // current turn — neutral
  ]);
  const result = await inspectTranscript(path);
  assert.equal(result.closingTellDetected, false, 'earlier turn should not leak into current detection');
});

test('inspectTranscript treats tool_result user messages as part of the same turn', async () => {
  const path = writeJsonl('case5.jsonl', [
    userPrompt('do the thing'),
    assistantWithNote('working on it', 'echo not-a-note'),
    toolResult('toolu_x'),
    assistantText('I have finished. PR #5 opened.'),
  ]);
  const result = await inspectTranscript(path);
  assert.equal(result.closingTellDetected, true);
  assert.equal(result.noteAdded, false, 'unrelated Bash command must not count as a note');
});

test('inspectTranscript returns safe defaults on missing/empty files', async () => {
  const r1 = await inspectTranscript('/nonexistent/path.jsonl');
  assert.deepEqual(r1, { closingTellDetected: false, noteAdded: false, lastTextSnippet: '' });

  const empty = writeJsonl('empty.jsonl', []);
  const r2 = await inspectTranscript(empty);
  assert.equal(r2.closingTellDetected, false);
});

test('inspectTranscript is robust to malformed JSON lines', async () => {
  const path = writeJsonl('case6.jsonl', [userPrompt('x'), assistantText('All tests pass.')]);
  // Append a garbage line.
  writeFileSync(path, 'this is not json\n', { flag: 'a' });
  const result = await inspectTranscript(path);
  assert.equal(result.closingTellDetected, true);
});
