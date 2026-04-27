// Claude Code passes hook payload as JSON on stdin (e.g. {"session_id":"...", ...}).
// This helper reads stdin (when not a TTY) and returns the parsed object, or null.
// A short timeout protects against the rare case where stdin is piped but never closed.
export async function readHookInput(timeoutMs = 250) {
  if (process.stdin.isTTY) return null;
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const onData = (chunk) => {
      data += chunk;
    };
    const onEnd = () => {
      clearTimeout(timer);
      if (!data) return finish(null);
      try {
        finish(JSON.parse(data));
      } catch {
        finish(null);
      }
    };
    const onError = () => {
      clearTimeout(timer);
      finish(null);
    };
    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
      try { process.stdin.pause(); } catch {}
    };
    const finish = (value) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
}

export async function readHookSessionId() {
  const payload = await readHookInput();
  const id = payload?.session_id;
  return typeof id === 'string' && id ? id : null;
}
