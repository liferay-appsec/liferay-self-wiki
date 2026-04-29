import { appendFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
const errorLogPath = join(stateHome, 'self-wiki', 'close-errors.log');

export async function logCloseError(record) {
  try {
    await mkdir(dirname(errorLogPath), { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n';
    await appendFile(errorLogPath, line, 'utf8');
  } catch {
    // never let error-logging mask the original failure
  }
}

export function getCloseErrorLogPath() {
  return errorLogPath;
}
