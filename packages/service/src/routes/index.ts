/**
 * Route registration for jeeves-meta service.
 *
 * @module routes
 */

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { ServiceConfig } from '../schema/config.js';
import { registerConfigValidateRoute } from './configValidate.js';
import { registerMetasRoutes } from './metas.js';
import { registerPreviewRoute } from './preview.js';
import { registerSeedRoute } from './seed.js';
import { registerStatusRoute } from './status.js';
import { registerSynthesizeRoute } from './synthesize.js';
import { registerUnlockRoute } from './unlock.js';

/** Dependencies injected into route handlers. */
export interface RouteDeps {
  config: ServiceConfig;
  logger: Logger;
}

/** Register all HTTP routes on the Fastify instance. */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  registerStatusRoute(app, deps);
  registerMetasRoutes(app);
  registerSynthesizeRoute(app);
  registerPreviewRoute(app);
  registerSeedRoute(app, deps);
  registerUnlockRoute(app, deps);
  registerConfigValidateRoute(app, deps);
}
