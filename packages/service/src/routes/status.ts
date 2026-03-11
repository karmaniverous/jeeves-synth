/**
 * GET /status — service health and status overview.
 *
 * @module routes/status
 */

import type { FastifyInstance } from 'fastify';

import type { RouteDeps } from './index.js';

export function registerStatusRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  const { config } = deps;

  app.get('/status', () => {
    return {
      service: 'jeeves-meta',
      version: '0.4.0',
      uptime: process.uptime(),
      status: 'idle',
      currentTarget: null,
      queue: { depth: 0, items: [] as string[] },
      stats: {
        totalSyntheses: 0,
        totalTokens: 0,
        totalErrors: 0,
        lastCycleDurationMs: null as number | null,
        lastCycleAt: null as string | null,
      },
      schedule: {
        expression: config.schedule,
        nextAt: null as string | null,
      },
      dependencies: {
        watcher: {
          url: config.watcherUrl,
          status: 'unknown',
          checkedAt: null as string | null,
        },
        gateway: {
          url: config.gatewayUrl,
          status: 'unknown',
          checkedAt: null as string | null,
        },
      },
      metas: {
        total: 0,
        stale: 0,
        errors: 0,
        neverSynthesized: 0,
      },
    };
  });
}
