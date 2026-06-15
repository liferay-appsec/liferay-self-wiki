import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');

const dataDir = join(dataHome, 'self-wiki');
const configDir = join(configHome, 'self-wiki');

const stateFile = join(dataDir, 'state.json');
const sessionsDir = join(dataDir, 'sessions');
const userConfigFile = join(configDir, 'config.json');

let activeVaultPath = null;

export function getStateFilePath() {
  return stateFile;
}

export function getSessionsDir() {
  return sessionsDir;
}

export function getSessionFilePath(claudeSessionId) {
  if (!claudeSessionId) throw new Error('claudeSessionId is required');
  const safe = claudeSessionId.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(sessionsDir, `${safe}.json`);
}

export function getUserConfigFilePath() {
  return userConfigFile;
}

export function setVaultPath(path) {
  activeVaultPath = path;
}

export function getVaultPath() {
  if (!activeVaultPath) {
    throw new Error('No vault configured. Run `self-wiki init <vault-path>` first, or set vaultPath via `self-wiki config vault <path>`.');
  }
  return activeVaultPath;
}

export function tryGetVaultPath() {
  return activeVaultPath;
}

export function getDailyFilePath(dateStr) {
  return join(getVaultPath(), 'Daily', `${dateStr}.md`);
}

export function getReportFilePath(weekStr) {
  return join(getVaultPath(), 'Reports', `${weekStr}.md`);
}

export function getReviewFilePath(cycleName) {
  return join(getVaultPath(), 'Reviews', `${cycleName}.md`);
}

export function getReviewFinalFilePath(cycleName) {
  return join(getVaultPath(), 'Reviews', `${cycleName}-final.md`);
}

export function getReviewManagerFilePath(cycleName) {
  return join(getVaultPath(), 'Reviews', `${cycleName}-manager.md`);
}

export function getTicketFilePath(ticketId) {
  return join(getVaultPath(), 'Tickets', `${ticketId}.md`);
}

export function getComponentFilePath(componentSlug) {
  return join(getVaultPath(), 'Components', `${componentSlug}.md`);
}

export function getVaultConfigFilePath() {
  return join(getVaultPath(), '.self-wiki', 'config.json');
}

export async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function ensureSessionsDir() {
  await mkdir(sessionsDir, { recursive: true });
}

export async function ensureConfigDir() {
  await mkdir(configDir, { recursive: true });
}

export async function ensureParentDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function ensureVaultDirs() {
  const vault = getVaultPath();
  for (const sub of ['Daily', 'Reports', 'Reviews', 'Tickets', 'Components', '.self-wiki']) {
    await mkdir(join(vault, sub), { recursive: true });
  }
}
