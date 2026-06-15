import { readFile, writeFile, access, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, sep } from 'path';
import { applyUserConfig, ensureVaultConfigured, readVaultConfig } from '../core/config.js';
import { buildMetrics } from '../core/metrics.js';
import { isoWeek, datesInWeek, priorIsoWeek, datesInMonth, priorMonth, weeksInMonth } from '../utils/format.js';
import { getDailyFilePath, getReportFilePath, getVaultPath, ensureParentDir } from '../utils/paths.js';
import { claudeHeadless, hasClaudeCli } from '../core/claude.js';
import { buildProgressFeedbackBlock } from '../core/feedback-progress.js';
import { escapeRegex } from '../utils/regex.js';

function isWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day >= 1 && day <= 5;
}

function resolveOutPath(rawOut, defaultPath) {
  if (!rawOut) return defaultPath;
  const resolved = resolve(rawOut);
  const vaultRoot = resolve(getVaultPath());
  const vaultPrefix = vaultRoot + sep;
  // Reject the vault-root sub-case outright: vaultRoot doesn't end in `sep`,
  // so the prefix check below would let it through, and writeFile would
  // then fail with EISDIR.
  if (resolved === vaultRoot) {
    process.stderr.write(`error: --out cannot be the vault root: ${resolved}\n`);
    process.exit(1);
  }
  if (!resolved.startsWith(vaultPrefix)) {
    process.stderr.write(`warn: --out path is outside the vault: ${resolved}\n`);
  }
  return resolved;
}

// Inserts the code-rendered Progress block immediately before the first H2
// section of the synthesized body, so it lands after the H1 title + Sources
// line and before `## Theme...`. Falls back to appending if no H2 is found.
function insertProgressBlock(body, block) {
  if (!block) return body;
  const lines = body.split('\n');
  const idx = lines.findIndex((l) => /^## /.test(l));
  if (idx === -1) return `${body.trimEnd()}\n\n${block}\n`;
  const head = lines.slice(0, idx).join('\n').trimEnd();
  const rest = lines.slice(idx).join('\n');
  return `${head}\n\n${block}\n\n${rest}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'templates', 'prompts', 'weekly-report.md');
const MONTHLY_PROMPT_PATH = resolve(__dirname, '..', 'templates', 'prompts', 'monthly-report.md');

export async function reportCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();

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
// In that mode the stderr line is rephrased "backfilling", the user-facing
// `wrote <path>` line is suppressed, and the inner hasClaudeCli re-check is
// skipped because the caller already gated upstream.
async function reportWeekOrchestrator(opts) {
  const internal = opts.internal === true;
  const week = opts.week || isoWeek();
  const dates = datesInWeek(week);
  const present = [];
  const missing = [];
  const dailies = [];

  for (const dateStr of dates) {
    try {
      // Single read is the only point of truth for "present". A prior
      // access()+readFile pair created a TOCTOU window and mis-classified
      // permission/IO errors as missing. Only ENOENT means "no daily".
      const raw = await readFile(getDailyFilePath(dateStr), 'utf8');
      present.push(dateStr);
      dailies.push({ dateStr, raw });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // Weekend gaps are noise; only flag weekday gaps as "missing".
      if (isWeekday(dateStr)) missing.push(dateStr);
    }
  }

  if (present.length === 0) {
    if (internal) {
      // No-partial-state invariant: a racy disappearance of dailies between
      // the outer anyDailyExists() short-circuit and these reads must not
      // tear down the surrounding monthly run.
      process.stderr.write(`warn: skipping ${week} — no daily logs at synthesis time\n`);
      return;
    }
    process.stderr.write(`error: no daily logs found for ${week}\n`);
    process.exit(1);
  }

  const metrics = await buildMetrics(present, { shape: 'week' });
  const cfg = await readVaultConfig();
  const corpusBlock = dailies.map((d) => `## --- ${d.dateStr} ---\n\n${d.raw.trim()}`).join('\n\n');
  const progress = (opts.dryRun || internal)
    ? null
    : await buildProgressFeedbackBlock(dates.at(-1), cfg, { corpusLabel: 'week', corpusBlock });
  const priorReport = await loadPriorReport(week);
  const prompt = await buildPrompt({ week, metrics, dailies, present, missing, priorReport });

  if (opts.dryRun) {
    process.stdout.write(prompt + '\n');
    return;
  }

  if (!internal && !(await hasClaudeCli())) {
    process.stderr.write('error: `claude` CLI not found on PATH. Install Claude Code or run with --dry-run to print the prompt.\n');
    process.exit(2);
  }

  process.stderr.write(`${internal ? 'backfilling' : 'synthesizing'} ${week}…\n`);
  const body = await claudeHeadless(prompt);
  const finalBody = insertProgressBlock(body, progress?.block);

  const outPath = resolveOutPath(opts.out, getReportFilePath(week));
  await ensureParentDir(outPath);
  await writeFile(outPath, finalBody.endsWith('\n') ? finalBody : finalBody + '\n', 'utf8');
  if (!internal) {
    process.stdout.write(`wrote ${outPath}\n`);
  }
}

async function anyDailyExists(dates) {
  for (const d of dates) {
    try {
      await access(getDailyFilePath(d));
      return true;
    } catch (err) {
      // Only ENOENT means "no daily for this date" — surface other errors.
      if (err.code !== 'ENOENT') throw err;
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
      // Anchor on `^## <date>\b` (multiline) so formatting tweaks in
      // src/core/topics.js#appendDatedSection do not silently drop topic
      // pages from the monthly synthesis.
      const dateRe = new RegExp(`^## (?:${dates.map(escapeRegex).join('|')})\\b`, 'm');
      if (dateRe.test(raw)) {
        out.push({ slug, raw, kind: kind === 'Tickets' ? 'ticket' : 'component' });
      }
    }
  }
  return out;
}

// `internal: true` is set by selfReviewOrchestrator's cascade. In that mode
// stderr says "backfilling", the user-facing `wrote` line is suppressed,
// and the inner hasClaudeCli re-check is skipped because the caller already
// gated upstream. The weekly-cascade inside this orchestrator still re-checks
// independently; that is the monthly orchestrator's own concern.
export async function reportMonthOrchestrator(opts) {
  const internal = opts.internal === true;
  const month = opts.month === true ? currentMonthUTC() : validateMonthOrExit(opts.month);
  const dates = datesInMonth(month);
  const weeks = weeksInMonth(month);

  // `let`-bound so the post-backfill re-load can overwrite into the same
  // names — downstream prompt-build must see the up-to-date arrays.
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

  // Single hasClaudeCli gate before the loop so a mid-loop crash cannot
  // leave partial state in the vault.
  if (!opts.dryRun && missingWeeks.length > 0) {
    if (!(await hasClaudeCli())) {
      process.stderr.write('error: `claude` CLI not found on PATH. Install Claude Code or run with --dry-run to print the prompt.\n');
      process.exit(2);
    }
    for (const weekStr of missingWeeks) {
      const weekDates = datesInWeek(weekStr);
      const hasAnyDaily = await anyDailyExists(weekDates);
      if (!hasAnyDaily) continue;
      try {
        await reportWeekOrchestrator({ week: weekStr, internal: true });
      } catch (err) {
        // claude -p itself can still fail mid-loop (network, model error,
        // OOM, killed). Log and continue — best-effort cascade.
        process.stderr.write(`warn: backfill failed for ${weekStr}: ${err.message}\n`);
      }
    }
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

  const lastDayOfMonth = dates.at(-1);
  const today = todayUTC();
  const partial = today <= lastDayOfMonth;
  const partialNote = partial
    ? `Partial month — generated ${today} (today is in the in-progress window).`
    : null;

  const weekliesCorpus = presentWeeks.length > 0
    ? presentWeeks.map((w) => `## --- ${w.weekStr} ---\n\n${w.raw.trim()}`).join('\n\n')
    : '(no weekly reports for this month)';
  const topicCorpus = topicPages.length > 0
    ? topicPages.map((t) => `## --- ${t.slug} ---\n\n${t.raw.trim()}`).join('\n\n')
    : '(no in-month topic pages)';
  const monthCorpusBlock = [weekliesCorpus, topicCorpus].join('\n\n');
  const progress = (opts.dryRun || internal)
    ? null
    : await buildProgressFeedbackBlock(lastDayOfMonth, cfg, { corpusLabel: 'month', corpusBlock: monthCorpusBlock });

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

  // Skip the final-synthesis re-check when called from the self-review
  // cascade — the caller's hoisted gate already guaranteed claude is
  // available, and a second check here widens the partial-state window.
  if (!internal && !(await hasClaudeCli())) {
    process.stderr.write('error: `claude` CLI not found on PATH. Install Claude Code or run with --dry-run to print the prompt.\n');
    process.exit(2);
  }

  process.stderr.write(`${internal ? 'backfilling' : 'synthesizing'} ${month}…\n`);
  const body = await claudeHeadless(prompt);
  const withProgress = insertProgressBlock(body, progress?.block);

  const outPath = resolveOutPath(opts.out, getReportFilePath(month));
  await ensureParentDir(outPath);

  let exists = false;
  try {
    await access(outPath);
    exists = true;
  } catch { /* fresh write */ }

  let finalBody = withProgress;
  if (exists) {
    finalBody = `<!-- regenerated ${today} -->\n\n${withProgress}`;
  }
  if (!finalBody.endsWith('\n')) finalBody += '\n';

  await writeFile(outPath, finalBody, 'utf8');
  if (!internal) {
    process.stdout.write(`wrote ${outPath}\n`);
  }
}

async function buildMonthlyPrompt({ month, metrics, weeklies, missingWeeks, topicPages, priorReport, partialNote }) {
  const promptHeader = await readFile(MONTHLY_PROMPT_PATH, 'utf8');

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
