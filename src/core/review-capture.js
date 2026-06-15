import { readFile, writeFile, access } from 'fs/promises';
import { dirname, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { resolveReviewWindow, ensureReviewsDir } from './reviews.js';
import { readVaultConfig } from './config.js';
import { hasClaudeCli, claudeHeadless } from './claude.js';
import { getReviewFinalFilePath, getReviewManagerFilePath, getVaultPath, ensureParentDir } from '../utils/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDBACK_PROMPT_PATH = resolvePath(__dirname, '..', 'templates', 'prompts', 'feedback-extract.md');

function todayISO(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

// Sentinel comments delimit the authoritative, code-written Feedback Items
// section inside <cycle>-manager.md (logger/topics sentinel discipline).
const FEEDBACK_START = '<!-- feedback-items:start -->';
const FEEDBACK_END = '<!-- feedback-items:end -->';

export function parseFeedbackItems(body) {
  const text = typeof body === 'string' ? body : '';
  // Bind to the LAST start sentinel: the verbatim manager review is written
  // ABOVE this section, so review prose that happens to contain a "## Feedback
  // Items" heading or "- **FB-N**:" bullets can never spoof the code-counted
  // total. parseFeedbackItems is the deterministic counter — it must not be
  // steerable by untrusted input (CR-01).
  let region;
  const startPos = text.lastIndexOf(FEEDBACK_START);
  if (startPos !== -1) {
    const after = text.slice(startPos + FEEDBACK_START.length);
    const endPos = after.indexOf(FEEDBACK_END);
    region = endPos === -1 ? after : after.slice(0, endPos);
  } else {
    // Fallback for a hand-edited file whose sentinels were removed: bind to the
    // LAST "## Feedback Items" heading (the writer always emits it last), then
    // stop at the next heading.
    const lines = text.split('\n');
    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^## Feedback Items\b/.test(lines[i])) startIdx = i;
    }
    if (startIdx === -1) return [];
    const collected = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) break;
      collected.push(lines[i]);
    }
    region = collected.join('\n');
  }
  const items = [];
  for (const line of region.split('\n')) {
    const m = line.match(/^- \*\*(FB-\d+)\*\*: (.+)$/);
    if (m) items.push({ id: m[1], text: m[2].trim() });
  }
  return items;
}

async function resolveWindow(opts) {
  const cfg = await readVaultConfig();
  return resolveReviewWindow({
    cycle: opts.cycle,
    lastCycle: opts.lastCycle,
    today: todayISO(),
    vaultConfig: cfg,
  });
}

export async function readReviewInput(source) {
  if (source === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  return (await readFile(source, 'utf8')).trim();
}

async function guardedWrite(outPath, body, force) {
  await ensureReviewsDir(getVaultPath());
  await ensureParentDir(outPath);
  let exists = false;
  try { await access(outPath); exists = true; } catch { /* fresh */ }
  if (exists && !force) {
    process.stderr.write(`error: ${outPath} already exists. Use --force to overwrite (your edits will be lost; recover via 'git restore ${outPath}' if needed).\n`);
    process.exit(1);
  }
  try {
    await writeFile(outPath, body, { flag: force ? 'w' : 'wx', encoding: 'utf8' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      process.stderr.write(`error: ${outPath} already exists (raced with a concurrent writer). Use --force to overwrite (your edits will be lost; recover via 'git restore ${outPath}' if needed).\n`);
      process.exit(1);
    }
    throw err;
  }
  process.stdout.write(`wrote ${outPath}\n`);
}

export async function recordFinalReview(opts) {
  const window = await resolveWindow(opts);
  const text = await readReviewInput(opts.source);
  const outPath = getReviewFinalFilePath(window.cycleName);
  const body = `# Final Submitted Self-Review — ${window.cycleName}\n\n${text}\n`;
  await guardedWrite(outPath, body, opts.force === true);
}

async function extractFeedbackPoints(text) {
  try {
    const promptHeader = await readFile(FEEDBACK_PROMPT_PATH, 'utf8');
    const prompt = `${promptHeader}\n${text}\n--- END MANAGER REVIEW ---\n`;
    const out = await claudeHeadless(prompt);
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter((l) => l.length > 0 && l !== '(no discrete feedback points found)');
  } catch (err) {
    process.stderr.write(`warn: feedback extraction failed (${err.message}); leaving an empty ## Feedback Items stub. Edit it manually.\n`);
    return [];
  }
}

function buildFeedbackSection(points, meta) {
  const note = meta.reason === 'no-extract'
    ? '_AI extraction skipped (--no-extract). Add items below as `- **FB-N**: ...` bullets; editing here is the confirmation._'
    : meta.reason === 'no-claude'
      ? '_AI extraction unavailable (claude CLI not found). Add items below as `- **FB-N**: ...` bullets; editing here is the confirmation._'
      : '_AI-extracted from the manager review above; verbatim-faithful and editable. Editing this list in place IS the confirmation — re-run `review record --manager --force` to re-extract (overwrites edits)._';
  const lines = [FEEDBACK_START, `## Feedback Items`, '', note, ''];
  if (points.length === 0) {
    lines.push('<!-- no items: edit this section to add - **FB-1**: ... bullets -->');
  } else {
    points.forEach((p, i) => lines.push(`- **FB-${i + 1}**: ${p}`));
  }
  lines.push('', FEEDBACK_END);
  return lines.join('\n');
}

export async function recordManagerReview(opts) {
  const window = await resolveWindow(opts);
  const text = await readReviewInput(opts.source);
  const outPath = getReviewManagerFilePath(window.cycleName);

  let feedbackSection;
  if (opts.noExtract) {
    feedbackSection = buildFeedbackSection([], { reason: 'no-extract' });
  } else if (!(await hasClaudeCli())) {
    process.stderr.write('warn: `claude` CLI not found on PATH; skipping feedback extraction. Edit the ## Feedback Items section manually (re-run with --force after installing claude to auto-extract).\n');
    feedbackSection = buildFeedbackSection([], { reason: 'no-claude' });
  } else {
    const points = await extractFeedbackPoints(text);
    feedbackSection = buildFeedbackSection(points, { reason: 'extracted' });
  }

  const body = `# Manager Review — ${window.cycleName}\n\n${text}\n\n${feedbackSection}\n`;
  await guardedWrite(outPath, body, opts.force === true);
}
