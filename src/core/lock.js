import lockfile from 'proper-lockfile';
import { writeFile, access } from 'fs/promises';
import { ensureParentDir } from '../utils/paths.js';

const LOCK_OPTS = {
  retries: { retries: 50, factor: 1.2, minTimeout: 10, maxTimeout: 200 },
  stale: 30_000,
  realpath: false,
};

export async function withLock(filePath, fn) {
  await ensureParentDir(filePath);
  await ensureExists(filePath);
  const release = await lockfile.lock(filePath, LOCK_OPTS);
  try {
    return await fn();
  } finally {
    try {
      await release();
    } catch {
      // already released or stale-cleaned; not fatal
    }
  }
}

async function ensureExists(filePath) {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, '', { flag: 'a' });
  }
}
