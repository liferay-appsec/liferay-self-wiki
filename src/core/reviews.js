// src/core/reviews.js — owner of the <vault>/Reviews/ filesystem region.
//
// Phase 1 ships only the idempotent mkdir helper so Phase 3's self-review
// writer has a home to grow into. Per CONTEXT.md D-10, ensureReviewsDir takes
// vaultPath as an explicit parameter rather than calling getVaultPath() —
// this keeps the helper unit-testable without setting up module-level state
// (paths.js#activeVaultPath) and lets Phase 3's command call it from any
// context once the vaultPath is known.
//
// No other module may write to <vault>/Reviews/<*>.md. Phase 3 grows this
// module; downstream agents must extend it here, not in topics.js or logger.js.
//
// Phase 3 wave 3 (plan 03-04) adds the four pure-ish building blocks the
// orchestrator (plan 03-05) composes:
//   - resolveReviewWindow   — REVIEW-02 precedence + D-01 + D-04
//   - loadPriorCycleReview  — D-12 (manual override wins; auto-detects Q3)
//   - loadInCycleTopicPages — REVIEW-05 + D-08 (in-cycle topic-page walk)
//   - buildSelfReviewPrompt — REVIEW-06 + D-08 + D-13 (prompt envelope)
// plus SELF_REVIEW_PROMPT_PATH alongside MONTHLY_PROMPT_PATH / WEEKLY_PROMPT_PATH.

import { mkdir } from 'fs/promises';
import { join } from 'path';
import { resolveCycle } from './cycles.js';
import { getReviewFilePath } from '../utils/paths.js';

export async function ensureReviewsDir(vaultPath) {
  await mkdir(join(vaultPath, 'Reviews'), { recursive: true });
}

// ---------- Prompt path constant (consumed by buildSelfReviewPrompt below) ----------

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SELF_REVIEW_PROMPT_PATH = resolve(
  __dirname, '..', 'templates', 'prompts', 'self-review.md',
);

// ---------- Window resolution (REVIEW-02 + D-01 + D-04) ----------

function todayISO(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function parseCycleName(cycleName, cycleEndMonths) {
  const m = typeof cycleName === 'string' ? cycleName.match(/^(\d{4})-cycle(\d+)$/) : null;
  if (!m) throw new Error(`invalid --cycle value: ${cycleName}`);
  const year = parseInt(m[1], 10);
  const ordinal = parseInt(m[2], 10);
  if (ordinal < 1 || ordinal > cycleEndMonths.length) {
    throw new Error(`invalid --cycle value: ${cycleName}`);
  }
  // Derive the cycle by asking resolveCycle for a date guaranteed to be inside.
  // We need a date whose resolved-cycle.name === cycleName. The end-of-cycle-month
  // matching cycleName's ordinal is a good probe: pick the 15th of
  // cycleEndMonths[ordinal - 1] in `year`. For cycles whose review-month is NOT
  // the last entry, the cycle ends in month-before-review-month so we need a
  // probe in the prior month; pick the 15th of (cycleEndMonths[ordinal - 1] - 1)
  // for non-last cycles, or the 15th of cycleEndMonths[ordinal - 1] for the
  // last cycle (which ends Dec 31 under Option B).
  const k = cycleEndMonths.length;
  const isLast = ordinal === k - 0; // 1-indexed: last when ordinal === k
  // For last cycle: end-month is December (12); probe Dec 15 of year.
  // For other cycles: end-month is cycleEndMonths[ordinal-1] - 1 (under Option B);
  //   probe the 15th of that end-month.
  const probeMonth = isLast ? 12 : cycleEndMonths[ordinal - 1] - 1;
  const probe = new Date(Date.UTC(year, probeMonth - 1, 15));
  const r = resolveCycle(probe, cycleEndMonths);
  // If resolveCycle's name disagrees, the cycleEndMonths config doesn't match
  // the requested cycleName — treat as invalid input. (Defensive — D-PREREQ
  // semantics make a mismatch unlikely once cycleEndMonths is validated, but
  // guard regardless.)
  if (r.current.name !== cycleName) {
    throw new Error(`invalid --cycle value: ${cycleName} (does not match cycleEndMonths=${JSON.stringify(cycleEndMonths)})`);
  }
  return r.current;
}

function findEnclosingCycle(sinceISO, cycleEndMonths) {
  // Snap --since to the cycle whose [start, end] contains sinceISO.
  // resolveCycle returns the cycle "for the date" — so calling it with
  // sinceISO directly gives us the enclosing cycle as `.current`.
  const r = resolveCycle(sinceISO, cycleEndMonths);
  return r.current;
}

/**
 * Resolve the review window per REVIEW-02 precedence + D-01 + D-04.
 *
 * Precedence (highest first):
 *   1. args.cycle     — explicit cycle name (e.g. "2026-cycle1")
 *   2. args.lastCycle — most recently completed cycle (resolveCycle.previous)
 *   3. args.since     — clamp start to this ISO date; snap cycleName to enclosing cycle
 *   4. vaultConfig.review.lastReviewedAt — implicit --since
 *   5. D-01 default   — most-recently-ENDED of {current, previous}, preferring current
 *
 * @param {object} args
 * @param {string}  [args.since]      - ISO YYYY-MM-DD; pins the start date
 * @param {string}  [args.cycle]      - Explicit cycle name e.g. "2026-cycle1"
 * @param {boolean} [args.lastCycle]  - Use most recently completed cycle
 * @param {string}  [args.today]      - ISO YYYY-MM-DD (override for tests; defaults to UTC today)
 * @param {object}  args.vaultConfig  - readVaultConfig() result; must have review.cycleEndMonths
 * @returns {{ cycleName: string, start: string, end: string, partialNote: string|null }}
 */
export function resolveReviewWindow(args) {
  const today = args.today || todayISO();
  const cem = args.vaultConfig?.review?.cycleEndMonths;
  if (!Array.isArray(cem) || cem.length === 0) {
    throw new Error('vault config missing review.cycleEndMonths — run `self-wiki init` or check vault config');
  }

  // 1. Explicit --cycle wins.
  if (args.cycle) {
    const c = parseCycleName(args.cycle, cem);
    return { cycleName: c.name, start: c.start, end: c.end, partialNote: null };
  }

  // 2. --last-cycle: most recently completed cycle.
  if (args.lastCycle) {
    const r = resolveCycle(today, cem);
    return { cycleName: r.previous.name, start: r.previous.start, end: r.previous.end, partialNote: null };
  }

  // 3. --since (explicit user override of the start date).
  if (args.since) {
    const enc = findEnclosingCycle(args.since, cem);
    // partialNote when --since does not fall on the enclosing cycle's exact start.
    // Note: "manual override wins" comment lives in loadPriorCycleReview; this
    // function's partialNote field carries the D-04 snap message.
    const partialNote = args.since !== enc.start
      ? `Custom window ${args.since} → ${enc.end}; report covers a partial slice of ${enc.name}.`
      : null;
    return { cycleName: enc.name, start: args.since, end: enc.end, partialNote };
  }

  // 4. vault config lastReviewedAt as implicit --since.
  const last = args.vaultConfig?.review?.lastReviewedAt;
  if (last) {
    const enc = findEnclosingCycle(last, cem);
    const partialNote = last !== enc.start
      ? `Custom window ${last} → ${enc.end} (since last review); report covers a partial slice of ${enc.name}.`
      : null;
    return { cycleName: enc.name, start: last, end: enc.end, partialNote };
  }

  // 5. D-01 bare default: most recently completed cycle.
  // Pick whichever of .current or .previous has end ≤ today.
  // Prefer .current when both have ended (i.e. when today is past current.end).
  const r = resolveCycle(today, cem);
  const chosen = r.current.end <= today ? r.current : r.previous;
  return { cycleName: chosen.name, start: chosen.start, end: chosen.end, partialNote: null };
}

// ---------- Prior-review continuity (D-12) ----------

function priorCycleNameOf(cycleName, cycleEndMonths) {
  // Use resolveCycle on a probe date inside the cycle to get its .previous.
  const c = parseCycleName(cycleName, cycleEndMonths);
  // c.start is ISO; resolveCycle on c.start returns a result whose .previous
  // is the prior cycle (since c.start IS in cycle c, .current === c, .previous = the one before).
  const r = resolveCycle(c.start, cycleEndMonths);
  return r.previous.name;
}

function extractQ3(body) {
  // The self-review prompt mandates the literal heading
  //   `## 3. What is your current area of focus as you "Grow & Get Better"...`
  // Anchor on `^## 3.` to be tolerant of minor wording drift.
  const lines = body.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## 3\b/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n').trim();
}

/**
 * Load the prior cycle's review for continuity (D-12). Manual override
 * always wins over auto-detect: if `manualPath` is provided, never look for
 * the auto-detected file.
 *
 * @param {object} args
 * @param {string} args.cycleName       - Current cycle name (e.g. "2026-cycle1")
 * @param {string} [args.manualPath]    - User-supplied --prior-review path (raw string)
 * @param {number[]} args.cycleEndMonths
 * @returns {Promise<null
 *   | { kind: 'manual', path: string, body: string }
 *   | { kind: 'autoQ3', path: string, body: string, priorCycleName: string }>}
 */
export async function loadPriorCycleReview(args) {
  // Manual override wins on collision (D-12).
  if (args.manualPath) {
    try {
      const body = await readFile(args.manualPath, 'utf8');
      return { kind: 'manual', path: args.manualPath, body: body.trim() };
    } catch {
      // Soft-fail per D-12.
      return null;
    }
  }
  // Auto-detect: compute prior cycle name; read Reviews/<priorName>.md if present.
  let priorName;
  try {
    priorName = priorCycleNameOf(args.cycleName, args.cycleEndMonths);
  } catch {
    return null;
  }
  const path = getReviewFilePath(priorName);
  let body;
  try {
    body = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  const q3 = extractQ3(body);
  return { kind: 'autoQ3', path, body: q3, priorCycleName: priorName };
}
