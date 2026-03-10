import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ScanParams,
  ScanResponse,
  WatcherClient,
} from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';
import type { MetaConfig } from '../schema/index.js';
import { listMetas } from './listMetas.js';

// Minimal valid config for testing
function makeConfig(overrides: Partial<MetaConfig> = {}): MetaConfig {
  return {
    watcherUrl: 'http://localhost:1936',
    gatewayUrl: 'http://localhost:3000',
    gatewayApiKey: 'test',
    defaultArchitect: 'architect prompt',
    defaultCritic: 'critic prompt',
    architectEvery: 5,
    architectTimeout: 60000,
    builderTimeout: 60000,
    criticTimeout: 60000,
    thinking: 'low',
    batchSize: 1,
    maxLines: 500,
    maxArchive: 10,
    depthWeight: 0.5,
    skipUnchanged: false,
    metaProperty: { domains: ['synth-meta'] },
    metaArchiveProperty: { domains: ['meta-archive'] },
    ...overrides,
  };
}

/** Create a mock watcher that returns the given meta paths (simulating watcher scan results). */
function mockWatcher(metaPaths: string[]): WatcherClient {
  return {
    scan: (params: ScanParams): Promise<ScanResponse> => {
      // Only respond to discovery scans (filter contains synth-meta domain match)
      const filterStr = JSON.stringify(params.filter ?? {});
      if (filterStr.includes('synth-meta')) {
        // Return one point per meta path (simulating single-chunk files)
        return Promise.resolve({
          files: metaPaths.map((mp) => ({
            file_path: mp + '/meta.json',
            modified_at: 1000,
            content_hash: 'abc',
          })),
        });
      }
      return Promise.resolve({ files: [] });
    },
    registerRules: () => Promise.resolve(),
    unregisterRules: () => Promise.resolve(),
  };
}

/** Create a mock watcher that returns multiple chunks per file (testing dedup). */
function mockWatcherWithChunks(
  metaPaths: string[],
  chunksPerFile: number,
): WatcherClient {
  return {
    scan: (params: ScanParams): Promise<ScanResponse> => {
      const filterStr = JSON.stringify(params.filter ?? {});
      if (filterStr.includes('synth-meta')) {
        const files = metaPaths.flatMap((mp) =>
          Array.from({ length: chunksPerFile }, (_, i) => ({
            file_path: mp + '/meta.json',
            modified_at: 1000,
            content_hash: 'abc',
            chunk_index: i,
          })),
        );
        return Promise.resolve({ files });
      }
      return Promise.resolve({ files: [] });
    },
    registerRules: () => Promise.resolve(),
    unregisterRules: () => Promise.resolve(),
  };
}

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), 'listMetas-test-' + Date.now().toString());
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Helper to create a .meta/meta.json on disk. */
function createMeta(
  metaPath: string,
  meta: Record<string, unknown> = {},
): void {
  mkdirSync(metaPath, { recursive: true });
  writeFileSync(
    join(metaPath, 'meta.json'),
    JSON.stringify({ _id: 'test-id', ...meta }, null, 2),
  );
}

describe('listMetas', () => {
  it('returns empty results when watcher finds no metas', async () => {
    const result = await listMetas(makeConfig(), mockWatcher([]));

    expect(result.entries).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.stale).toBe(0);
  });

  it('discovers and enriches a single meta', async () => {
    const metaPath = join(testDir, 'project', '.meta');
    createMeta(metaPath, {
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
      _depth: 0,
      _emphasis: 1,
      _architectTokens: 100,
      _builderTokens: 200,
      _criticTokens: 50,
    });

    const watcher = mockWatcher([metaPath]);
    const result = await listMetas(makeConfig(), watcher);

    expect(result.entries).toHaveLength(1);
    expect(result.summary.total).toBe(1);
    expect(result.summary.stale).toBe(1);
    expect(result.summary.tokens.architect).toBe(100);
    expect(result.summary.tokens.builder).toBe(200);
    expect(result.summary.tokens.critic).toBe(50);

    const entry = result.entries[0];
    expect(entry.depth).toBe(0);
    expect(entry.emphasis).toBe(1);
    expect(entry.hasError).toBe(false);
    expect(entry.locked).toBe(false);
    expect(entry.architectTokens).toBe(100);
    expect(entry.stalenessSeconds).toBeGreaterThan(0);
    expect(entry.stalenessSeconds).toBeLessThan(Infinity);
  });

  it('marks never-synthesized metas correctly', async () => {
    const metaPath = join(testDir, 'fresh', '.meta');
    createMeta(metaPath, {});

    const result = await listMetas(makeConfig(), mockWatcher([metaPath]));

    expect(result.entries).toHaveLength(1);
    expect(result.summary.neverSynthesized).toBe(1);
    expect(result.entries[0].stalenessSeconds).toBe(Infinity);
    expect(result.entries[0].lastSynthesized).toBeNull();
  });

  it('detects error state from meta', async () => {
    const metaPath = join(testDir, 'errored', '.meta');
    createMeta(metaPath, {
      _error: {
        step: 'builder',
        message: 'timeout',
        timestamp: new Date().toISOString(),
      },
    });

    const result = await listMetas(makeConfig(), mockWatcher([metaPath]));

    expect(result.entries[0].hasError).toBe(true);
    expect(result.summary.errors).toBe(1);
  });

  it('deduplicates multi-chunk files', async () => {
    const metaPath = join(testDir, 'multi', '.meta');
    createMeta(metaPath, {
      _generatedAt: new Date().toISOString(),
    });

    // Watcher returns 5 chunks for the same file
    const watcher = mockWatcherWithChunks([metaPath], 5);
    const result = await listMetas(makeConfig(), watcher);

    // Should be deduplicated to 1 entry
    expect(result.entries).toHaveLength(1);
    expect(result.summary.total).toBe(1);
  });

  it('handles multiple metas with correct summary', async () => {
    const meta1 = join(testDir, 'a', '.meta');
    const meta2 = join(testDir, 'b', '.meta');
    const meta3 = join(testDir, 'c', '.meta');

    createMeta(meta1, {
      _generatedAt: new Date(Date.now() - 86400_000).toISOString(),
      _architectTokens: 50,
    });
    createMeta(meta2, {}); // never synthesized
    createMeta(meta3, {
      _generatedAt: new Date(Date.now() - 1000).toISOString(),
      _error: {
        step: 'critic',
        message: 'fail',
        timestamp: new Date().toISOString(),
      },
    });

    const watcher = mockWatcher([meta1, meta2, meta3]);
    const result = await listMetas(makeConfig(), watcher);

    expect(result.summary.total).toBe(3);
    expect(result.summary.stale).toBe(3); // all are stale
    expect(result.summary.neverSynthesized).toBe(1);
    expect(result.summary.errors).toBe(1);
    expect(result.summary.tokens.architect).toBe(50);
  });

  it('skips unreadable meta.json files', async () => {
    const meta1 = join(testDir, 'good', '.meta');
    const meta2 = join(testDir, 'bad', '.meta');

    createMeta(meta1, {});
    // Create directory but with invalid JSON
    mkdirSync(meta2, { recursive: true });
    writeFileSync(join(meta2, 'meta.json'), 'not json');

    const watcher = mockWatcher([meta1, meta2]);
    const result = await listMetas(makeConfig(), watcher);

    // Only the good meta should be included
    expect(result.entries).toHaveLength(1);
    expect(result.summary.total).toBe(1);
  });

  it('returns ownership tree', async () => {
    const parent = join(testDir, 'org', '.meta');
    const child = join(testDir, 'org', 'repo', '.meta');

    createMeta(parent, {});
    createMeta(child, {});

    const watcher = mockWatcher([parent, child]);
    const result = await listMetas(makeConfig(), watcher);

    expect(result.tree).toBeDefined();
    expect(result.tree.nodes.size).toBe(2);
  });

  it('tracks stalest and last synthesized correctly', async () => {
    const old = join(testDir, 'old', '.meta');
    const recent = join(testDir, 'recent', '.meta');

    const oldTime = new Date(Date.now() - 86400_000 * 7).toISOString(); // 7 days ago
    const recentTime = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago

    createMeta(old, { _generatedAt: oldTime });
    createMeta(recent, { _generatedAt: recentTime });

    const watcher = mockWatcher([old, recent]);
    const result = await listMetas(makeConfig(), watcher);

    expect(result.summary.lastSynthesizedAt).toBe(recentTime);
    expect(result.summary.lastSynthesizedPath).toBe(normalizePath(recent));
    // Stalest should be the old one (higher effective staleness)
    expect(result.summary.stalestPath).toBe(normalizePath(old));
  });
});
