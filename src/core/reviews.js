import { mkdir, readFile, readdir, writeFile, access, open, unlink } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { resolveCycle } from './cycles.js';
import { readVaultConfig, writeVaultConfig } from './config.js';
import { hasClaudeCli, claudeHeadless } from './claude.js';
import { reportMonthOrchestrator } from '../commands/report.js';
import { getReviewFilePath, getReviewFinalFilePath, getReportFilePath, getVaultPath, ensureParentDir } from '../utils/paths.js';
import { monthsInRange, weeksInMonth, datesInMonth } from '../utils/format.js';
import { escapeRegex } from '../utils/regex.js';

export async function ensureReviewsDir(vaultPath) {
  await mkdir(join(vaultPath, 'Reviews'), { recursive: true });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SELF_REVIEW_PROMPT_PATH = resolve(
  __dirname, '..', 'templates', 'prompts', 'self-review.md',
);

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
  // Probe-date derivation: resolveCycle takes a date and returns its enclosing
  // cycle. To go the other way (cycleName → window) we feed it a date guaranteed
  // to land inside the target cycle. Last cycle ends Dec 31, so Dec 15 works.
  // Other cycles end on the last day of the month BEFORE the next review-month
  // (Option B boundary), so the 15th of that prior month is safely inside.
  const k = cycleEndMonths.length;
  const isLast = ordinal === k;
  const probeMonth = isLast ? 12 : cycleEndMonths[ordinal - 1] - 1;
  const probe = new Date(Date.UTC(year, probeMonth - 1, 15));
  const r = resolveCycle(probe, cycleEndMonths);
  if (r.current.name !== cycleName) {
    throw new Error(`invalid --cycle value: ${cycleName} (does not match cycleEndMonths=${JSON.stringify(cycleEndMonths)})`);
  }
  return r.current;
}

function findEnclosingCycle(sinceISO, cycleEndMonths) {
  return resolveCycle(sinceISO, cycleEndMonths).current;
}

export function resolveReviewWindow(args) {
  const today = args.today || todayISO();
  const cem = args.vaultConfig?.review?.cycleEndMonths;
  if (!Array.isArray(cem) || cem.length === 0) {
    throw new Error('vault config missing review.cycleEndMonths — run `self-wiki init` or check vault config');
  }

  if (args.cycle) {
    const c = parseCycleName(args.cycle, cem);
    return { cycleName: c.name, start: c.start, end: c.end, partialNote: null };
  }

  if (args.lastCycle) {
    const r = resolveCycle(today, cem);
    return { cycleName: r.previous.name, start: r.previous.start, end: r.previous.end, partialNote: null };
  }

  if (args.since) {
    const enc = findEnclosingCycle(args.since, cem);
    const partialNote = args.since !== enc.start
      ? `Custom window ${args.since} → ${enc.end}; report covers a partial slice of ${enc.name}.`
      : null;
    return { cycleName: enc.name, start: args.since, end: enc.end, partialNote };
  }

  const last = args.vaultConfig?.review?.lastReviewedAt;
  if (last) {
    const enc = findEnclosingCycle(last, cem);
    const partialNote = last !== enc.start
      ? `Custom window ${last} → ${enc.end} (since last review); report covers a partial slice of ${enc.name}.`
      : null;
    return { cycleName: enc.name, start: last, end: enc.end, partialNote };
  }

  const r = resolveCycle(today, cem);
  const chosen = r.current.end <= today ? r.current : r.previous;
  return { cycleName: chosen.name, start: chosen.start, end: chosen.end, partialNote: null };
}

function priorCycleNameOf(cycleName, cycleEndMonths) {
  const c = parseCycleName(cycleName, cycleEndMonths);
  return resolveCycle(c.start, cycleEndMonths).previous.name;
}

function extractQ3(body) {
  // Anchor on `^## 3.` — the self-review prompt mandates Q3 as
  //   `## 3. What is your current area of focus as you "Grow & Get Better"...`
  // Tolerant of wording drift in the rest of the heading.
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

export async function loadPriorCycleReview(args) {
  // Manual override always wins over auto-detect.
  if (args.manualPath) {
    try {
      const body = await readFile(args.manualPath, 'utf8');
      return { kind: 'manual', path: args.manualPath, body: body.trim() };
    } catch {
      return null;
    }
  }
  let priorName;
  try {
    priorName = priorCycleNameOf(args.cycleName, args.cycleEndMonths);
  } catch {
    return null;
  }
  // D-01a: prefer the submitted final's FULL body over the generated draft's Q3.
  const finalPath = getReviewFinalFilePath(priorName);
  try {
    const finalBody = await readFile(finalPath, 'utf8');
    return { kind: 'autoFinal', path: finalPath, body: finalBody.trim(), priorCycleName: priorName };
  } catch { /* no final.md — fall through to the Q3 draft fallback */ }
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

export async function loadInCycleTopicPages(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  // Anchor on `^## <date>\b` (multiline) so formatting tweaks in
  // src/core/topics.js#appendDatedSection do not silently drop topic pages.
  const dateRe = new RegExp(`^## (?:${dates.map(escapeRegex).join('|')})\\b`, 'm');
  const out = [];
  for (const kind of ['Tickets', 'Components']) {
    const dir = join(getVaultPath(), kind);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      continue;
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

export async function buildSelfReviewPrompt(args) {
  const { window, monthlies, weeklies, topicPages, priorReview } = args;
  const promptHeader = await readFile(SELF_REVIEW_PROMPT_PATH, 'utf8');

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

  // MONTHLIES → WEEKLIES → TOPIC_PAGES order is load-bearing: primary spine,
  // secondary detail, then ground truth. Locked by an ordering test.
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

  // Manual prior review wins over auto-detected final wins over Q3 (loadPriorCycleReview
  // already enforces this; defended again here). D-01a precedence chain.
  if (priorReview) {
    if (priorReview.kind === 'manual' && priorReview.body) {
      parts.push('', 'PRIOR_REVIEW:', priorReview.body);
    } else if (priorReview.kind === 'autoFinal' && priorReview.body) {
      parts.push('', `PRIOR_REVIEW (${priorReview.priorCycleName}):`, priorReview.body);
    } else if (priorReview.kind === 'autoQ3' && priorReview.body) {
      parts.push('', `PRIOR_GROWTH_FOCUS (${priorReview.priorCycleName}):`, priorReview.body);
    }
  }

  return parts.join('\n');
}

function resolveOutPath(rawOut, defaultPath) {
  if (!rawOut) return defaultPath;
  const r = resolve(rawOut);
  const vaultRoot = resolve(getVaultPath());
  const vaultPrefix = vaultRoot + sep;
  // Reject the vault-root sub-case outright: vaultRoot does not end in `sep`,
  // so the startsWith check below would let it through, and writeFile would
  // then fail with EISDIR.
  if (r === vaultRoot) {
    process.stderr.write(`error: --out cannot be the vault root: ${r}\n`);
    process.exit(1);
  }
  if (!r.startsWith(vaultPrefix)) {
    process.stderr.write(`warn: --out path is outside the vault: ${r}\n`);
  }
  return r;
}

function weeksInRange(startISO, endISO) {
  // Dedupe: a week spanning two months (e.g. last few days of one month +
  // first few of the next) appears in both months' weeksInMonth result.
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

export async function selfReviewOrchestrator(opts = {}) {
  const cfg = await readVaultConfig();
  const cycleEndMonths = cfg.review?.cycleEndMonths ?? [5, 9, 12];

  const window = resolveReviewWindow({
    since: opts.since,
    cycle: opts.cycle,
    lastCycle: opts.lastCycle,
    today: todayISO(),
    vaultConfig: cfg,
  });

  const defaultOut = getReviewFilePath(window.cycleName);
  const outPath = resolveOutPath(opts.out, defaultOut);

  // Fast-path UX guard: refuse-without-force BEFORE the multi-minute cascade
  // so the user does not waste claude calls. Race-safety comes from the
  // atomic O_EXCL write at step 13 — both checks must remain.
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

  // Cross-process mutex via O_EXCL dot-lock. A single cascade can spawn ~16
  // claude -p invocations and produces last-write-wins state on Reviews/<cycle>.md
  // + writeVaultConfig, so a duplicate cascade is genuinely expensive.
  // Stale-lock recovery is manual; the stderr message names the file.
  // Acquired AFTER refuse-without-force so a refused run leaves no lock behind
  // (process.exit skips the `finally` cleanup).
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

  // Preflight summary BEFORE any side effect so the user sees the cascade
  // size and can Ctrl-C if surprised.
  if (missingMonths.length > 0) {
    const presentList = monthlies.map((m) => `Reports/${m.monthStr}.md`);
    const willGenerate = missingMonths.join(', ');
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

  // Hoisted soft-fail gate: fires whenever non-dry-run AND claude is missing.
  // Handles both the cascade and the final synthesis; prevents the cascade
  // from running and leaving partial state in the vault when claude is gone.
  if (!opts.dryRun && !(await hasClaudeCli())) {
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

  // Auto-backfill cascade. reportMonthOrchestrator itself cascades into
  // weeklies, so a fresh-vault cycle-end run may trigger ~16 claude
  // invocations from a single keystroke. Best-effort: log and continue
  // on per-month failures rather than aborting the cascade.
  if (!opts.dryRun && missingMonths.length > 0) {
    for (const monthStr of missingMonths) {
      try {
        await reportMonthOrchestrator({ month: monthStr, internal: true });
      } catch (err) {
        process.stderr.write(`warn: backfill failed for ${monthStr}: ${err && err.message ? err.message : err}\n`);
      }
    }
    // Re-load monthlies post-cascade so buildSelfReviewPrompt sees the
    // post-backfill state, not the pre-cascade snapshot.
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

  const weeks = weeksInRange(window.start, window.end);
  const weeklies = [];
  for (const weekStr of weeks) {
    try {
      const raw = await readFile(getReportFilePath(weekStr), 'utf8');
      weeklies.push({ weekStr, raw });
    } catch {
      /* missing — Sources line will not list it */
    }
  }

  const dates = datesInRange(window.start, window.end);
  const topicPages = await loadInCycleTopicPages(dates);

  const priorReview = await loadPriorCycleReview({
    cycleName: window.cycleName,
    manualPath: opts.priorReview,
    cycleEndMonths,
  });

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

  const prompt = await buildSelfReviewPrompt({
    window,
    monthlies,
    weeklies,
    topicPages,
    priorReview,
    partialNote: window.partialNote,
    missingMonthlyNote,
  });

  if (opts.dryRun) {
    process.stdout.write(prompt + '\n');
    return;
  }

  process.stderr.write(`synthesizing self-review for ${window.cycleName}…\n`);
  const body = await claudeHeadless(prompt);
  const today = todayISO();

  // Atomic O_EXCL write. The early refuse-without-force check is a UX
  // guard; race-safety lives here. Between that check and this write, a
  // concurrent writer could create outPath. With 'wx', EEXIST becomes the
  // refuse signal; without it, we would silently overwrite.
  let exists = false;
  try { await access(outPath); exists = true; } catch { /* fresh */ }
  let finalBody = body;
  if (opts.force && exists) {
    finalBody = `<!-- regenerated ${today} -->\n\n${body}`;
  }
  if (!finalBody.endsWith('\n')) finalBody += '\n';

  await ensureParentDir(outPath);
  try {
    await writeFile(outPath, finalBody, { flag: opts.force ? 'w' : 'wx', encoding: 'utf8' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      // process.exit skips the `finally` cleanup, so release the lock here.
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

  // Writeback runs on every successful synthesis, including --since and
  // off-boundary runs, so the next bare invocation defaults correctly.
  await writeVaultConfig({
    review: {
      lastReviewedAt: today,
      lastReviewedCycle: window.cycleName,
    },
  });

  } finally {
    if (lockHandle) {
      await lockHandle.close().catch(() => {});
      await unlink(lockPath).catch(() => {});
    }
  }
}
