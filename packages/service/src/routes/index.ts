/**
 * Route registration for jeeves-meta service.
 *
 * @module routes
 */

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { SynthesisQueue } from '../queue/index.js';
import type { Scheduler } from '../scheduler/index.js';
import type { ServiceConfig } from '../schema/config.js';
import type { HttpWatcherClient } from '../watcher-client/index.js';
import { registerConfigValidateRoute } from './configValidate.js';
import { registerMetasRoutes } from './metas.js';
import { registerPreviewRoute } from './preview.js';
import { registerSeedRoute } from './seed.js';
import { registerStatusRoute } from './status.js';
import { registerSynthesizeRoute } from './synthesize.js';
import { registerUnlockRoute } from './unlock.js';

/** Runtime stats tracked by the service. */
export interface ServiceStats {
  totalSyntheses: number;
  totalTokens: number;
  totalErrors: number;
  lastCycleDurationMs: number | null;
  lastCycleAt: string | null;
}

/** Dependencies injected into route handlers. */
export interface RouteDeps {
  config: ServiceConfig;
  logger: Logger;
  queue: SynthesisQueue;
  watcher: HttpWatcherClient;
  scheduler: Scheduler | null;
  stats: ServiceStats;
  /** Set to true during graceful shutdown. */
  shuttingDown?: boolean;
}

/** Register all HTTP routes on the Fastify instance. */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  // Global error handler for validation + watcher errors
  app.setErrorHandler(
    (
      error: Error & { validation?: unknown; statusCode?: number },
      _request,
      reply,
    ) => {
      if (error.validation) {
        return reply
          .status(400)
          .send({ error: 'BAD_REQUEST', message: error.message });
      }
      if (error.statusCode === 404) {
        return reply
          .status(404)
          .send({ error: 'NOT_FOUND', message: error.message });
      }
      deps.logger.error(error, 'Unhandled route error');
      return reply
        .status(500)
        .send({ error: 'INTERNAL_ERROR', message: error.message });
    },
  );

  registerStatusRoute(app, deps);
  registerMetasRoutes(app, deps);
  registerSynthesizeRoute(app, deps);
  registerPreviewRoute(app, deps);
  registerSeedRoute(app, deps);
  registerUnlockRoute(app, deps);
  registerConfigValidateRoute(app, deps);
}
