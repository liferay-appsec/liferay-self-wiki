import { readFile, writeFile, access } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { buildMetrics } from '../core/metrics.js';
import { isoWeek, datesInWeek, priorIsoWeek } from '../utils/format.js';
import { getDailyFilePath, getReportFilePath, ensureParentDir } from '../utils/paths.js';
import { claudeHeadless, hasClaudeCli } from '../core/claude.js';

function isWeekday(dateStr) {
  // dateStr is YYYY-MM-DD; parse as UTC to keep day-of-week stable across tz.
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day >= 1 && day <= 5;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'templates', 'prompts', 'weekly-report.md');

export async function reportCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();

  const week = opts.week || isoWeek();
  const dates = datesInWeek(week);
  const present = [];
  const missing = [];
  const dailies = [];

  for (const dateStr of dates) {
    try {
      await access(getDailyFilePath(dateStr));
      const raw = await readFile(getDailyFilePath(dateStr), 'utf8');
      present.push(dateStr);
      dailies.push({ dateStr, raw });
    } catch {
      // Only flag weekdays without logs as "missing"; weekend gaps are noise.
      if (isWeekday(dateStr)) missing.push(dateStr);
    }
  }

  if (present.length === 0) {
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

  if (!(await hasClaudeCli())) {
    process.stderr.write('error: `claude` CLI not found on PATH. Install Claude Code or run with --dry-run to print the prompt.\n');
    process.exit(2);
  }

  process.stderr.write(`synthesizing ${week}…\n`);
  const body = await claudeHeadless(prompt);

  const outPath = opts.out || getReportFilePath(week);
  await ensureParentDir(outPath);
  await writeFile(outPath, body.endsWith('\n') ? body : body + '\n', 'utf8');
  process.stdout.write(`wrote ${outPath}\n`);
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
