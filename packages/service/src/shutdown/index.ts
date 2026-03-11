/**
 * Graceful shutdown handler.
 *
 * On SIGTERM/SIGINT: stops scheduler, drains queue, cleans up locks.
 *
 * @module shutdown
 */

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import { releaseLock } from '../lock.js';
import type { SynthesisQueue } from '../queue/index.js';
import type { RouteDeps } from '../routes/index.js';
import type { Scheduler } from '../scheduler/index.js';

export interface ShutdownDeps {
  server: FastifyInstance;
  scheduler: Scheduler | null;
  queue: SynthesisQueue;
  logger: Logger;
  routeDeps?: RouteDeps;
}

/**
 * Register shutdown handlers for SIGTERM and SIGINT.
 *
 * Flow:
 * 1. Stop scheduler (no new ticks)
 * 2. If synthesis in progress, release its lock
 * 3. Close Fastify server
 * 4. Exit
 */
export function registerShutdownHandlers(deps: ShutdownDeps): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    deps.logger.info({ signal }, 'Shutdown signal received');

    // Signal stopping state to /status
    if (deps.routeDeps) {
      deps.routeDeps.shuttingDown = true;
    }

    // 1. Stop scheduler
    if (deps.scheduler) {
      deps.scheduler.stop();
      deps.logger.info('Scheduler stopped');
    }

    // 2. Release lock for in-progress synthesis
    const current = deps.queue.current;
    if (current) {
      try {
        releaseLock(current.path);
        deps.logger.info(
          { path: current.path },
          'Released lock for in-progress synthesis',
        );
      } catch {
        deps.logger.warn(
          { path: current.path },
          'Failed to release lock during shutdown',
        );
      }
    }

    // 3. Close server
    try {
      await deps.server.close();
      deps.logger.info('HTTP server closed');
    } catch (err) {
      deps.logger.error(err, 'Error closing HTTP server');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
