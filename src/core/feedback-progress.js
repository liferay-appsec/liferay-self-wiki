import { readFile } from 'fs/promises';
import { dirname, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { resolveCycle } from './cycles.js';
import { parseFeedbackItems } from './review-capture.js';
import { getReviewManagerFilePath } from '../utils/paths.js';
import { hasClaudeCli, claudeHeadless } from './claude.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSESSMENT_PROMPT_PATH = resolvePath(
  __dirname,
  '..',
  'templates',
  'prompts',
  'progress-assessment.md',
);

// Maximum number of older cycles to inspect when walking backward.
// Bounded to prevent runaway I/O on vaults with many cycles.
const MAX_WALK = 4;

// The literal heading for the block (D-03: distinct from ## Review feedback addressed).
const BLOCK_HEADING = '## Progress vs. review feedback';

// The literal fallback phrase when the period shows no work on an item (D-05).
const NO_ACTIVITY_FALLBACK = 'No activity noted this period.';

/**
 * Walk backward from resolveCycle(periodDateStr).previous and return the first
 * completed cycle (cycle.end strictly < periodDateStr) whose manager file exists
 * AND whose parseFeedbackItems returns ≥1 item.
 *
 * Implements D-01 (completed-cycle guard), D-02 (walk past absent/empty files),
 * and RRPT-04 (returns null when nothing qualifies).
 *
 * @param {string} periodDateStr  ISO date string of the report period (e.g. '2026-04-15')
 * @param {object} cfg            Vault config shape { review: { cycleEndMonths: number[] } }
 * @returns {Promise<{ cycleName: string, items: Array<{id: string, text: string}> } | null>}
 */
export async function resolveApplicableFeedbackCycle(periodDateStr, cfg) {
  const cycleEndMonths = cfg?.review?.cycleEndMonths ?? [5, 9, 12];
  let probe = periodDateStr;
  let body;
  for (let i = 0; i < MAX_WALK; i++) {
    let previous;
    try {
      ({ previous } = resolveCycle(probe, cycleEndMonths));
    } catch {
      // Malformed cycleEndMonths in the hand-editable vault config (empty,
      // unsorted, out-of-range, wrong type) makes resolveCycle throw. Soft-degrade
      // (CLAUDE.md rule): omit the optional block rather than aborting the whole
      // report. Treated the same as "no applicable cycle" (CR-01).
      return null;
    }
    // D-01: only consider cycles whose end is strictly before the period date.
    // This guards against surfacing the current (in-progress) cycle.
    if (previous.end >= periodDateStr) break;
    try {
      body = await readFile(getReviewManagerFilePath(previous.name), 'utf8');
    } catch {
      // File absent — this cycle has no manager review; step one cycle further back.
      probe = previous.start;
      continue;
    }
    const items = parseFeedbackItems(body);
    if (items.length > 0) return { cycleName: previous.name, items };
    // Manager file exists but has zero items — step further back.
    probe = previous.start;
  }
  return null; // RRPT-04: no completed cycle with feedback found within the walk bound
}

/**
 * Render the "Progress vs. review feedback" markdown block deterministically.
 *
 * The `- **FB-N**: <verbatim text>` lines are constructed directly from the
 * parsed items — never from model output (RRPT-03). The assessment prose
 * (or the fallback) is stitched beneath each item by code.
 *
 * @param {Array<{id: string, text: string}>} items      Parsed feedback items
 * @param {Map<string, string>}               assessments Map from FB-N id to assessment prose
 * @returns {string}  Full markdown block starting with BLOCK_HEADING
 */
export function renderProgressBlock(items, assessments) {
  const lines = [BLOCK_HEADING, ''];
  for (const { id, text } of items) {
    // Verbatim line — code-rendered from parseFeedbackItems output (RRPT-03).
    lines.push(`- **${id}**: ${text}`);
    // Assessment prose — from the model (via assessments Map) or the literal fallback (D-05).
    lines.push(`  ${assessments.get(id) || NO_ACTIVITY_FALLBACK}`);
  }
  return lines.join('\n');
}

/**
 * Parse the model's assessment-synthesis output into a Map keyed by FB-N id.
 *
 * The model is instructed (progress-assessment.md) to emit one line per item
 * in the form `FB-N: <assessment prose>`. Lines that do not match that pattern
 * are ignored (robust to preamble or trailing commentary).
 *
 * @param {string} raw  Raw stdout from the claude -p call
 * @returns {Map<string, string>}
 */
export function parseAssessments(raw) {
  const map = new Map();
  for (const line of (raw || '').split('\n')) {
    const m = line.match(/^(FB-\d+):\s*(.+)$/);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

/**
 * Produce the per-item assessment Map via a focused `claude -p` call.
 *
 * Soft-degrade discipline: if the claude CLI is absent, or the call throws
 * for any reason, return an empty Map. The caller (renderProgressBlock) will
 * apply the "No activity noted this period." fallback to every item, so the
 * verbatim block still renders — the report never fails due to a missing CLI.
 *
 * @param {{ items: Array<{id: string, text: string}>, corpusLabel: string, corpusBlock: string }} opts
 * @returns {Promise<Map<string, string>>}
 */
export async function synthesizeFeedbackAssessments({ items, corpusLabel, corpusBlock }) {
  if (!(await hasClaudeCli())) {
    return new Map(); // soft-degrade — verbatim items still render with fallback assessments
  }
  try {
    const promptHeader = await readFile(ASSESSMENT_PROMPT_PATH, 'utf8');
    const feedbackItemsBlock = items.map(({ id, text }) => `- ${id}: ${text}`).join('\n');
    const prompt = [
      promptHeader,
      '',
      `FEEDBACK_ITEMS:`,
      feedbackItemsBlock,
      '',
      `PERIOD: ${corpusLabel}`,
      '',
      `EVIDENCE:`,
      corpusBlock,
    ].join('\n');
    const out = await claudeHeadless(prompt);
    return parseAssessments(out);
  } catch {
    // Any failure (timeout, nonzero exit, file-read error) degrades to empty Map.
    return new Map();
  }
}

/**
 * Single entry point for Plan 02 to call.
 *
 * Resolves the applicable feedback cycle, synthesizes per-item assessments
 * (with soft-degrade), and renders the deterministic block. Returns null
 * when no completed cycle with feedback applies (RRPT-04 — caller omits block).
 *
 * @param {string} periodDateStr  ISO date of the report period
 * @param {object} cfg            Vault config
 * @param {{ corpusLabel: string, corpusBlock: string, hasEvidence?: boolean }} evidence
 *        Period corpus for assessment. `hasEvidence` (default true) is false when the
 *        period has no real corpus (no dailies / no weeklies+topic pages) — in that case
 *        the model call is skipped and every item gets the deterministic fallback (WR-02).
 * @returns {Promise<{ cycleName: string, block: string } | null>}
 */
export async function buildProgressFeedbackBlock(periodDateStr, cfg, { corpusLabel, corpusBlock, hasEvidence = true }) {
  const feedbackCycle = await resolveApplicableFeedbackCycle(periodDateStr, cfg);
  if (!feedbackCycle) return null; // RRPT-04: caller omits the block
  // No evidence in the period → skip the claude -p round-trip and render the
  // "No activity noted this period." fallback for every item deterministically (WR-02).
  const assessments = hasEvidence
    ? await synthesizeFeedbackAssessments({
        items: feedbackCycle.items,
        corpusLabel,
        corpusBlock,
      })
    : new Map();
  return {
    cycleName: feedbackCycle.cycleName,
    block: renderProgressBlock(feedbackCycle.items, assessments),
  };
}
