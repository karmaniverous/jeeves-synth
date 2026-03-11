/**
 * Single-threaded synthesis queue with priority support and deduplication.
 *
 * The scheduler enqueues the stalest candidate each tick. HTTP-triggered
 * synthesis requests get priority (inserted at front). A path appears at
 * most once in the queue; re-triggering returns the current position.
 *
 * @module queue
 */

import type { Logger } from 'pino';

/** A queued synthesis work item. */
export interface QueueItem {
  path: string;
  priority: boolean;
  enqueuedAt: string;
}

/** Result returned by {@link SynthesisQueue.enqueue}. */
export interface EnqueueResult {
  position: number;
  alreadyQueued: boolean;
}

/** Snapshot of queue state for the /status endpoint. */
export interface QueueState {
  depth: number;
  items: Array<{ path: string; priority: boolean; enqueuedAt: string }>;
}

const DEPTH_WARNING_THRESHOLD = 3;

/**
 * Single-threaded synthesis queue.
 *
 * Only one synthesis runs at a time. Priority items are inserted at the
 * front of the queue. Duplicate paths are rejected with their current
 * position returned.
 */
export class SynthesisQueue {
  private queue: QueueItem[] = [];
  private currentItem: QueueItem | null = null;
  private processing = false;
  private logger: Logger;
  private onEnqueueCallback: (() => void) | null = null;

  /**
   * Create a new SynthesisQueue.
   *
   * @param logger - Pino logger instance.
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Set a callback to invoke when a new (non-duplicate) item is enqueued.
   */
  onEnqueue(callback: () => void): void {
    this.onEnqueueCallback = callback;
  }

  /**
   * Add a path to the synthesis queue.
   *
   * @param path - Meta path to synthesize.
   * @param priority - If true, insert at front of queue.
   * @returns Position and whether the path was already queued.
   */
  enqueue(path: string, priority = false): EnqueueResult {
    // Check if currently being synthesized.
    if (this.currentItem?.path === path) {
      return { position: 0, alreadyQueued: true };
    }

    // Check if already in queue.
    const existingIndex = this.queue.findIndex((item) => item.path === path);
    if (existingIndex !== -1) {
      return { position: existingIndex, alreadyQueued: true };
    }

    const item: QueueItem = {
      path,
      priority,
      enqueuedAt: new Date().toISOString(),
    };

    if (priority) {
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }

    if (this.queue.length > DEPTH_WARNING_THRESHOLD) {
      this.logger.warn(
        { depth: this.queue.length },
        'Queue depth exceeds threshold',
      );
    }

    const position = this.queue.findIndex((i) => i.path === path);
    this.onEnqueueCallback?.();
    return { position, alreadyQueued: false };
  }

  /**
   * Remove and return the next item from the queue.
   *
   * @returns The next QueueItem, or undefined if the queue is empty.
   */
  dequeue(): QueueItem | undefined {
    const item = this.queue.shift();
    if (item) {
      this.currentItem = item;
    }
    return item;
  }

  /** Mark the currently-running synthesis as complete. */
  complete(): void {
    this.currentItem = null;
  }

  /** Number of items waiting in the queue (excludes current). */
  get depth(): number {
    return this.queue.length;
  }

  /** The item currently being synthesized, or null. */
  get current(): QueueItem | null {
    return this.currentItem;
  }

  /** A shallow copy of the queued items. */
  get items(): QueueItem[] {
    return [...this.queue];
  }

  /**
   * Check whether a path is in the queue or currently being synthesized.
   *
   * @param path - Meta path to look up.
   * @returns True if the path is queued or currently running.
   */
  has(path: string): boolean {
    if (this.currentItem?.path === path) return true;
    return this.queue.some((item) => item.path === path);
  }

  /**
   * Get the 0-indexed position of a path in the queue.
   *
   * @param path - Meta path to look up.
   * @returns Position index, or null if not found in the queue.
   */
  getPosition(path: string): number | null {
    const index = this.queue.findIndex((item) => item.path === path);
    return index === -1 ? null : index;
  }

  /**
   * Return a snapshot of queue state for the /status endpoint.
   *
   * @returns Queue depth and item list.
   */
  getState(): QueueState {
    return {
      depth: this.queue.length,
      items: this.queue.map((item) => ({
        path: item.path,
        priority: item.priority,
        enqueuedAt: item.enqueuedAt,
      })),
    };
  }

  /**
   * Process queued items one at a time until the queue is empty.
   *
   * Re-entry is prevented: if already processing, the call returns
   * immediately. Errors are logged and do not block subsequent items.
   *
   * @param synthesizeFn - Async function that performs synthesis for a path.
   */
  async processQueue(
    synthesizeFn: (path: string) => Promise<void>,
  ): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    try {
      let item = this.dequeue();
      while (item) {
        try {
          await synthesizeFn(item.path);
        } catch (err) {
          this.logger.error({ path: item.path, err }, 'Synthesis failed');
        }
        this.complete();
        item = this.dequeue();
      }
    } finally {
      this.processing = false;
    }
  }
}
