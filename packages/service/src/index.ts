/**
 * Jeeves Meta Service entry point.
 *
 * @module index
 */

export { loadServiceConfig, resolveConfigPath } from './configLoader.js';
export type { LoggerConfig } from './logger/index.js';
export { createLogger } from './logger/index.js';
export type { ServiceConfig } from './schema/config.js';
export { serviceConfigSchema } from './schema/config.js';
export type { ServerOptions } from './server.js';
export { createServer } from './server.js';

import { createLogger } from './logger/index.js';
import { type ServiceConfig } from './schema/config.js';
import { createServer } from './server.js';

/**
 * Bootstrap the service: create logger, build server, start listening.
 *
 * @param config - Validated service configuration.
 */
export async function startService(config: ServiceConfig): Promise<void> {
  const logger = createLogger({
    level: config.logging.level,
    file: config.logging.file,
  });

  const server = createServer({ logger });

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'Service listening');
  } catch (err) {
    logger.error(err, 'Failed to start service');
    process.exit(1);
  }
}
