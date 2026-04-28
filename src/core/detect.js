import { execFile } from 'child_process';
import { promisify } from 'util';
import { basename } from 'path';
import { escapeRegex } from '../utils/regex.js';

const exec = promisify(execFile);

export async function detectTask({ cwd = process.cwd(), vaultConfig, userConfig } = {}) {
  const branchTicketRe = new RegExp(vaultConfig.branchTicketRegex, 'i');
  const ticketRe = new RegExp(vaultConfig.ticketRegex);

  const branch = await tryGitBranch(cwd);
  const ticketFromBranch = branch && (branch.match(branchTicketRe)?.[1] ?? branch.match(ticketRe)?.[0]);
  const repo = basename(cwd);

  let ticketTitle = null;
  let prInfo = null;

  if (await hasGh()) {
    prInfo = await tryGhPrView(cwd);
    if (prInfo?.title && !ticketTitle) {
      const m = prInfo.title.match(ticketRe);
      if (m && (!ticketFromBranch || ticketFromBranch === m[0])) {
        ticketTitle = stripTicketPrefix(prInfo.title, m[0]);
      } else if (!ticketFromBranch) {
        ticketTitle = prInfo.title;
      }
    }
  }

  const ticketId = ticketFromBranch
    ? ticketFromBranch.toUpperCase()
    : (prInfo?.title?.match(ticketRe)?.[0] ?? null);

  if (ticketId && userConfig?.jira?.enabled && !ticketTitle) {
    ticketTitle = await tryJiraTitle(ticketId, userConfig.jira).catch(() => null);
  }

  const task = ticketTitle ?? prInfo?.title ?? branch ?? repo;
  return { ticketId: ticketId ? ticketId.toUpperCase() : null, task, branch, repo, prNumber: prInfo?.number ?? null };
}

async function tryGitBranch(cwd) {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    const branch = stdout.trim();
    return branch === 'HEAD' ? null : branch;
  } catch {
    return null;
  }
}

async function hasGh() {
  try {
    await exec('gh', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function tryGhPrView(cwd) {
  try {
    const { stdout } = await exec('gh', ['pr', 'view', '--json', 'number,title,url'], { cwd });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function tryJiraTitle(ticketId, jiraCfg) {
  if (!jiraCfg.baseUrl) return null;
  const token = jiraCfg.tokenEnvVar ? process.env[jiraCfg.tokenEnvVar] : null;
  if (!token) return null;
  const url = `${jiraCfg.baseUrl.replace(/\/$/, '')}/rest/api/2/issue/${encodeURIComponent(ticketId)}?fields=summary`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.fields?.summary ?? null;
}

function stripTicketPrefix(title, ticketId) {
  return title.replace(new RegExp(`^${escapeRegex(ticketId)}\\s*[—:\\-]\\s*`, 'i'), '').trim();
}
