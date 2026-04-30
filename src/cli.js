#!/usr/bin/env node
// Headless escape hatch: when self-wiki invokes `claude -p` for synthesis
// (e.g. weekly report), it sets SELF_WIKI_HEADLESS=1 on the child env. The
// child Claude inherits the user's hooks and may auto-load the wiki skill,
// both of which would otherwise call back into this CLI and contaminate
// state — or worse, make the model echo "Noted." instead of producing the
// requested output. Exit 0 silently for every subcommand in that mode.
if (process.env.SELF_WIKI_HEADLESS === '1') {
  process.exit(0);
}

import { Command } from 'commander';
import { sessionOpen, sessionClose, sessionSwitch } from './commands/session.js';
import { noteCommand } from './commands/note.js';
import { statusCommand } from './commands/status.js';
import { initCommand } from './commands/init.js';
import { reportCommand } from './commands/report.js';
import { rebuildCommand } from './commands/rebuild.js';
import { updateTopicsCommand } from './commands/update-topics.js';
import { configCommand } from './commands/config.js';
import { nudgeCommand } from './commands/nudge.js';
import { closeOrphansCommand } from './commands/close-orphans.js';

const program = new Command();

program
  .name('self-wiki')
  .description('Self-writing personal wiki — Claude Code sessions produce daily logs, topic pages, and weekly reports.')
  .version('0.1.0');

program
  .command('init [vault-path]')
  .description('Scaffold a vault, install the wiki skill, and propose Claude Code hooks.')
  .option('--no-hooks', 'skip writing hooks to ~/.claude/settings.json')
  .option('--no-skill', 'skip installing the skill to ~/.claude/skills/wiki/')
  .option('-y, --yes', 'skip confirmation prompts')
  .action(initCommand);

const session = program
  .command('session')
  .description('Session lifecycle (called by Claude Code hooks; not normally invoked manually).');

session
  .command('open')
  .description('Open a new session (SessionStart hook).')
  .option('--cwd <path>', 'override working directory used for task detection')
  .option('--claude-session-id <id>', 'Claude session id from hook payload')
  .action(sessionOpen);

session
  .command('close')
  .description('Close the active session.')
  .option('--soft', 'soft-close: allow reopening within softCloseMinutes')
  .option('--hard', 'hard-close: finalize and update topic pages')
  .option('--interrupted', 'mark as interrupted instead of completed')
  .option('--silent', 'suppress stdout messages')
  .option('--skip-topics', 'do not update topic pages')
  .option('--block-on-tell', 'on soft-close, emit a Claude Code Stop-block JSON when the turn looks like a wrap-up with no note')
  .option('--claude-session-id <id>', 'Claude session id from hook payload')
  .action(sessionClose);

session
  .command('switch')
  .description('Switch the active session task (e.g. branch changed mid-session).')
  .option('-t, --task <task>', 'manual task label')
  .option('--ticket <id>', 'manual ticket id (e.g. LPD-12345)')
  .option('--silent', 'suppress stdout messages')
  .option('--claude-session-id <id>', 'Claude session id from hook payload')
  .action(sessionSwitch);

program
  .command('note <text>')
  .description('Append a timestamped note to the active session block.')
  .option('--claude-session-id <id>', 'Claude session id (overrides $CLAUDE_SESSION_ID)')
  .action(noteCommand);

program
  .command('status')
  .description('Show current session state.')
  .option('--json', 'machine-readable JSON output')
  .option('--claude-session-id <id>', 'inspect a specific session')
  .action(statusCommand);

program
  .command('report')
  .description('Generate a weekly report from daily logs.')
  .option('-w, --week <YYYY-Www>', 'ISO week to synthesize (default: current week)')
  .option('--dry-run', 'print prompt instead of invoking claude -p')
  .option('-o, --out <path>', 'override output path')
  .action(reportCommand);

program
  .command('update-topics')
  .description('Fold the most recent session into Tickets/ and Components/ pages (called by SessionEnd hook).')
  .option('--session <n>', 'session number to fold (default: last closed)')
  .option('--date <YYYY-MM-DD>', 'date of the session (default: today)')
  .action(updateTopicsCommand);

program
  .command('rebuild-topics')
  .description('Rebuild a topic page from scratch by scanning all daily files.')
  .option('--topic <id>', 'ticket id or component slug to rebuild')
  .option('--all-tickets', 'rebuild every ticket page')
  .option('--all-components', 'rebuild every component page')
  .option('--with-synthesis', 'invoke claude -p to synthesize a "Decisions to date" header')
  .option('--dry-run', 'print what would be written')
  .action(rebuildCommand);

program
  .command('nudge')
  .description('Emit a one-shot reminder if the active session has elapsed past the threshold with zero notes (called by UserPromptSubmit hook).')
  .option('--claude-session-id <id>', 'Claude session id (overrides $CLAUDE_SESSION_ID)')
  .option('--after-min <n>', 'minutes elapsed before nudging (default 10)')
  .action(nudgeCommand);

program
  .command('close-orphans')
  .description('Close any session blocks left with a dangling sentinel (markdown reaper).')
  .option('--date <YYYY-MM-DD>', 'restrict to a single day (default: today)')
  .option('--all', 'scan every Daily/<date>.md in the vault')
  .option('--skip-topics', 'do not fold reaped sessions into Tickets/ and Components/ pages')
  .action(closeOrphansCommand);

program.addCommand(configCommand());

program.parseAsync().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
