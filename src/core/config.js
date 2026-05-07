import { readFile, writeFile } from 'fs/promises';
import {
  getUserConfigFilePath,
  getVaultConfigFilePath,
  ensureConfigDir,
  ensureParentDir,
  setVaultPath,
  tryGetVaultPath,
} from '../utils/paths.js';

const USER_DEFAULTS = {
  vaultPath: null,
  jira: { enabled: false, baseUrl: null, tokenEnvVar: null },
};

const VAULT_DEFAULTS = {
  ticketRegex: '\\b(LPD|LPP|LPS|LRELEASE)-\\d+\\b',
  branchTicketRegex: '(?:^|[/_-])((?:LPD|LPP|LPS|LRELEASE)-\\d+)(?:[/_-]|$)',
  components: [],
  softCloseMinutes: 5,
  review: { cycleEndMonths: [5, 9, 12], lastReviewedAt: null, lastReviewedCycle: null },
};

export async function readUserConfig() {
  try {
    const raw = await readFile(getUserConfigFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...USER_DEFAULTS, ...parsed, jira: { ...USER_DEFAULTS.jira, ...(parsed.jira ?? {}) } };
  } catch {
    return { ...USER_DEFAULTS };
  }
}

export async function writeUserConfig(patch) {
  await ensureConfigDir();
  const current = await readUserConfig();
  const next = { ...current, ...patch };
  if (patch.jira) {
    next.jira = { ...current.jira, ...patch.jira };
  }
  await writeFile(getUserConfigFilePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function readVaultConfig() {
  try {
    const raw = await readFile(getVaultConfigFilePath(), 'utf8');
    return { ...VAULT_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...VAULT_DEFAULTS };
  }
}

export async function writeVaultConfig(patch) {
  const current = await readVaultConfig();
  const next = { ...current, ...patch };
  if (patch.review) {
    next.review = { ...current.review, ...patch.review };
  }
  const path = getVaultConfigFilePath();
  await ensureParentDir(path);
  await writeFile(path, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function applyUserConfig() {
  const cfg = await readUserConfig();
  if (cfg.vaultPath) setVaultPath(cfg.vaultPath);
  return cfg;
}

export function ensureVaultConfigured() {
  if (!tryGetVaultPath()) {
    process.stderr.write('error: no vault configured. Run `self-wiki init <vault-path>` or `self-wiki config vault <path>`.\n');
    process.exit(2);
  }
}

export function getVaultDefaults() {
  return structuredClone(VAULT_DEFAULTS);
}
