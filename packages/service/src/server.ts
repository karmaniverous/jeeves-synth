/**
 * Minimal Fastify HTTP server for jeeves-meta service.
 *
 * @module server
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

/** Options for creating the server. */
export interface ServerOptions {
  /** Pino logger instance. */
  logger: Logger;
}

/** Shape of the /status response body. */
interface StatusResponse {
  service: string;
  version: string;
  uptime: number;
  status: 'idle';
}

const SERVICE_NAME = '@karmaniverous/jeeves-meta-service';
const SERVICE_VERSION = '0.3.3';

/**
 * Create and configure the Fastify server.
 *
 * @param options - Server creation options.
 * @returns Configured Fastify instance (not yet listening).
 */
export function createServer(options: ServerOptions): FastifyInstance {
  const startTime = Date.now();

  const app = Fastify({ logger: options.logger });

  app.get<{ Reply: StatusResponse }>('/status', () => {
    return {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      status: 'idle',
    };
  });

  return app;
}
