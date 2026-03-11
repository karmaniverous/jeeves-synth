import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SynthesisQueue } from './index.js';

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

describe('SynthesisQueue', () => {
  let queue: SynthesisQueue;
  let logger: Logger;

  beforeEach(() => {
    logger = createTestLogger();
    queue = new SynthesisQueue(logger);
  });

  it('enqueue adds items', () => {
    const result = queue.enqueue('/meta/a');
    expect(result.alreadyQueued).toBe(false);
    expect(result.position).toBe(0);
    expect(queue.depth).toBe(1);

    const result2 = queue.enqueue('/meta/b');
    expect(result2.position).toBe(1);
    expect(queue.depth).toBe(2);
  });

  it('priority items go to front', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    const result = queue.enqueue('/meta/c', true);

    expect(result.position).toBe(0);
    expect(queue.items[0]?.path).toBe('/meta/c');
    expect(queue.items[0]?.priority).toBe(true);
  });

  it('deduplication returns existing position', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');

    const result = queue.enqueue('/meta/b');
    expect(result.alreadyQueued).toBe(true);
    expect(result.position).toBe(1);
    expect(queue.depth).toBe(3);
  });

  it('dequeue returns items in order (priority first)', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/priority', true);

    const first = queue.dequeue();
    expect(first?.path).toBe('/meta/priority');

    const second = queue.dequeue();
    expect(second?.path).toBe('/meta/a');

    const third = queue.dequeue();
    expect(third?.path).toBe('/meta/b');
  });

  it('complete clears current', () => {
    queue.enqueue('/meta/a');
    queue.dequeue();
    expect(queue.current?.path).toBe('/meta/a');

    queue.complete();
    expect(queue.current).toBeNull();
  });

  it('depth reflects queue size', () => {
    expect(queue.depth).toBe(0);
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    expect(queue.depth).toBe(2);

    queue.dequeue(); // moves to current, not counted
    expect(queue.depth).toBe(1);
  });

  it('has checks both queue and current', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    expect(queue.has('/meta/a')).toBe(true);
    expect(queue.has('/meta/b')).toBe(true);
    expect(queue.has('/meta/c')).toBe(false);

    queue.dequeue(); // /meta/a becomes current
    expect(queue.has('/meta/a')).toBe(true); // still found as current
    expect(queue.has('/meta/b')).toBe(true); // still in queue
  });

  it('processQueue processes all items', async () => {
    const processed: string[] = [];
    const synthesizeFn = (path: string) => {
      processed.push(path);
      return Promise.resolve();
    };

    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');

    await queue.processQueue(synthesizeFn);

    expect(processed).toEqual(['/meta/a', '/meta/b', '/meta/c']);
    expect(queue.depth).toBe(0);
    expect(queue.current).toBeNull();
  });

  it('processQueue continues after errors', async () => {
    const processed: string[] = [];
    const synthesizeFn = (path: string) => {
      if (path === '/meta/b')
        return Promise.reject(new Error('synthesis failed'));
      processed.push(path);
      return Promise.resolve();
    };

    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');

    await queue.processQueue(synthesizeFn);

    expect(processed).toEqual(['/meta/a', '/meta/c']);
    expect(queue.depth).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('processQueue is single-threaded (re-entry guard)', async () => {
    let concurrency = 0;
    let maxConcurrency = 0;

    const synthesizeFn = async () => {
      concurrency++;
      maxConcurrency = Math.max(maxConcurrency, concurrency);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrency--;
    };

    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');

    // Start processing, then try to re-enter.
    const p1 = queue.processQueue(synthesizeFn);
    const p2 = queue.processQueue(synthesizeFn);

    await Promise.all([p1, p2]);

    expect(maxConcurrency).toBe(1);
  });

  it('deduplication detects current item', () => {
    queue.enqueue('/meta/a');
    queue.dequeue(); // /meta/a is now current

    const result = queue.enqueue('/meta/a');
    expect(result.alreadyQueued).toBe(true);
    expect(result.position).toBe(0);
  });

  it('warns when queue depth exceeds threshold', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');
    expect(logger.warn).not.toHaveBeenCalled();

    queue.enqueue('/meta/d');
    expect(logger.warn).toHaveBeenCalledWith(
      { depth: 4 },
      'Queue depth exceeds threshold',
    );
  });

  it('getState returns queue snapshot', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b', true);

    const state = queue.getState();
    expect(state.depth).toBe(2);
    expect(state.items).toHaveLength(2);
    expect(state.items[0]?.path).toBe('/meta/b');
    expect(state.items[1]?.path).toBe('/meta/a');
  });

  it('getPosition returns index or null', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');

    expect(queue.getPosition('/meta/a')).toBe(0);
    expect(queue.getPosition('/meta/b')).toBe(1);
    expect(queue.getPosition('/meta/c')).toBeNull();
  });
});
