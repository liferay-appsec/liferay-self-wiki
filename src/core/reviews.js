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

import { mkdir, readFile, readdir, writeFile, access, open, unlink } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { resolveCycle } from './cycles.js';
import { readVaultConfig, writeVaultConfig } from './config.js';
import { hasClaudeCli, claudeHeadless } from './claude.js';
import { reportMonthOrchestrator } from '../commands/report.js';
import { getReviewFilePath, getReportFilePath, getVaultPath, ensureParentDir } from '../utils/paths.js';
import { monthsInRange, weeksInMonth, datesInMonth } from '../utils/format.js';
import { escapeRegex } from '../utils/regex.js';

export async function ensureReviewsDir(vaultPath) {
  await mkdir(join(vaultPath, 'Reviews'), { recursive: true });
}

// ---------- Prompt path constant (consumed by buildSelfReviewPrompt below) ----------

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

// ---------- In-cycle topic-page loader (D-08 + REVIEW-05) ----------

/**
 * Walk Tickets/ and Components/ in the active vault; return topic pages
 * that contain at least one `^## <date>\b` section header for any date
 * in `dates`. Soft-fails when a directory is missing.
 *
 * Direct analog of `loadInMonthTopicPages` in src/commands/report.js with
 * the `dates` array expanded from in-month to in-cycle (4 months × ~30 days).
 * The regex anchor and the Tickets/Components walk transfer verbatim.
 *
 * @param {string[]} dates  Array of ISO YYYY-MM-DD strings
 * @returns {Promise<Array<{ slug: string, raw: string, kind: 'ticket'|'component' }>>}
 */
export async function loadInCycleTopicPages(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  // Single regex matching any in-cycle date as a `## ` section header start.
  // Anchor on `^## <date>\b` (multiline) so a future formatting tweak of
  // src/core/topics.js#appendDatedSection (`: ` vs ` — `, etc.) does not
  // silently drop topic pages from the synthesis.
  const dateRe = new RegExp(`^## (?:${dates.map(escapeRegex).join('|')})\\b`, 'm');
  const out = [];
  for (const kind of ['Tickets', 'Components']) {
    const dir = join(getVaultPath(), kind);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      continue; // directory missing — fine
    }
    for (const fname of entries) {
      if (!fname.endsWith('.md')) continue;
      const slug = fname.slice(0, -3);
      let raw;
      try {
        raw = await readFile(join(dir, fname), 'utf8');
      } catch {
        continue;
      }
      if (dateRe.test(raw)) {
        out.push({ slug, raw, kind: kind === 'Tickets' ? 'ticket' : 'component' });
      }
    }
  }
  return out;
}

// ---------- Prompt builder (REVIEW-06 + D-08 + D-13) ----------

/**
 * Build the full self-review synthesis prompt envelope.
 *
 * Envelope shape (top-to-bottom):
 *   1. Prompt header (read from SELF_REVIEW_PROMPT_PATH at runtime)
 *   2. `---` separator
 *   3. `CYCLE: <cycleName> (<start> → <end>)`
 *   4. Optional `WINDOW_NOTE:` (concatenates partialNote + missingMonthlyNote)
 *   5. `SOURCES_LINE: <derived>` (REVIEW-09 — always emitted)
 *   6. Optional `METRICS:` block (only when args.metrics provided)
 *   7. `MONTHLIES: (primary — use as the spine)` block
 *   8. `WEEKLIES: (secondary — for detail when monthly is thin)` block
 *   9. `TOPIC_PAGES: (ticket/component ground truth)` block
 *  10. Optional `PRIOR_REVIEW:` (kind==='manual') OR `PRIOR_GROWTH_FOCUS:`
 *      (kind==='autoQ3' AND body non-empty). Manual wins on collision —
 *      loadPriorCycleReview already enforces this, but the conditionals
 *      here defend the invariant defensively so a future caller cannot
 *      inadvertently emit both.
 *
 * Per D-08 the MONTHLIES → WEEKLIES → TOPIC_PAGES ordering is load-bearing
 * (primary spine first, secondary detail, then ground truth); the order is
 * locked by an ordering test in test/reviews.test.js.
 *
 * @param {object} args
 * @param {{cycleName: string, start: string, end: string}}                args.window
 * @param {Array<{ monthStr: string, raw: string }>}                       args.monthlies
 * @param {Array<{ weekStr: string, raw: string }>}                        args.weeklies
 * @param {Array<{ slug: string, raw: string, kind: 'ticket'|'component' }>} args.topicPages
 * @param {null | { kind: 'manual'|'autoQ3', path: string, body: string, priorCycleName?: string }} args.priorReview
 * @param {string|null} [args.partialNote]
 * @param {string|null} [args.missingMonthlyNote]
 * @param {string|null} [args.metrics]
 * @returns {Promise<string>}
 */
export async function buildSelfReviewPrompt(args) {
  const { window, monthlies, weeklies, topicPages, priorReview } = args;
  const promptHeader = await readFile(SELF_REVIEW_PROMPT_PATH, 'utf8');

  // Sources line — file-level granularity per D-13.
  const monthlyParts = monthlies.length > 0
    ? `Monthlies: ${monthlies.map((m) => `\`Reports/${m.monthStr}.md\``).join(', ')}.`
    : 'Monthlies: (none).';
  const weeklyParts = weeklies.length > 0
    ? `Weeklies: ${weeklies.map((w) => `\`Reports/${w.weekStr}.md\``).join(', ')}.`
    : 'Weeklies: (none).';
  const topicParts = topicPages.length > 0
    ? `Topic pages: ${topicPages.map((t) => `\`${t.kind === 'ticket' ? 'Tickets' : 'Components'}/${t.slug}.md\``).join(', ')}.`
    : '';
  const sourcesLine = `Sources: ${[monthlyParts, weeklyParts, topicParts].filter(Boolean).join(' ')}`.trim();

  // Body blocks — preserve role hints in headers per D-08.
  const monthliesBlock = monthlies.length > 0
    ? monthlies.map((m) => `## --- ${m.monthStr} ---\n\n${m.raw.trim()}`).join('\n\n')
    : '(no monthlies for this cycle)';
  const weekliesBlock = weeklies.length > 0
    ? weeklies.map((w) => `## --- ${w.weekStr} ---\n\n${w.raw.trim()}`).join('\n\n')
    : '(no weeklies for this cycle)';
  const topicPagesBlock = topicPages.length > 0
    ? topicPages.map((t) => `## --- ${t.slug} ---\n\n${t.raw.trim()}`).join('\n\n')
    : '(no in-cycle topic pages)';

  const parts = [
    promptHeader,
    '',
    '---',
    '',
    `CYCLE: ${window.cycleName} (${window.start} → ${window.end})`,
  ];

  // WINDOW_NOTE — emit when partial-window OR missing-monthly note present.
  const windowNoteLines = [];
  if (args.partialNote) windowNoteLines.push(args.partialNote);
  if (args.missingMonthlyNote) windowNoteLines.push(args.missingMonthlyNote);
  if (windowNoteLines.length > 0) {
    parts.push('', 'WINDOW_NOTE:', windowNoteLines.join('\n'));
  }

  parts.push('', 'SOURCES_LINE:', sourcesLine);

  if (args.metrics) {
    parts.push('', 'METRICS:', args.metrics);
  }

  parts.push(
    '',
    'MONTHLIES: (primary — use as the spine)',
    monthliesBlock,
    '',
    'WEEKLIES: (secondary — for detail when monthly is thin)',
    weekliesBlock,
    '',
    'TOPIC_PAGES: (ticket/component ground truth)',
    topicPagesBlock,
  );

  // Prior-review block: manual wins on collision (loadPriorCycleReview already
  // enforces this, but defensively double-check here so a future caller cannot
  // inadvertently emit both).
  if (priorReview) {
    if (priorReview.kind === 'manual' && priorReview.body) {
      parts.push('', 'PRIOR_REVIEW:', priorReview.body);
    } else if (priorReview.kind === 'autoQ3' && priorReview.body) {
      parts.push('', `PRIOR_GROWTH_FOCUS (${priorReview.priorCycleName}):`, priorReview.body);
    }
  }

  return parts.join('\n');
}

// ---------- Orchestrator (REVIEW-01 + REVIEW-08 + D-02 + D-03 + D-07) ----------
//
// Slice 1 (plan 03-05) — composes the four building blocks above plus the
// writer. No auto-backfill of missing monthlies yet — that's plan 03-06.
// Per CLAUDE.md "no other module writes to <vault>/Reviews/<*>.md" rule,
// the writer lives here in reviews.js (this module owns the Reviews/ region).

// Resolve a user-supplied --out path against the vault root. Mirrors the
// report.js#resolveOutPath helper. The CLI may legitimately want to dump a
// review draft to /tmp for inspection; warn loudly but do not block.
// WR-06: reject the vault-root sub-case outright — the prefix-startsWith
// check used to fire the "outside the vault" warning for `--out <vaultRoot>`
// (because vaultRoot does not end in `sep`), then return the resolved path,
// and the subsequent writeFile would fail with EISDIR (vaultRoot is a
// directory). Refuse explicitly with a clear error instead.
function resolveOutPath(rawOut, defaultPath) {
  if (!rawOut) return defaultPath;
  const r = resolve(rawOut);
  const vaultRoot = resolve(getVaultPath());
  const vaultPrefix = vaultRoot + sep;
  if (r === vaultRoot) {
    process.stderr.write(`error: --out cannot be the vault root: ${r}\n`);
    process.exit(1);
  }
  if (!r.startsWith(vaultPrefix)) {
    process.stderr.write(`warn: --out path is outside the vault: ${r}\n`);
  }
  return r;
}

// Walk every ISO week that overlaps the cycle window. Reuses weeksInMonth
// by iterating each in-cycle month and concatenating + dedup'ing — a week
// spanning two months (e.g. the Mon-Fri-of-month-end Sat-Sun-of-next-month
// pattern) appears in both months' weeksInMonth result.
function weeksInRange(startISO, endISO) {
  const months = monthsInRange(startISO, endISO);
  const seen = new Set();
  const weeks = [];
  for (const m of months) {
    for (const w of weeksInMonth(m)) {
      if (!seen.has(w)) {
        seen.add(w);
        weeks.push(w);
      }
    }
  }
  return weeks;
}

// List every in-cycle ISO date (YYYY-MM-DD) — bounded by start/end inclusive.
function datesInRange(startISO, endISO) {
  const months = monthsInRange(startISO, endISO);
  const all = [];
  for (const m of months) {
    for (const d of datesInMonth(m)) {
      if (d >= startISO && d <= endISO) all.push(d);
    }
  }
  return all;
}

/**
 * Top-level orchestrator for `self-wiki self-review`.
 *
 * Slice 1 (plan 03-05) — no auto-backfill yet. Slice 2 (plan 03-06)
 * adds the cascade.
 *
 * Flow:
 *   1. Read vault config; resolve window via resolveReviewWindow.
 *   2. Compute outPath (--out overrides default).
 *   3. Refuse-without-force on existing file (D-03). Dry-run skips this.
 *   4. Walk in-cycle months → load Reports/<YYYY-MM>.md (read-only).
 *   5. Walk in-cycle weeks → load Reports/<YYYY-Www>.md (read-only).
 *   6. Walk topic pages via loadInCycleTopicPages(in-cycle-dates).
 *   7. Load prior review via loadPriorCycleReview.
 *   8. Build the prompt envelope via buildSelfReviewPrompt.
 *   9. If --dry-run: print prompt and return (D-07 strict).
 *  10. If !hasClaudeCli: soft-fail to dry-run with stderr notice (REVIEW-08;
 *      DIVERGENT from report.js which exit-2's).
 *  11. Else: claudeHeadless(prompt) → write body to outPath (with regenerated
 *      marker on --force overwrite) → writeVaultConfig({review: {...}}).
 *
 * @param {object} opts  Parsed Commander options:
 *   { since?, cycle?, lastCycle?, priorReview?, dryRun?, force?, out? }
 */
export async function selfReviewOrchestrator(opts = {}) {
  const cfg = await readVaultConfig();
  const cycleEndMonths = cfg.review?.cycleEndMonths ?? [5, 9, 12];

  // 1. Resolve window. resolveReviewWindow may throw for malformed --cycle
  //    values; the command-layer wrapper (src/commands/self-review.js)
  //    catches and surfaces those as exit-1 usage errors.
  const window = resolveReviewWindow({
    since: opts.since,
    cycle: opts.cycle,
    lastCycle: opts.lastCycle,
    today: todayISO(),
    vaultConfig: cfg,
  });

  // 2. Out path (D-13 — --out symmetry with monthly).
  const defaultOut = getReviewFilePath(window.cycleName);
  const outPath = resolveOutPath(opts.out, defaultOut);

  // 3. Refuse-without-force (D-03). Dry-run skips this — there is no write.
  //    ensureReviewsDir is hoisted INTO this block so --dry-run stays
  //    side-effect-free on a fresh vault (WR-03 fix). ensureParentDir at the
  //    actual write site (step 13) still creates the directory in the
  //    real-write path.
  //    Note: this is a fast-path UX check — it refuses BEFORE the
  //    multi-minute cascade so the user does not waste claude calls. The
  //    actual race-safety guarantee comes from the atomic `writeFile` with
  //    flag `'wx'` at step 13 (CR-01 fix); both checks must remain.
  if (!opts.dryRun) {
    await ensureReviewsDir(getVaultPath());
    let exists = false;
    try { await access(outPath); exists = true; } catch { /* fresh */ }
    if (exists && !opts.force) {
      process.stderr.write(
        `error: ${outPath} already exists. Use --force to regenerate (your edits will be lost; recover via 'git restore ${outPath}' if needed).\n`,
      );
      process.exit(1);
    }
  }

  // 3a. Cross-process mutex (WR-01). Acquire a dot-lock at
  //     <vault>/.self-wiki/self-review-<cycleName>.lock for the duration of
  //     the cascade so two concurrent runs cannot interleave the multi-minute
  //     claude synthesis path (a single cascade can spawn ~16 claude -p
  //     invocations, so a duplicate cascade is genuinely expensive AND
  //     produces last-write-wins state on Reviews/<cycle>.md +
  //     writeVaultConfig). The dry-run path takes no lock — it is
  //     read-only and safe to interleave.
  //     Lock is held via O_EXCL (`open(path, 'wx')`) — a vanilla stdlib
  //     primitive; no `proper-lockfile` dependency. Stale lock recovery is
  //     manual: the stderr message tells the user where the file lives.
  //     Acquired AFTER refuse-without-force so a refused run does not leave
  //     a lock file behind (process.exit skips the `finally` cleanup).
  let lockHandle = null;
  const lockPath = join(getVaultPath(), '.self-wiki', `self-review-${window.cycleName}.lock`);
  if (!opts.dryRun) {
    await mkdir(join(getVaultPath(), '.self-wiki'), { recursive: true });
    try {
      lockHandle = await open(lockPath, 'wx');
      await lockHandle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        process.stderr.write(
          `error: another self-review run is in progress (lock: ${lockPath}). ` +
          `If the prior run crashed, remove the lock file and retry.\n`,
        );
        process.exit(1);
      }
      throw err;
    }
  }

  try {

  // 4. Load monthlies in-window. Slice 2 adds the auto-backfill cascade
  //    immediately after, gated by a single hoisted hasClaudeCli check.
  //    `let`-bound (not const) so the post-cascade re-load (step 4c) can
  //    overwrite into the same names — downstream buildSelfReviewPrompt
  //    MUST see post-backfill state.
  const months = monthsInRange(window.start, window.end);
  let monthlies = [];
  let missingMonths = [];
  for (const monthStr of months) {
    try {
      const raw = await readFile(getReportFilePath(monthStr), 'utf8');
      monthlies.push({ monthStr, raw });
    } catch {
      missingMonths.push(monthStr);
    }
  }

  // 4a. Preflight stderr summary (D-05) — print BEFORE any side effect so
  //     the user sees the cascade size and can Ctrl-C if surprised.
  if (missingMonths.length > 0) {
    const presentList = monthlies.map((m) => `Reports/${m.monthStr}.md`);
    const willGenerate = missingMonths.join(', ');
    // Conservative estimate: each missing month covers ~4 ISO weeks.
    const cascadeEstimate = missingMonths.length * 4;
    process.stderr.write(`Resolving ${window.cycleName} (${window.start} → ${window.end})…\n`);
    process.stderr.write(`Monthlies needed: ${months.join(', ')}\n`);
    for (const p of presentList) {
      process.stderr.write(`  ✓ ${p} exists\n`);
    }
    if (opts.dryRun) {
      process.stderr.write(`  would generate (skipped — dry-run): ${willGenerate} (${missingMonths.length})\n`);
    } else {
      process.stderr.write(`  will generate: ${willGenerate} (${missingMonths.length})\n`);
      process.stderr.write(`  cascades to backfill ~${cascadeEstimate} weekly reports (estimate)\n`);
    }
  }

  // 4b. Hoisted soft-fail-to-dry-run gate (REVIEW-08 + D-05 single
  //     hasClaudeCli gate). Fires WHENEVER --dry-run is off AND claude is
  //     missing — handles both cases:
  //       - the cascade needs claude (and would fail mid-loop without
  //         this gate, leaving partial state in the vault);
  //       - the final synthesis needs claude (cascade may be empty but
  //         we still need claude for the review itself).
  //     No partial state: we never enter the cascade or the final
  //     claudeHeadless call. The slice-1 post-prompt check is now
  //     redundant and removed below.
  if (!opts.dryRun && !(await hasClaudeCli())) {
    // Build the prompt with current state (no backfill ran). Surface
    // missing monthlies in the WINDOW_NOTE so the model still sees them.
    const dates0 = datesInRange(window.start, window.end);
    const topicPages0 = await loadInCycleTopicPages(dates0);
    const weeks0 = weeksInRange(window.start, window.end);
    const weeklies0 = [];
    for (const weekStr of weeks0) {
      try {
        const raw = await readFile(getReportFilePath(weekStr), 'utf8');
        weeklies0.push({ weekStr, raw });
      } catch { /* skip */ }
    }
    const priorReview0 = await loadPriorCycleReview({
      cycleName: window.cycleName,
      manualPath: opts.priorReview,
      cycleEndMonths,
    });
    // WR-04: also surface missing weeklies in the WINDOW_NOTE so the
    // user sees gaps inside already-present months (e.g. user manually
    // deleted Reports/2026-W14.md but left Reports/2026-04.md).
    const missingWeeks0 = weeks0.filter(
      (w) => !weeklies0.some((wk) => wk.weekStr === w),
    );
    const note0Parts = [];
    if (missingMonths.length > 0) {
      note0Parts.push(`Missing monthlies (would be backfilled in non-dry-run): ${missingMonths.join(', ')}.`);
    }
    if (missingWeeks0.length > 0) {
      note0Parts.push(`Missing weeklies: ${missingWeeks0.join(', ')}.`);
    }
    const missingNote0 = note0Parts.length > 0 ? note0Parts.join(' ') : null;
    const prompt0 = await buildSelfReviewPrompt({
      window,
      monthlies,
      weeklies: weeklies0,
      topicPages: topicPages0,
      priorReview: priorReview0,
      partialNote: window.partialNote,
      missingMonthlyNote: missingNote0,
    });
    process.stderr.write(
      'warn: `claude` CLI not found on PATH; printing prompt to stdout instead (dry-run mode).\n',
    );
    process.stdout.write(prompt0 + '\n');
    return;
  }

  // 4c. Auto-backfill cascade (D-05 default-on, D-07 dry-run strict).
  //     Skip when --dry-run (Phase 2 D-15 mirror — never invoke
  //     synthesis silently). reportMonthOrchestrator itself cascades
  //     into weeklies (Phase 2), so a fresh-vault cycle-end run may
  //     trigger ~16 claude invocations from a single keystroke.
  if (!opts.dryRun && missingMonths.length > 0) {
    for (const monthStr of missingMonths) {
      try {
        await reportMonthOrchestrator({ month: monthStr, internal: true });
      } catch (err) {
        // Best-effort cascade — log and continue. Mirrors monthly's
        // weekly-cascade error handling (src/commands/report.js
        // lines 301-310). The hoisted hasClaudeCli gate already
        // guards binary-presence; this catches claude -p runtime
        // failures (network blip, model error, OOM, killed).
        process.stderr.write(`warn: backfill failed for ${monthStr}: ${err && err.message ? err.message : err}\n`);
      }
    }
    // Re-load monthlies post-cascade. The downstream buildSelfReviewPrompt
    // MUST see the post-backfill state, NOT the pre-cascade snapshot.
    monthlies = [];
    missingMonths = [];
    for (const monthStr of months) {
      try {
        const raw = await readFile(getReportFilePath(monthStr), 'utf8');
        monthlies.push({ monthStr, raw });
      } catch {
        missingMonths.push(monthStr);
      }
    }
  }

  // 5. Load weeklies in-window (read-only; no backfill at this layer either).
  const weeks = weeksInRange(window.start, window.end);
  const weeklies = [];
  for (const weekStr of weeks) {
    try {
      const raw = await readFile(getReportFilePath(weekStr), 'utf8');
      weeklies.push({ weekStr, raw });
    } catch {
      // missing — silently skip; the Sources line will not list it.
    }
  }

  // 6. Topic pages — every in-cycle date.
  const dates = datesInRange(window.start, window.end);
  const topicPages = await loadInCycleTopicPages(dates);

  // 7. Prior-review continuity.
  const priorReview = await loadPriorCycleReview({
    cycleName: window.cycleName,
    manualPath: opts.priorReview,
    cycleEndMonths,
  });

  // 8. Window note(s) — surface remaining missing monthlies and weeklies.
  //    Under slice 2 the cascade fires automatically; the monthly note
  //    appears in two cases:
  //      - dry-run: "would be backfilled in non-dry-run" hint;
  //      - cascade ran but some months failed best-effort: "cascade
  //        attempted but some failed".
  //    WR-04 also surfaces missing in-cycle weeklies (e.g. a weekly
  //    deleted manually while its containing month is present, or
  //    reportMonthOrchestrator's weekly cascade failed for some isoweek
  //    inside a successfully backfilled month). The user gets a signal
  //    rather than silent coverage gaps. Variable name preserved as
  //    `missingMonthlyNote` because that is what buildSelfReviewPrompt's
  //    parameter is called.
  const missingWeeks = weeks.filter(
    (w) => !weeklies.some((wk) => wk.weekStr === w),
  );
  const noteParts = [];
  if (missingMonths.length > 0) {
    noteParts.push(opts.dryRun
      ? `Missing monthlies (would be backfilled in non-dry-run): ${missingMonths.join(', ')}.`
      : `Missing monthlies (cascade attempted but some failed): ${missingMonths.join(', ')}.`);
  }
  if (missingWeeks.length > 0) {
    noteParts.push(`Missing weeklies: ${missingWeeks.join(', ')}.`);
  }
  const missingMonthlyNote = noteParts.length > 0 ? noteParts.join(' ') : null;

  // 9. Build prompt.
  const prompt = await buildSelfReviewPrompt({
    window,
    monthlies,
    weeklies,
    topicPages,
    priorReview,
    partialNote: window.partialNote,
    missingMonthlyNote,
  });

  // 10. Dry-run: print and return (D-07 strict).
  if (opts.dryRun) {
    process.stdout.write(prompt + '\n');
    return;
  }

  // 11. Soft-fail-to-dry-run on missing claude is now HOISTED to step
  //     4b above (single hasClaudeCli gate, no partial state on cascade).
  //     By the time we reach this point in non-dry-run mode, hasClaudeCli
  //     has already returned true.

  // 12. Synthesize.
  process.stderr.write(`synthesizing self-review for ${window.cycleName}…\n`);
  const body = await claudeHeadless(prompt);
  const today = todayISO();

  // 13. Write file atomically (CR-01 fix). The early refuse-without-force
  //     check at step 3 is a fast-path UX guard; race-safety comes from
  //     `writeFile` with flag `'wx'` (O_EXCL) here. When `--force` is set,
  //     use `'w'` to overwrite and prepend a regenerated marker.
  //
  //     Between step 3's access() and this write, a concurrent process or
  //     `cp` could create outPath. Without `'wx'` we would silently
  //     overwrite. With `'wx'`, EEXIST on a non-force run becomes the
  //     refuse signal (mirroring the early check's stderr message).
  let exists = false;
  try { await access(outPath); exists = true; } catch { /* fresh */ }
  let finalBody = body;
  if (opts.force && exists) {
    // --force overwrite: prepend the regenerated marker so the user can
    // see at a glance this replaced a prior draft.
    finalBody = `<!-- regenerated ${today} -->\n\n${body}`;
  }
  if (!finalBody.endsWith('\n')) finalBody += '\n';

  await ensureParentDir(outPath);
  try {
    await writeFile(outPath, finalBody, { flag: opts.force ? 'w' : 'wx', encoding: 'utf8' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      // Race: file appeared between step 3 and step 13 (concurrent run,
      // `cp`, `git restore`, etc.). Refuse rather than silently overwrite.
      // process.exit skips the `finally` cleanup, so release the lock
      // explicitly here.
      if (lockHandle) {
        await lockHandle.close().catch(() => {});
        await unlink(lockPath).catch(() => {});
        lockHandle = null;
      }
      process.stderr.write(
        `error: ${outPath} already exists (raced with a concurrent writer). ` +
        `Use --force to regenerate (your edits will be lost; recover via 'git restore ${outPath}' if needed).\n`,
      );
      process.exit(1);
    }
    throw err;
  }
  process.stdout.write(`wrote ${outPath}\n`);

  // 14. Vault-config writeback (REVIEW-07 + D-02). Always — even on --since
  //     and off-boundary runs, so the next bare invocation defaults correctly.
  //     For off-boundary --since, the resolved window's cycleName is the
  //     enclosing cycle (per D-04), which is what we persist.
  await writeVaultConfig({
    review: {
      lastReviewedAt: today,
      lastReviewedCycle: window.cycleName,
    },
  });

  } finally {
    // Release the WR-01 dot-lock. The lock is only held in non-dry-run
    // mode; closing a null handle would throw, so guard both ops.
    if (lockHandle) {
      await lockHandle.close().catch(() => {});
      await unlink(lockPath).catch(() => {});
    }
  }
}
