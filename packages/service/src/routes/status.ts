/**
 * GET /status — service health and status overview.
 *
 * On-demand dependency health checks (lightweight ping).
 *
 * @module routes/status
 */

import type { FastifyInstance } from 'fastify';

import { listMetas } from '../discovery/index.js';
import type { RouteDeps } from './index.js';

interface DepHealth {
  url: string;
  status: string;
  checkedAt: string | null;
}

async function checkDependency(url: string, path: string): Promise<DepHealth> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(new URL(path, url), {
      signal: AbortSignal.timeout(3000),
    });
    return { url, status: res.ok ? 'ok' : 'error', checkedAt };
  } catch {
    return { url, status: 'unreachable', checkedAt };
  }
}

export function registerStatusRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get('/status', async () => {
    const { config, queue, scheduler, stats, watcher } = deps;

    // On-demand dependency checks
    const [watcherHealth, gatewayHealth] = await Promise.all([
      checkDependency(config.watcherUrl, '/status'),
      checkDependency(config.gatewayUrl, '/api/status'),
    ]);

    const degraded =
      watcherHealth.status !== 'ok' || gatewayHealth.status !== 'ok';

    // Determine status
    let status: string;
    if (deps.shuttingDown) {
      status = 'stopping';
    } else if (queue.current) {
      status = 'synthesizing';
    } else if (degraded) {
      status = 'degraded';
    } else {
      status = 'idle';
    }

    // Metas summary from listMetas (already computed)
    let metasSummary = { total: 0, stale: 0, errors: 0, neverSynthesized: 0 };
    try {
      const result = await listMetas(config, watcher);
      metasSummary = {
        total: result.summary.total,
        stale: result.summary.stale,
        errors: result.summary.errors,
        neverSynthesized: result.summary.neverSynthesized,
      };
    } catch {
      // Watcher unreachable — leave zeros
    }

    return {
      service: 'jeeves-meta',
      version: '0.4.0',
      uptime: process.uptime(),
      status,
      currentTarget: queue.current?.path ?? null,
      queue: queue.getState(),
      stats: {
        totalSyntheses: stats.totalSyntheses,
        totalTokens: stats.totalTokens,
        totalErrors: stats.totalErrors,
        lastCycleDurationMs: stats.lastCycleDurationMs,
        lastCycleAt: stats.lastCycleAt,
      },
      schedule: {
        expression: config.schedule,
        nextAt: scheduler?.nextRunAt?.toISOString() ?? null,
      },
      dependencies: {
        watcher: watcherHealth,
        gateway: gatewayHealth,
      },
      metas: metasSummary,
    };
  });
}
