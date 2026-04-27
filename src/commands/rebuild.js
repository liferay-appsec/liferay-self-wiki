import { applyUserConfig, ensureVaultConfigured, readVaultConfig } from '../core/config.js';
import { rebuildTicketPage, rebuildComponentPage } from '../core/topics.js';
import { listDailyDates, parseDailyFile } from '../utils/log-parser.js';

export async function rebuildCommand(opts = {}) {
  await applyUserConfig();
  ensureVaultConfigured();
  const cfg = await readVaultConfig();

  if (opts.allTickets) {
    const tickets = await collectAllTicketIds(cfg);
    for (const id of tickets) {
      const result = await rebuildTicketPage(id);
      process.stdout.write(`${id}: ${result.sectionCount} section(s) → ${result.filePath}\n`);
    }
    return;
  }
  if (opts.allComponents) {
    for (const comp of cfg.components ?? []) {
      const slug = typeof comp === 'string' ? comp : comp.slug;
      const result = await rebuildComponentPage(slug);
      process.stdout.write(`${slug}: ${result.sectionCount} section(s) → ${result.filePath}\n`);
    }
    return;
  }
  if (!opts.topic) {
    process.stderr.write('error: pass --topic <id>, --all-tickets, or --all-components\n');
    process.exit(2);
  }
  const isTicket = /^[A-Z]+-\d+$/.test(opts.topic);
  const result = isTicket
    ? await rebuildTicketPage(opts.topic)
    : await rebuildComponentPage(opts.topic);
  process.stdout.write(`${opts.topic}: ${result.sectionCount} section(s) → ${result.filePath}\n`);
  if (opts.withSynthesis) {
    process.stderr.write('warn: --with-synthesis is not yet implemented in v0.1\n');
  }
}

async function collectAllTicketIds(cfg) {
  const re = new RegExp(cfg.ticketRegex, 'g');
  const ids = new Set();
  for (const dateStr of await listDailyDates()) {
    const parsed = await parseDailyFile(dateStr);
    for (const s of parsed.sessions) {
      if (s.ticketId) ids.add(s.ticketId);
      const haystack = s.notes.map((n) => n.text).join('\n') + '\n' + s.switches.map((x) => x.newTask).join('\n');
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(haystack)) != null) ids.add(m[0]);
    }
  }
  return [...ids].sort();
}
