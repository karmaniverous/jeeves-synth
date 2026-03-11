/**
 * Croner-based scheduler that discovers the stalest meta candidate each tick
 * and enqueues it for synthesis.
 *
 * @module scheduler
 */

import { Cron } from 'croner';
import type { Logger } from 'pino';

import { listMetas } from '../discovery/index.js';
import type { SynthesisQueue } from '../queue/index.js';
import type { RuleRegistrar } from '../rules/index.js';
import { discoverStalestPath } from '../scheduling/index.js';
import type { ServiceConfig } from '../schema/config.js';
import type { HttpWatcherClient } from '../watcher-client/index.js';

const MAX_BACKOFF_MULTIPLIER = 4;

/**
 * Periodic scheduler that discovers stale meta candidates and enqueues them.
 *
 * Supports adaptive backoff when no candidates are found and hot-reloadable
 * cron expressions via {@link Scheduler.updateSchedule}.
 */
export class Scheduler {
  private job: Cron | null = null;
  private backoffMultiplier = 1;
  private tickCount = 0;
  private readonly config: ServiceConfig;
  private readonly queue: SynthesisQueue;
  private readonly logger: Logger;
  private readonly watcher: HttpWatcherClient;
  private registrar: RuleRegistrar | null = null;
  private currentExpression: string;

  constructor(
    config: ServiceConfig,
    queue: SynthesisQueue,
    logger: Logger,
    watcher: HttpWatcherClient,
  ) {
    this.config = config;
    this.queue = queue;
    this.logger = logger;
    this.watcher = watcher;
    this.currentExpression = config.schedule;
  }

  /** Set the rule registrar for watcher restart detection. */
  setRegistrar(registrar: RuleRegistrar): void {
    this.registrar = registrar;
  }

  /** Start the cron job. */
  start(): void {
    if (this.job) return;

    this.job = new Cron(this.currentExpression, () => {
      void this.tick();
    });

    this.logger.info({ schedule: this.currentExpression }, 'Scheduler started');
  }

  /** Stop the cron job. */
  stop(): void {
    if (!this.job) return;

    this.job.stop();
    this.job = null;
    this.backoffMultiplier = 1;

    this.logger.info('Scheduler stopped');
  }

  /** Hot-reload the cron schedule expression. */
  updateSchedule(expression: string): void {
    this.currentExpression = expression;

    if (this.job) {
      this.job.stop();
      this.job = new Cron(expression, () => {
        void this.tick();
      });

      this.logger.info({ schedule: expression }, 'Schedule updated');
    }
  }

  /** Reset backoff multiplier (call after successful synthesis). */
  resetBackoff(): void {
    if (this.backoffMultiplier > 1) {
      this.logger.debug('Backoff reset after successful synthesis');
    }
    this.backoffMultiplier = 1;
  }

  /** Whether the scheduler is currently running. */
  get isRunning(): boolean {
    return this.job !== null;
  }

  /** Next scheduled tick time, or null if not running. */
  get nextRunAt(): Date | null {
    if (!this.job) return null;
    return this.job.nextRun() ?? null;
  }

  /**
   * Single tick: discover stalest candidate and enqueue it.
   *
   * Skips if the queue is currently processing. Applies adaptive backoff
   * when no candidates are found.
   */
  private async tick(): Promise<void> {
    this.tickCount++;

    // Apply backoff: skip ticks when backing off
    if (
      this.backoffMultiplier > 1 &&
      this.tickCount % this.backoffMultiplier !== 0
    ) {
      this.logger.trace(
        {
          backoffMultiplier: this.backoffMultiplier,
          tickCount: this.tickCount,
        },
        'Skipping tick (backoff)',
      );
      return;
    }

    const candidate = await this.discoverStalest();

    if (!candidate) {
      this.backoffMultiplier = Math.min(
        this.backoffMultiplier * 2,
        MAX_BACKOFF_MULTIPLIER,
      );
      this.logger.debug(
        { backoffMultiplier: this.backoffMultiplier },
        'No stale candidates found, increasing backoff',
      );
      return;
    }

    this.queue.enqueue(candidate);
    this.logger.info({ path: candidate }, 'Enqueued stale candidate');

    // Opportunistic watcher restart detection
    if (this.registrar) {
      try {
        const statusRes = await fetch(
          new URL('/status', this.config.watcherUrl),
          {
            signal: AbortSignal.timeout(3000),
          },
        );
        if (statusRes.ok) {
          const status = (await statusRes.json()) as { uptime?: number };
          if (typeof status.uptime === 'number') {
            await this.registrar.checkAndReregister(status.uptime);
          }
        }
      } catch {
        // Watcher unreachable — skip uptime check
      }
    }
  }

  /**
   * Discover the stalest meta candidate via watcher.
   */
  private async discoverStalest(): Promise<string | null> {
    try {
      const result = await listMetas(this.config, this.watcher);
      const stale = result.entries
        .filter((e) => e.stalenessSeconds > 0)
        .map((e) => ({
          node: e.node,
          meta: e.meta,
          actualStaleness: e.stalenessSeconds,
        }));
      return discoverStalestPath(stale, this.config.depthWeight);
    } catch (err) {
      this.logger.warn({ err }, 'Failed to discover stalest candidate');
      return null;
    }
  }
}
