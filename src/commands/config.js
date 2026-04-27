import { Command } from 'commander';
import { resolve } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { readUserConfig, writeUserConfig, readVaultConfig, writeVaultConfig } from '../core/config.js';
import { setVaultPath } from '../utils/paths.js';

export function configCommand() {
  const cmd = new Command('config').description('View or update user/vault configuration.');

  cmd
    .command('show')
    .description('Print current user + vault config.')
    .action(async () => {
      const user = await readUserConfig();
      process.stdout.write('User config:\n' + JSON.stringify(user, null, 2) + '\n');
      if (user.vaultPath) {
        try {
          setVaultPath(user.vaultPath);
          const vault = await readVaultConfig();
          process.stdout.write('\nVault config:\n' + JSON.stringify(vault, null, 2) + '\n');
        } catch (err) {
          process.stderr.write(`(could not read vault config: ${err.message})\n`);
        }
      }
    });

  cmd
    .command('vault [path]')
    .description('Get or set the active vault path.')
    .action(async (path) => {
      if (!path) {
        const cfg = await readUserConfig();
        process.stdout.write((cfg.vaultPath ?? '(unset)') + '\n');
        return;
      }
      const abs = resolve(path);
      await writeUserConfig({ vaultPath: abs });
      process.stdout.write(`vault path set to ${abs}\n`);
    });

  cmd
    .command('jira')
    .description('Configure JIRA REST integration for ticket-title enrichment (optional).')
    .option('--disable', 'turn JIRA integration off')
    .action(async (opts) => {
      if (opts.disable) {
        await writeUserConfig({ jira: { enabled: false } });
        process.stdout.write('JIRA integration disabled\n');
        return;
      }
      const rl = createInterface({ input, output });
      try {
        const baseUrl = (await rl.question('JIRA base URL (e.g. https://liferay.atlassian.net): ')).trim();
        if (!baseUrl) {
          process.stdout.write('aborted\n');
          return;
        }
        const tokenEnvVar = (await rl.question('Env var holding the API token (e.g. JIRA_TOKEN): ')).trim() || 'JIRA_TOKEN';
        await writeUserConfig({ jira: { enabled: true, baseUrl, tokenEnvVar } });
        process.stdout.write(`JIRA integration enabled. Make sure ${tokenEnvVar} is exported in your shell.\n`);
        if (!process.env[tokenEnvVar]) {
          process.stdout.write(`(warning: ${tokenEnvVar} is not set in this shell)\n`);
        }
      } finally {
        rl.close();
      }
    });

  cmd
    .command('component <slug>')
    .description('Add a component to the vault config (notes mentioning <slug> are routed to Components/<slug>.md).')
    .option('-k, --keywords <list>', 'comma-separated keywords (default: slug)')
    .action(async (slug, opts) => {
      const user = await readUserConfig();
      if (!user.vaultPath) {
        process.stderr.write('error: no vault configured. Run `self-wiki init` first.\n');
        process.exit(2);
      }
      setVaultPath(user.vaultPath);
      const cfg = await readVaultConfig();
      const components = cfg.components ?? [];
      const exists = components.some((c) => (typeof c === 'string' ? c : c.slug) === slug);
      if (exists) {
        process.stdout.write(`component "${slug}" already configured\n`);
        return;
      }
      const entry = opts.keywords
        ? { slug, keywords: opts.keywords.split(',').map((s) => s.trim()).filter(Boolean) }
        : slug;
      await writeVaultConfig({ components: [...components, entry] });
      process.stdout.write(`added component "${slug}"\n`);
    });

  return cmd;
}
