import { describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from './interfaces/index.js';
import { paginatedScan } from './paginatedScan.js';

function createMockWatcher(
  pages: Array<{ files: Array<Record<string, unknown>>; next?: string }>,
) {
  let callIndex = 0;
  return {
    scan: vi.fn().mockImplementation(
      (): Promise<{
        files: Array<Record<string, unknown>>;
        next?: string;
      }> => {
        const page = pages[callIndex] ?? { files: [] };
        callIndex++;
        return Promise.resolve(page);
      },
    ),
    registerRules: vi.fn(),
    unregisterRules: vi.fn(),
  } satisfies WatcherClient;
}

describe('paginatedScan', () => {
  it('returns files from a single page', async () => {
    const watcher = createMockWatcher([
      {
        files: [
          { file_path: 'a.md', modified_at: 1000, content_hash: 'h1' },
          { file_path: 'b.md', modified_at: 2000, content_hash: 'h2' },
        ],
      },
    ]);

    const result = await paginatedScan(watcher, { pathPrefix: '/test' });
    expect(result).toHaveLength(2);
    expect(result[0].file_path).toBe('a.md');
  });

  it('follows cursor across multiple pages', async () => {
    const watcher = createMockWatcher([
      {
        files: [{ file_path: 'a.md', modified_at: 1000, content_hash: 'h1' }],
        next: 'cursor1',
      },
      {
        files: [{ file_path: 'b.md', modified_at: 2000, content_hash: 'h2' }],
        next: 'cursor2',
      },
      {
        files: [{ file_path: 'c.md', modified_at: 3000, content_hash: 'h3' }],
      },
    ]);

    const result = await paginatedScan(watcher, { pathPrefix: '/test' });
    expect(result).toHaveLength(3);
    expect(watcher.scan).toHaveBeenCalledTimes(3);
  });

  it('returns empty array when no files match', async () => {
    const watcher = createMockWatcher([{ files: [] }]);
    const result = await paginatedScan(watcher, { pathPrefix: '/empty' });
    expect(result).toHaveLength(0);
  });

  it('passes filter through to watcher', async () => {
    const watcher = createMockWatcher([{ files: [] }]);
    await paginatedScan(watcher, {
      filter: { must: [{ key: 'domains', match: { value: 'synth-meta' } }] },
    });
    expect(watcher.scan).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { must: [{ key: 'domains', match: { value: 'synth-meta' } }] },
      }),
    );
  });
});
