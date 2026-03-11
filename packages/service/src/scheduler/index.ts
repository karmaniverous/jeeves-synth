/**
 * Croner-based scheduler that discovers the stalest meta candidate each tick
 * and enqueues it for synthesis.
 *
 * @module scheduler
 */

import { Cron } from 'croner';
import type { Logger } from 'pino';

import type { SynthesisQueue } from '../queue/index.js';
import type { ServiceConfig } from '../schema/config.js';

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
  private currentExpression: string;

  constructor(config: ServiceConfig, queue: SynthesisQueue, logger: Logger) {
    this.config = config;
    this.queue = queue;
    this.logger = logger;
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
   * Discover the stalest meta candidate.
   *
   * Stub implementation — returns null. Real implementation will use
   * HttpWatcherClient + discoverMetas + selectCandidate.
   */
  private discoverStalest(): Promise<string | null> {
    this.logger.debug('Would discover stalest candidate');
    return Promise.resolve(null);
  }
}
