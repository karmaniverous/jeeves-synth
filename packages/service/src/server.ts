/**
 * Minimal Fastify HTTP server for jeeves-meta service.
 *
 * Module: server
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { SynthesisQueue } from './queue/index.js';
import { registerRoutes } from './routes/index.js';
import type { ServiceConfig } from './schema/config.js';

/** Options for creating the server. */
export interface ServerOptions {
  /** Pino logger instance. */
  logger: Logger;
  /** Synthesis queue instance. */
  queue: SynthesisQueue;
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
    queue: options.queue,
  });

  return app;
}
