import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SynthesisQueue } from '../queue/index.js';
import { Scheduler } from './index.js';

function createTestLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
  } as unknown as Logger;
}

function createTestConfig() {
  return {
    watcherUrl: 'http://localhost:3456',
    gatewayUrl: 'http://127.0.0.1:18789',
    architectEvery: 10,
    depthWeight: 0.5,
    maxArchive: 20,
    maxLines: 500,
    architectTimeout: 120,
    builderTimeout: 600,
    criticTimeout: 300,
    thinking: 'low',
    defaultArchitect: 'You are the architect...',
    defaultCritic: 'You are the critic...',
    skipUnchanged: true,
    metaProperty: { _meta: 'current' },
    metaArchiveProperty: { _meta: 'archive' },
    port: 1938,
    schedule: '* * * * *',
    logging: { level: 'info' },
  };
}

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let queue: SynthesisQueue;
  let logger: Logger;

  beforeEach(() => {
    logger = createTestLogger();
    queue = new SynthesisQueue(logger);
    scheduler = new Scheduler(createTestConfig(), queue, logger);
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('starts and stops cleanly', () => {
    expect(scheduler.isRunning).toBe(false);

    scheduler.start();
    expect(scheduler.isRunning).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });

  it('reports nextRunAt when running', () => {
    expect(scheduler.nextRunAt).toBeNull();

    scheduler.start();
    expect(scheduler.nextRunAt).toBeInstanceOf(Date);

    scheduler.stop();
    expect(scheduler.nextRunAt).toBeNull();
  });

  it('tick is a no-op when stub returns null', async () => {
    scheduler.start();

    // Manually invoke tick via the private method.
    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    // Queue should remain empty since discoverStalest returns null.
    expect(queue.depth).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(
      'Would discover stalest candidate',
    );
  });

  it('updateSchedule changes the schedule', () => {
    scheduler.start();
    const firstNext = scheduler.nextRunAt;

    scheduler.updateSchedule('0 0 1 1 *');
    const secondNext = scheduler.nextRunAt;

    expect(scheduler.isRunning).toBe(true);
    expect(secondNext).not.toEqual(firstNext);
  });
});
