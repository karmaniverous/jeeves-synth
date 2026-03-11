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
import {
  computeEffectiveStaleness,
  selectCandidate,
} from '../scheduling/index.js';
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
  private readonly config: ServiceConfig;
  private readonly queue: SynthesisQueue;
  private readonly logger: Logger;
  private readonly watcher: HttpWatcherClient;
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
    if (this.queue.current !== null) {
      this.logger.trace('Queue is processing, skipping tick');
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

    this.backoffMultiplier = 1;
    this.queue.enqueue(candidate);
    this.logger.info({ path: candidate }, 'Enqueued stale candidate');
  }

  /**
   * Discover the stalest meta candidate via watcher.
   */
  private async discoverStalest(): Promise<string | null> {
    try {
      const result = await listMetas(this.config, this.watcher);
      const candidates = result.entries
        .filter((e) => e.stalenessSeconds > 0)
        .map((e) => ({
          node: e.node,
          meta: e.meta,
          actualStaleness: e.stalenessSeconds,
        }));

      const weighted = computeEffectiveStaleness(
        candidates,
        this.config.depthWeight,
      );
      const winner = selectCandidate(weighted);

      if (!winner) return null;
      return winner.node.metaPath;
    } catch (err) {
      this.logger.warn({ err }, 'Failed to discover stalest candidate');
      return null;
    }
  }
}
