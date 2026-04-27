import { readFile, writeFile, access } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { applyUserConfig, ensureVaultConfigured } from '../core/config.js';
import { isoWeek, datesInWeek } from '../utils/format.js';
import { parseDailyFile } from '../utils/log-parser.js';
import { getDailyFilePath, getReportFilePath, ensureParentDir } from '../utils/paths.js';
import { claudeHeadless, hasClaudeCli } from '../core/claude.js';

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
      missing.push(dateStr);
    }
  }

  if (present.length === 0) {
    process.stderr.write(`error: no daily logs found for ${week}\n`);
    process.exit(1);
  }

  const timeTable = await buildTimeTable(present);
  const metrics = await buildMetrics(present);
  const prompt = await buildPrompt({ week, timeTable, metrics, dailies, present, missing });

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

async function buildTimeTable(dates) {
  const rows = [];
  let totalSessions = 0;
  let totalMin = 0;
  for (const dateStr of dates) {
    const parsed = await parseDailyFile(dateStr);
    const sessions = parsed.sessions.length;
    const tracked = parsed.sessions.reduce((acc, s) => acc + (s.duration ?? 0), 0);
    const completed = parsed.sessions.filter((s) => s.status === 'completed').length;
    const interrupted = parsed.sessions.filter((s) => s.status === 'interrupted').length;
    const open = parsed.sessions.filter((s) => s.status === 'open').length;
    const status = [
      completed ? `${completed} ✅` : null,
      interrupted ? `${interrupted} ⚠️` : null,
      open ? `${open} open` : null,
    ].filter(Boolean).join(' · ') || '—';
    const dayLabel = formatDayLabel(dateStr);
    rows.push(`| ${dayLabel} | ${sessions} | ${formatTracked(tracked)} | ${status} |`);
    totalSessions += sessions;
    totalMin += tracked;
  }
  return [
    '| Day | Sessions | Tracked | Status |',
    '|---|---|---|---|',
    ...rows,
    `| **Total** | **${totalSessions}** | **${formatTracked(totalMin)}** | |`,
  ].join('\n');
}

async function buildMetrics(dates) {
  const prSet = new Set();
  let forcePushes = 0;
  let testsMentions = 0;
  for (const dateStr of dates) {
    const parsed = await parseDailyFile(dateStr);
    const text = parsed.sessions.flatMap((s) => s.notes.map((n) => n.text)).join('\n');
    const prMatches = text.match(/PR\s*#?(\d+)/gi) ?? [];
    for (const m of prMatches) prSet.add(m.replace(/PR\s*#?/i, '#'));
    forcePushes += (text.match(/force[ -]?push/gi) ?? []).length;
    testsMentions += (text.match(/\b(?:tests? added|new tests?|added \d+ tests?)\b/gi) ?? []).length;
  }
  const lines = [];
  lines.push(`- **PRs touched:** ${prSet.size > 0 ? [...prSet].sort().join(', ') : '—'}.`);
  lines.push(`- **Force-push mentions:** ${forcePushes}.`);
  lines.push(`- **Test-add mentions:** ${testsMentions}.`);
  return lines.join('\n');
}

async function buildPrompt({ week, timeTable, metrics, dailies, present, missing }) {
  const promptHeader = await readFile(PROMPT_PATH, 'utf8');
  const sourcesLine = `Sources: ${present.map((d) => `\`Daily/${d}.md\``).join(', ')}.${missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : ''}`;
  const dailiesBlock = dailies.map((d) => `## --- ${d.dateStr} ---\n\n${d.raw.trim()}`).join('\n\n');
  return [
    promptHeader,
    '',
    '---',
    '',
    `WEEK: ${week}`,
    '',
    'SOURCES_LINE:',
    sourcesLine,
    '',
    'TIME_TABLE:',
    timeTable,
    '',
    'METRICS:',
    metrics,
    '',
    'DAILIES:',
    dailiesBlock,
  ].join('\n');
}

function formatDayLabel(dateStr) {
  const [, mm, dd] = dateStr.split('-');
  const dow = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${dow} ${mm}-${dd}`;
}

function formatTracked(min) {
  if (min === 0) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h (${min} min)` : `${h}h ${m}m (${min} min)`;
}
