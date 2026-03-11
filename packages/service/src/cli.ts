/**
 * Commander CLI for jeeves-meta service.
 *
 * @module cli
 */

import { Command } from 'commander';

import { loadServiceConfig, resolveConfigPath } from './configLoader.js';
import { startService } from './index.js';

const program = new Command();

program.name('jeeves-meta').description('Jeeves Meta synthesis service');

// ─── start ──────────────────────────────────────────────────────────
program
  .command('start')
  .description('Start the HTTP service')
  .requiredOption('-c, --config <path>', 'Path to config JSON file')
  .action(async (opts: { config: string }) => {
    const configPath = resolveConfigPath(['-c', opts.config]);
    const config = loadServiceConfig(configPath);
    await startService(config, configPath);
  });

// ─── API client helpers ─────────────────────────────────────────────
function apiUrl(port: number, path: string): string {
  return `http://127.0.0.1:${String(port)}${path}`;
}

async function apiGet(port: number, path: string): Promise<unknown> {
  const res = await fetch(apiUrl(port, path));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${String(res.status)} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function apiPost(
  port: number,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(apiUrl(port, path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${String(res.status)} ${res.statusText}: ${text}`);
  }
  return res.json();
}

// ─── status ─────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show service status')
  .option('-p, --port <port>', 'Service port', '1938')
  .action(async (opts: { port: string }) => {
    try {
      const data = await apiGet(parseInt(opts.port, 10), '/status');
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Service unreachable:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── list ───────────────────────────────────────────────────────────
program
  .command('list')
  .description('List all discovered meta entities')
  .option('-p, --port <port>', 'Service port', '1938')
  .action(async (opts: { port: string }) => {
    try {
      const data = await apiGet(parseInt(opts.port, 10), '/metas');
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── detail ─────────────────────────────────────────────────────────
program
  .command('detail <path>')
  .description('Show full detail for a single meta entity')
  .option('-p, --port <port>', 'Service port', '1938')
  .action(async (metaPath: string, opts: { port: string }) => {
    try {
      const encoded = encodeURIComponent(metaPath);
      const data = await apiGet(parseInt(opts.port, 10), `/metas/${encoded}`);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── preview ────────────────────────────────────────────────────────
program
  .command('preview')
  .description('Dry-run: preview inputs for next synthesis cycle')
  .option('-p, --port <port>', 'Service port', '1938')
  .option('--path <path>', 'Specific meta path to preview')
  .action(async (opts: { port: string; path?: string }) => {
    try {
      const qs = opts.path ? '?path=' + encodeURIComponent(opts.path) : '';
      const data = await apiGet(parseInt(opts.port, 10), '/preview' + qs);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── synthesize ─────────────────────────────────────────────────────
program
  .command('synthesize')
  .description('Trigger synthesis (enqueues work)')
  .option('-p, --port <port>', 'Service port', '1938')
  .option('--path <path>', 'Specific meta path to synthesize')
  .action(async (opts: { port: string; path?: string }) => {
    try {
      const body = opts.path ? { path: opts.path } : {};
      const data = await apiPost(parseInt(opts.port, 10), '/synthesize', body);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── seed ───────────────────────────────────────────────────────────
program
  .command('seed <path>')
  .description('Create .meta/ directory + meta.json for a path')
  .option('-p, --port <port>', 'Service port', '1938')
  .action(async (metaPath: string, opts: { port: string }) => {
    try {
      const data = await apiPost(parseInt(opts.port, 10), '/seed', {
        path: metaPath,
      });
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── unlock ─────────────────────────────────────────────────────────
program
  .command('unlock <path>')
  .description('Remove .lock file from a meta entity')
  .option('-p, --port <port>', 'Service port', '1938')
  .action(async (metaPath: string, opts: { port: string }) => {
    try {
      const data = await apiPost(parseInt(opts.port, 10), '/unlock', {
        path: metaPath,
      });
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── validate ───────────────────────────────────────────────────────
program
  .command('validate')
  .description('Validate current or candidate config')
  .option('-p, --port <port>', 'Service port', '1938')
  .option('-c, --config <path>', 'Validate a candidate config file locally')
  .action(async (opts: { port: string; config?: string }) => {
    try {
      if (opts.config) {
        // Local validation — parse candidate file through Zod schema
        const { loadServiceConfig } = await import('./configLoader.js');
        const configPath = opts.config;
        const config = loadServiceConfig(configPath);
        const sanitized = {
          ...config,
          gatewayApiKey: config.gatewayApiKey ? '[REDACTED]' : undefined,
        };
        console.log(JSON.stringify(sanitized, null, 2));
      } else {
        // Remote — query running service
        const data = await apiGet(parseInt(opts.port, 10), '/config/validate');
        console.log(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── service install/uninstall ──────────────────────────────────────
const service = program
  .command('service')
  .description('Generate service install/uninstall instructions');

service.addCommand(
  new Command('install')
    .description('Print install instructions for a system service')
    .option('-c, --config <path>', 'Path to configuration file')
    .option('-n, --name <name>', 'Service name', 'JeevesMeta')
    .action((options: { config?: string; name: string }) => {
      const { name } = options;
      const configFlag = options.config ? ` -c "${options.config}"` : '';

      if (process.platform === 'win32') {
        console.log('# NSSM install (Windows)');
        console.log(
          `  nssm install ${name} node "%APPDATA%\\npm\\node_modules\\@karmaniverous\\jeeves-meta\\dist\\cli\\jeeves-meta\\index.js" start${configFlag}`,
        );
        console.log(`  nssm set ${name} AppDirectory "%CD%"`);
        console.log(`  nssm set ${name} DisplayName "Jeeves Meta"`);
        console.log(`  nssm set ${name} Description "Meta synthesis service"`);
        console.log(`  nssm set ${name} Start SERVICE_AUTO_START`);
        console.log(`  nssm start ${name}`);
        return;
      }

      if (process.platform === 'darwin') {
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jeeves.meta</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/jeeves-meta</string>
    <string>start</string>${options.config ? `\n    <string>-c</string>\n    <string>${options.config}</string>` : ''}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/${name}.stdout.log</string>
  <key>StandardErrorPath</key><string>/tmp/${name}.stderr.log</string>
</dict>
</plist>`;
        console.log('# launchd plist (macOS)');
        console.log(`# ~/Library/LaunchAgents/com.jeeves.meta.plist`);
        console.log(plist);
        console.log();
        console.log('# install');
        console.log(
          `  launchctl load ~/Library/LaunchAgents/com.jeeves.meta.plist`,
        );
        return;
      }

      // Linux (systemd)
      const unit = [
        '[Unit]',
        'Description=Jeeves Meta - Synthesis Service',
        'After=network.target',
        '',
        '[Service]',
        'Type=simple',
        'WorkingDirectory=%h',
        `ExecStart=/usr/bin/env jeeves-meta start${configFlag}`,
        'Restart=on-failure',
        '',
        '[Install]',
        'WantedBy=default.target',
      ].join('\n');

      console.log('# systemd unit file (Linux)');
      console.log(`# ~/.config/systemd/user/${name}.service`);
      console.log(unit);
      console.log();
      console.log('# install');
      console.log(`  systemctl --user daemon-reload`);
      console.log(`  systemctl --user enable --now ${name}.service`);
    }),
);

// start command (prints OS-specific start instructions)
service.addCommand(
  new Command('start')
    .description('Print start instructions for the installed service')
    .option('-n, --name <name>', 'Service name', 'JeevesMeta')
    .action((options: { name: string }) => {
      const { name } = options;

      if (process.platform === 'win32') {
        console.log('# NSSM start (Windows)');
        console.log(`  nssm start ${name}`);
        return;
      }

      if (process.platform === 'darwin') {
        console.log('# launchd start (macOS)');
        console.log(
          `  launchctl load ~/Library/LaunchAgents/com.jeeves.meta.plist`,
        );
        return;
      }

      console.log('# systemd start (Linux)');
      console.log(`  systemctl --user start ${name}.service`);
    }),
);

// stop command
service.addCommand(
  new Command('stop')
    .description('Stop the running service')
    .option('-n, --name <name>', 'Service name', 'JeevesMeta')
    .action((options: { name: string }) => {
      const { name } = options;

      if (process.platform === 'win32') {
        console.log('# NSSM stop (Windows)');
        console.log(`  nssm stop ${name}`);
        return;
      }

      if (process.platform === 'darwin') {
        console.log('# launchd stop (macOS)');
        console.log(
          `  launchctl unload ~/Library/LaunchAgents/com.jeeves.meta.plist`,
        );
        return;
      }

      console.log('# systemd stop (Linux)');
      console.log(`  systemctl --user stop ${name}.service`);
    }),
);

// status command (service subcommand — queries HTTP API)
service.addCommand(
  new Command('status')
    .description('Show service status via HTTP API')
    .option('-p, --port <port>', 'Service port', '1938')
    .action(async (opts: { port: string }) => {
      try {
        const data = await apiGet(parseInt(opts.port, 10), '/status');
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('Service unreachable:', (err as Error).message);
        process.exit(1);
      }
    }),
);

service.addCommand(
  new Command('remove')
    .description('Print remove instructions for a system service')
    .option('-n, --name <name>', 'Service name', 'JeevesMeta')
    .action((options: { name: string }) => {
      const { name } = options;

      if (process.platform === 'win32') {
        console.log('# NSSM remove (Windows)');
        console.log(`  nssm stop ${name}`);
        console.log(`  nssm remove ${name} confirm`);
        return;
      }

      if (process.platform === 'darwin') {
        console.log('# launchd remove (macOS)');
        console.log(
          `  launchctl unload ~/Library/LaunchAgents/com.jeeves.meta.plist`,
        );
        console.log(`  rm ~/Library/LaunchAgents/com.jeeves.meta.plist`);
        return;
      }

      console.log('# systemd remove (Linux)');
      console.log(`  systemctl --user disable --now ${name}.service`);
      console.log(`# rm ~/.config/systemd/user/${name}.service`);
      console.log(`  systemctl --user daemon-reload`);
    }),
);

program.parse();
