import { spawn } from 'child_process';

// Default timeouts. claude -p does real model work and can legitimately
// take a few minutes; --version is a noop and should return immediately.
// SIGTERM grace period is short — a hung child does not deserve more.
const DEFAULT_HEADLESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const DEFAULT_VERSION_TIMEOUT_MS = 5 * 1000;       // 5 s
const SIGKILL_GRACE_MS = 2 * 1000;                 // 2 s after SIGTERM

function killWithGrace(child) {
  // SIGTERM, then SIGKILL after grace. Both calls no-op post-exit, so the
  // timer is safe on a normal close.
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
  setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }, SIGKILL_GRACE_MS).unref();
}

export async function claudeHeadless(prompt, opts = {}) {
  const args = ['-p'];
  if (opts.model) args.push('--model', opts.model);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HEADLESS_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, SELF_WIKI_HEADLESS: '1' },
    });
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killWithGrace(child);
      reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();

    child.stdout.on('data', (chunk) => { out += chunk.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (timedOut) return; // already rejected
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return; // already rejected
      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}`));
        return;
      }
      resolve(out.trim());
    });
    child.stdin.end(prompt, 'utf8');
  });
}

export async function hasClaudeCli(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VERSION_TIMEOUT_MS;
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { stdio: 'ignore' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killWithGrace(child);
      resolve(false); // hung claude binary is not "available" for our purposes
    }, timeoutMs);
    timer.unref();

    child.on('error', () => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve(code === 0);
    });
  });
}
