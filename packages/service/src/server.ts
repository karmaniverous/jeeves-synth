/**
 * Minimal Fastify HTTP server for jeeves-meta service.
 *
 * @module server
 */

import Fastify, { type FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';

import type { SynthesisQueue } from './queue/index.js';
import { registerRoutes, type ServiceStats } from './routes/index.js';
import type { Scheduler } from './scheduler/index.js';
import type { ServiceConfig } from './schema/config.js';
import type { HttpWatcherClient } from './watcher-client/index.js';

/** Options for creating the server. */
export interface ServerOptions {
  /** Pino logger instance. */
  logger: Logger;
  /** Synthesis queue instance. */
  queue: SynthesisQueue;
  /** Validated service configuration. */
  config: ServiceConfig;
  /** Watcher client for data queries. */
  watcher: HttpWatcherClient;
  /** Scheduler instance (null during tests). */
  scheduler: Scheduler | null;
  /** Mutable runtime stats. */
  stats: ServiceStats;
}

/**
 * Create and configure the Fastify server.
 *
 * @param options - Server creation options.
 * @returns Configured Fastify instance (not yet listening).
 */
export function createServer(options: ServerOptions) {
  // Fastify 5 requires `loggerInstance` for external pino loggers
  const app = Fastify({ loggerInstance: options.logger as unknown as FastifyBaseLogger });

  registerRoutes(app, {
    config: options.config,
    logger: options.logger,
    queue: options.queue,
    watcher: options.watcher,
    scheduler: options.scheduler,
    stats: options.stats,
  });

  return app;
}
