import { readFile, writeFile, access, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { applyUserConfig, ensureVaultConfigured, readVaultConfig } from '../core/config.js';
import { buildMetrics } from '../core/metrics.js';
import { isoWeek, datesInWeek, priorIsoWeek, datesInMonth, priorMonth, weeksInMonth } from '../utils/format.js';
import { getDailyFilePath, getReportFilePath, getVaultPath, ensureParentDir } from '../utils/paths.js';
import { claudeHeadless, hasClaudeCli } from '../core/claude.js';
import { escapeRegex } from '../utils/regex.js';

function isWeekday(dateStr) {
  // dateStr is YYYY-MM-DD; parse as UTC to keep day-of-week stable across tz.
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day >= 1 && day <= 5;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'templates', 'prompts', 'weekly-report.md');
const MONTHLY_PROMPT_PATH = resolve(__dirname, '..', 'templates', 'prompts', 'monthly-report.md');

export async function reportCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();

  // Mutual exclusion (project convention: validate at the command).
  if (opts.month && opts.week) {
    process.stderr.write('error: --week and --month are mutually exclusive\n');
    process.exit(1);
  }

  if (opts.month) {
    return reportMonthOrchestrator(opts);
  }

  return reportWeekOrchestrator(opts);
}

// `internal: true` is set by reportMonthOrchestrator's auto-backfill loop.
// In that mode:
//   - the stderr progress line is rephrased "backfilling <week>…" so a
//     multi-week run reads coherently to the user;
//   - the `wrote <path>` stdout line is suppressed (the monthly orchestrator
//     owns the user-visible summary);
//   - hasClaudeCli() is NOT re-checked here — the caller gated upstream so a
//     mid-loop crash on missing claude can never leave partial state.
async function reportWeekOrchestrator(opts) {
  const internal = opts.internal === true;
  const week = opts.week || isoWeek();
  const dates = datesInWeek(week);
  const present = [];
  const missing = [];
  const dailies = [];

  for (const dateStr of dates) {
    try {
      // Single read — readFile is the only point of truth for "present".
      // The previous access()+readFile pair created a TOCTOU window and
      // also mis-classified non-ENOENT errors (perm flap, I/O) as
      // "missing"; here we let unexpected errors surface and only treat
      // ENOENT as "no daily for this date".
      const raw = await readFile(getDailyFilePath(dateStr), 'utf8');
      present.push(dateStr);
      dailies.push({ dateStr, raw });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // Only flag weekdays without logs as "missing"; weekend gaps are noise.
      if (isWeekday(dateStr)) missing.push(dateStr);
    }
  }

  if (present.length === 0) {
    if (internal) {
      // Monthly auto-backfill caller. A racy disappearance of dailies
      // between the outer anyDailyExists() short-circuit and the inner
      // reads here must not tear down the surrounding monthly run —
      // it's exactly the "no partial state" invariant documented at the
      // backfill loop. Skip this week and let the loop continue.
      process.stderr.write(`warn: skipping ${week} — no daily logs at synthesis time\n`);
      return;
    }
    process.stderr.write(`error: no daily logs found for ${week}\n`);
    process.exit(1);
  }

  const metrics = await buildMetrics(present, { shape: 'week' });
  const priorReport = await loadPriorReport(week);
  const prompt = await buildPrompt({ week, metrics, dailies, present, missing, priorReport });

  if (opts.dryRun) {
    process.stdout.write(prompt + '\n');
    return;
  }

  // Standalone weekly path keeps its soft-fail to dry-run on missing claude.
  // The monthly backfill caller gates upstream, so we skip this check then.
  if (!internal && !(await hasClaudeCli())) {
    process.stderr.write('error: `claude` CLI not found on PATH. Install Claude Code or run with --dry-run to print the prompt.\n');
    process.exit(2);
  }

  process.stderr.write(`${internal ? 'backfilling' : 'synthesizing'} ${week}…\n`);
  const body = await claudeHeadless(prompt);

  const outPath = opts.out || getReportFilePath(week);
  await ensureParentDir(outPath);
  await writeFile(outPath, body.endsWith('\n') ? body : body + '\n', 'utf8');
  if (!internal) {
    process.stdout.write(`wrote ${outPath}\n`);
  }
}

// Used by the auto-backfill loop to skip ISO weeks whose constituent dates
// have no daily log on disk (MONTH-04 graceful degradation). Only ENOENT
// is treated as "no daily for this date" — other errors (permission,
// I/O) are surfaced rather than silently masked, which previously could
// cause monthly synthesis to skip weeks the user simply could not read.
async function anyDailyExists(dates) {
  for (const d of dates) {
    try {
      await access(getDailyFilePath(d));
      return true;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // ENOENT — keep checking the next date.
    }
  }
  return false;
}

async function loadPriorReport(week) {
  let priorWeek;
  try {
    priorWeek = priorIsoWeek(week);
  } catch {
    return null;
  }
  try {
    const raw = await readFile(getReportFilePath(priorWeek), 'utf8');
    return { week: priorWeek, body: raw.trim() };
  } catch {
    return null;
  }
}

async function buildPrompt({ week, metrics, dailies, present, missing, priorReport }) {
  const promptHeader = await readFile(PROMPT_PATH, 'utf8');
  const sourcesLine = `Sources: ${present.map((d) => `\`Daily/${d}.md\``).join(', ')}.${missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : ''}`;
  const dailiesBlock = dailies.map((d) => `## --- ${d.dateStr} ---\n\n${d.raw.trim()}`).join('\n\n');
  const parts = [
    promptHeader,
    '',
    '---',
    '',
    `WEEK: ${week}`,
    '',
    'SOURCES_LINE:',
    sourcesLine,
    '',
    'METRICS:',
    metrics,
    '',
    'DAILIES:',
    dailiesBlock,
  ];
  if (priorReport) {
    parts.push('', `PRIOR_REPORT (${priorReport.week}):`, priorReport.body);
  }
  return parts.join('\n');
}

// ---------- Monthly path (Plan 02-02) ----------

function currentMonthUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function todayUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function validateMonthOrExit(value) {
  const m = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})$/) : null;
  if (!m) {
    process.stderr.write(`error: invalid --month value: ${value} (expected YYYY-MM)\n`);
    process.exit(1);
  }
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) {
    process.stderr.write(`error: invalid --month value: ${value} (expected YYYY-MM)\n`);
    process.exit(1);
  }
  return value;
}

async function loadPriorMonthReport(monthStr) {
  let prior;
  try {
    prior = priorMonth(monthStr);
  } catch {
    return null;
  }
  try {
    const raw = await readFile(getReportFilePath(prior), 'utf8');
    return { month: prior, body: raw.trim() };
  } catch {
    return null;
  }
}

async function loadInMonthTopicPages(monthStr) {
  const dates = datesInMonth(monthStr);
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
      // A topic page is "touched in-month" when at least one of the in-month
      // YYYY-MM-DD strings appears under a `## ` section header. The
      // current convention in src/core/topics.js#appendDatedSection is
      // `## ${dateStr} — Session ${n}`, but we anchor on `^## <date>\b`
      // (multiline) so a future formatting tweak (`: ` instead of `— `,
      // newline-only, etc.) does not silently drop topic pages from the
      // monthly synthesis. Also accepts the date appearing at the end of
      // the header line.
      const dateRe = new RegExp(`^## (?:${dates.map(escapeRegex).join('|')})\\b`, 'm');
      const touched = dateRe.test(raw);
      if (touched) out.push({ slug, raw, kind: kind === 'Tickets' ? 'ticket' : 'component' });
    }
  }
  return out;
}

async function reportMonthOrchestrator(opts) {
  const month = opts.month === true ? currentMonthUTC() : validateMonthOrExit(opts.month);
  const dates = datesInMonth(month);
  const weeks = weeksInMonth(month);

  // Load existing weeklies; track missing.
  // `let`-bound (not const) so the auto-backfill phase below can re-load
  // post-backfill state into the same names — the downstream prompt-build
  // call must see the up-to-date arrays.
  let presentWeeks = [];
  let missingWeeks = [];
  for (const weekStr of weeks) {
    try {
      const raw = await readFile(getReportFilePath(weekStr), 'utf8');
      presentWeeks.push({ weekStr, raw });
    } catch {
      missingWeeks.push(weekStr);
    }
  }

  // D-02 / D-03: auto-backfill missing weeklies before synthesizing the
  // month. Skip when --dry-run (per CONTEXT.md <specifics>: dry-run prints
  // the monthly prompt only, never silently invokes weekly synthesis).
  // Gate the entire loop behind a single hasClaudeCli check so a mid-loop
  // crash on missing `claude` cannot leave partial state in the vault.
  if (!opts.dryRun && missingWeeks.length > 0) {
    if (!(await hasClaudeCli())) {
      process.stderr.write('error: `claude` CLI not found on PATH. Install Claude Code or run with --dry-run to print the prompt.\n');
      process.exit(2);
    }
    for (const weekStr of missingWeeks) {
      const weekDates = datesInWeek(weekStr);
      const hasAnyDaily = await anyDailyExists(weekDates);
      if (!hasAnyDaily) continue; // MONTH-04: graceful skip on weeks with zero dailies
      try {
        await reportWeekOrchestrator({ week: weekStr, internal: true });
      } catch (err) {
        // The hasClaudeCli() pre-check above guards binary-presence, but
        // claude -p itself can still fail mid-loop (network blip, model
        // error, OOM, killed). Without this catch the rejection bubbles
        // through cli.js's parseAsync and exits 1, leaving any weekly
        // reports written so far on disk — exactly the partial-state
        // outcome the comment block above the gate disclaims. Log and
        // continue so the monthly run remains best-effort.
        process.stderr.write(`warn: backfill failed for ${weekStr}: ${err.message}\n`);
      }
    }
    // Re-load — the loop just wrote new files for some weeks; the
    // downstream buildMonthlyPrompt MUST see the post-backfill state.
    presentWeeks = [];
    missingWeeks = [];
    for (const weekStr of weeks) {
      try {
        const raw = await readFile(getReportFilePath(weekStr), 'utf8');
        presentWeeks.push({ weekStr, raw });
      } catch {
        missingWeeks.push(weekStr);
      }
    }
  }

  const topicPages = await loadInMonthTopicPages(month);
  const cfg = await readVaultConfig();
  const metrics = await buildMetrics(dates, {
    shape: 'month',
    components: cfg.components ?? [],
  });
  const priorReport = await loadPriorMonthReport(month);

  // Partial-month detection (D-15): today (UTC) is on or before last day of month.
  const lastDayOfMonth = dates.at(-1);
  const today = todayUTC();
  const partial = today <= lastDayOfMonth;
  const partialNote = partial
    ? `Partial month — generated ${today} (today is in the in-progress window).`
    : null;

  const prompt = await buildMonthlyPrompt({
    month,
    metrics,
    weeklies: presentWeeks,
    missingWeeks,
    topicPages,
    priorReport,
    partialNote,
  });

  if (opts.dryRun) {
    process.stdout.write(prompt + '\n');
    return;
  }

  if (!(await hasClaudeCli())) {
    process.stderr.write('error: `claude` CLI not found on PATH. Install Claude Code or run with --dry-run to print the prompt.\n');
    process.exit(2);
  }

  process.stderr.write(`synthesizing ${month}…\n`);
  const body = await claudeHeadless(prompt);

  const outPath = opts.out || getReportFilePath(month);
  await ensureParentDir(outPath);

  // D-13: always overwrite, prepending a regenerated marker on
  // second-and-subsequent runs.
  let exists = false;
  try {
    await access(outPath);
    exists = true;
  } catch { /* fresh write */ }

  let finalBody = body;
  if (exists) {
    finalBody = `<!-- regenerated ${today} -->\n\n${body}`;
  }
  if (!finalBody.endsWith('\n')) finalBody += '\n';

  await writeFile(outPath, finalBody, 'utf8');
  process.stdout.write(`wrote ${outPath}\n`);
}

async function buildMonthlyPrompt({ month, metrics, weeklies, missingWeeks, topicPages, priorReport, partialNote }) {
  const promptHeader = await readFile(MONTHLY_PROMPT_PATH, 'utf8');

  // Build the Sources line as a sequence of independent clauses. The
  // earlier sourceParts.join('') was a no-op on a single-element array;
  // straight string concatenation here is clearer and matches reader
  // intent (one clause per data category).
  const sourcesHead = weeklies.length > 0
    ? `Sources: ${weeklies.map((w) => `\`Reports/${w.weekStr}.md\``).join(', ')}.`
    : 'Sources: (no weekly reports present).';
  let sourcesLine = sourcesHead;
  if (missingWeeks.length > 0) {
    sourcesLine += ` Missing weeks: ${missingWeeks.join(', ')}.`;
  }
  if (topicPages.length > 0) {
    const tp = topicPages.map((t) => `\`${t.kind === 'ticket' ? 'Tickets' : 'Components'}/${t.slug}.md\``).join(', ');
    sourcesLine += ` Topic pages: ${tp}.`;
  }

  const weekliesBlock = weeklies.length > 0
    ? weeklies.map((w) => `## --- ${w.weekStr} ---\n\n${w.raw.trim()}`).join('\n\n')
    : '(no weekly reports for this month)';

  const topicPagesBlock = topicPages.length > 0
    ? topicPages.map((t) => `## --- ${t.slug} ---\n\n${t.raw.trim()}`).join('\n\n')
    : '(no in-month topic pages)';

  const parts = [
    promptHeader,
    '',
    '---',
    '',
    `MONTH: ${month}`,
    '',
    'SOURCES_LINE:',
    sourcesLine,
  ];
  if (partialNote) {
    parts.push('', 'PARTIAL_NOTE:', partialNote);
  }
  parts.push(
    '',
    'METRICS:',
    metrics,
    '',
    'WEEKLIES:',
    weekliesBlock,
    '',
    'TOPIC_PAGES:',
    topicPagesBlock,
  );
  if (priorReport) {
    parts.push('', `PRIOR_REPORT (${priorReport.month}):`, priorReport.body);
  }
  return parts.join('\n');
}
