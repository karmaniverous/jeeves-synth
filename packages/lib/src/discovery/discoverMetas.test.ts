/**
 * Tests for watcher-based meta discovery.
 *
 * @module discovery/discoverMetas.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import type { SynthConfig } from '../schema/index.js';
import { buildMetaFilter, discoverMetas } from './discoverMetas.js';

const config = {
  metaProperty: { domains: ['meta'] },
  metaArchiveProperty: { domains: ['meta-archive'] },
} as SynthConfig;

function mockWatcher(files: Array<{ file_path: string }>) {
  const scan = vi.fn().mockResolvedValue({
    files: files.map((f) => ({
      ...f,
      modified_at: 0,
      content_hash: 'abc',
    })),
  });

  const watcher: WatcherClient = {
    scan,
    registerRules: vi.fn().mockResolvedValue(undefined),
    unregisterRules: vi.fn().mockResolvedValue(undefined),
  };

  return { watcher, scan };
}

describe('buildMetaFilter', () => {
  it('builds filter from first domain in metaProperty', () => {
    const filter = buildMetaFilter(config);
    expect(filter).toEqual({
      must: [{ key: 'domains', match: { value: 'meta' } }],
    });
  });

  it('uses custom domain', () => {
    const custom = {
      ...config,
      metaProperty: { domains: ['synth-meta'] },
    } as SynthConfig;
    const filter = buildMetaFilter(custom);
    expect(filter).toEqual({
      must: [{ key: 'domains', match: { value: 'synth-meta' } }],
    });
  });
});

describe('discoverMetas', () => {
  it('returns meta paths from scan results', async () => {
    const { watcher } = mockWatcher([
      { file_path: 'j:/domains/email/.meta/meta.json' },
      { file_path: 'j:/domains/github/.meta/meta.json' },
    ]);
    const result = await discoverMetas(config, watcher);
    expect(result).toEqual([
      'j:/domains/email/.meta',
      'j:/domains/github/.meta',
    ]);
  });

  it('deduplicates multi-chunk files', async () => {
    const { watcher } = mockWatcher([
      { file_path: 'j:/domains/email/.meta/meta.json' },
      { file_path: 'j:/domains/email/.meta/meta.json' },
    ]);
    const result = await discoverMetas(config, watcher);
    expect(result).toEqual(['j:/domains/email/.meta']);
  });

  it('returns empty array when no metas found', async () => {
    const { watcher } = mockWatcher([]);
    const result = await discoverMetas(config, watcher);
    expect(result).toEqual([]);
  });

  it('passes domain filter to scan', async () => {
    const { watcher, scan } = mockWatcher([]);
    await discoverMetas(config, watcher);
    expect(scan).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { must: [{ key: 'domains', match: { value: 'meta' } }] },
      }),
    );
  });

  it('normalizes backslash paths', async () => {
    const { watcher } = mockWatcher([
      { file_path: 'j:\\domains\\email\\.meta\\meta.json' },
    ]);
    const result = await discoverMetas(config, watcher);
    expect(result[0]).not.toContain('\\');
  });
});
