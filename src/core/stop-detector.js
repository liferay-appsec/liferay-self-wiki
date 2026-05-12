import { readFile } from 'fs/promises';
import { looksLikeClosingSummary } from './closing-tells.js';

// Returns a defensive default on any error so the Stop hook never fails.
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
  // Walk backward until we hit a real user prompt — the boundary of the
  // most recent user→assistant turn.
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
    if (window.length > 400) break;
  }
  return window;
}

function isRealUserPrompt(entry) {
  // A user message of pure tool_result blocks is a tool reply, not a prompt.
  if (entry?.type !== 'user') return false;
  const content = entry?.message?.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b?.type !== 'tool_result');
}
