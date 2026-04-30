import { readFile } from 'fs/promises';
import { looksLikeClosingSummary } from './closing-tells.js';

// Inspect the most recent turn of a Claude Code transcript JSONL file and report
// whether the just-finished assistant turn looks like a closing summary AND no
// `self-wiki note` Bash call was issued during that turn.
//
// Robust against partial/corrupt transcripts; returns a defensive default on
// any error so the Stop hook never fails.
export async function inspectTranscript(transcriptPath) {
  const empty = { closingTellDetected: false, noteAdded: false, lastTextSnippet: '', leafUuid: '' };
  if (!transcriptPath || typeof transcriptPath !== 'string') return empty;

  let raw;
  try {
    raw = await readFile(transcriptPath, 'utf8');
  } catch {
    return empty;
  }

  const lines = raw.split('\n').filter(Boolean);
  if (lines.length === 0) return empty;

  // Walk backward to find the boundary of the most recent assistant turn.
  // The "turn" starts at the most recent user message (a real prompt, not a
  // tool_result) and ends at the latest assistant message.
  const turn = collectLastTurn(lines);
  if (!turn || turn.length === 0) return empty;

  let assistantText = '';
  let noteAdded = false;
  let leafUuid = '';

  for (const entry of turn) {
    if (entry?.message?.role !== 'assistant') continue;
    if (typeof entry?.uuid === 'string' && entry.uuid) leafUuid = entry.uuid;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        assistantText += (assistantText ? '\n' : '') + block.text;
      } else if (block?.type === 'tool_use' && block?.name === 'Bash') {
        const cmd = block?.input?.command;
        if (typeof cmd === 'string' && /\bself-wiki\s+note\b/.test(cmd)) {
          noteAdded = true;
        }
      }
    }
  }

  const closingTellDetected = looksLikeClosingSummary(assistantText);
  const lastTextSnippet = assistantText.trim().slice(-240);

  return { closingTellDetected, noteAdded, lastTextSnippet, leafUuid };
}

function collectLastTurn(lines) {
  // Parse from end backward, collect entries belonging to the most recent
  // user→assistant turn. We stop when we hit a real user prompt (a user
  // message that does NOT contain only tool_result blocks).
  const window = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    window.unshift(entry);
    if (isRealUserPrompt(entry)) break;
    if (window.length > 400) break; // safety bound
  }
  return window;
}

function isRealUserPrompt(entry) {
  if (entry?.type !== 'user') return false;
  const content = entry?.message?.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  // A user message of pure tool_result blocks is just a tool reply, not a prompt.
  return content.some((b) => b?.type !== 'tool_result');
}
