/**
 * Commander CLI for jeeves-meta service.
 *
 * @module cli
 */

import { Command } from 'commander';

import { loadServiceConfig, resolveConfigPath } from './configLoader.js';
import { startService } from './index.js';

const program = new Command();

program
  .name('jeeves-meta-service')
  .description('Jeeves Meta synthesis service');

program
  .command('start')
  .description('Start the HTTP service')
  .requiredOption('--config <path>', 'Path to config JSON file')
  .action(async (opts: { config: string }) => {
    const configPath = resolveConfigPath(['--config', opts.config]);
    const config = loadServiceConfig(configPath);
    await startService(config);
  });

program
  .command('stop')
  .description('Stop the running service (stub)')
  .action(() => {
    console.log('stop: not yet implemented');
  });

program
  .command('status')
  .description('Show service status (stub)')
  .action(() => {
    console.log('status: not yet implemented');
  });

program.parse();
