/**
 * Minimal Fastify HTTP server for jeeves-meta service.
 *
 * @module server
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import { registerRoutes } from './routes/index.js';
import type { ServiceConfig } from './schema/config.js';

/** Options for creating the server. */
export interface ServerOptions {
  /** Pino logger instance. */
  logger: Logger;
  /** Validated service configuration. */
  config: ServiceConfig;
}

/**
 * Create and configure the Fastify server.
 *
 * @param options - Server creation options.
 * @returns Configured Fastify instance (not yet listening).
 */
export function createServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger });

  registerRoutes(app, {
    config: options.config,
    logger: options.logger,
  });

  return app;
}
