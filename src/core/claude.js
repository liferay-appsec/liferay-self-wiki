import { spawn } from 'child_process';

export async function claudeHeadless(prompt, opts = {}) {
  const args = ['-p'];
  if (opts.model) args.push('--model', opts.model);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}`));
        return;
      }
      resolve(out.trim());
    });
    child.stdin.end(prompt, 'utf8');
  });
}

export async function hasClaudeCli() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}
