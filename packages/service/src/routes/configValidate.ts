/**
 * GET /config/validate — return sanitized service configuration.
 *
 * @module routes/configValidate
 */

import type { FastifyInstance } from 'fastify';

import type { RouteDeps } from './index.js';

export function registerConfigValidateRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get('/config/validate', () => {
    const sanitized = {
      ...deps.config,
      gatewayApiKey: deps.config.gatewayApiKey ? '[REDACTED]' : undefined,
    };

    return sanitized;
  });
}
