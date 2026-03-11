/**
 * Tests for watcher-based meta discovery.
 *
 * @module discovery/discoverMetas.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import type { MetaConfig } from '../schema/index.js';
import { buildMetaFilter, discoverMetas } from './discoverMetas.js';

const config = {
  metaProperty: { domains: ['meta'] },
  metaArchiveProperty: { domains: ['meta-archive'] },
} as unknown as MetaConfig;

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
      must: [
        { key: 'domains', match: { value: 'meta' } },
        { key: 'file_path', match: { text: '.meta/meta.json' } },
      ],
    });
  });

  it('uses custom domain', () => {
    const custom = {
      ...config,
      metaProperty: { domains: ['synth-meta'] },
    } as unknown as MetaConfig;
    const filter = buildMetaFilter(custom);
    expect(filter).toEqual({
      must: [
        { key: 'domains', match: { value: 'synth-meta' } },
        { key: 'file_path', match: { text: '.meta/meta.json' } },
      ],
    });
  });

  it('builds filter from scalar metaProperty', () => {
    const scalar = {
      ...config,
      metaProperty: { _meta: 'current' },
    } as unknown as MetaConfig;
    const filter = buildMetaFilter(scalar);
    expect(filter).toEqual({
      must: [
        { key: '_meta', match: { value: 'current' } },
        { key: 'file_path', match: { text: '.meta/meta.json' } },
      ],
    });
  });

  it('skips non-filterable object values', () => {
    const nested = {
      ...config,
      metaProperty: { _meta: 'current', nested: { foo: 'bar' } },
    } as unknown as MetaConfig;
    const filter = buildMetaFilter(nested);
    expect(filter).toEqual({
      must: [
        { key: '_meta', match: { value: 'current' } },
        { key: 'file_path', match: { text: '.meta/meta.json' } },
      ],
    });
  });

  it('skips empty array values', () => {
    const empty = {
      ...config,
      metaProperty: { _meta: 'current', tags: [] },
    } as unknown as MetaConfig;
    const filter = buildMetaFilter(empty);
    expect(filter).toEqual({
      must: [
        { key: '_meta', match: { value: 'current' } },
        { key: 'file_path', match: { text: '.meta/meta.json' } },
      ],
    });
  });

  it('handles boolean values', () => {
    const bool = {
      ...config,
      metaProperty: { active: true },
    } as unknown as MetaConfig;
    const filter = buildMetaFilter(bool);
    expect(filter).toEqual({
      must: [
        { key: 'active', match: { value: true } },
        { key: 'file_path', match: { text: '.meta/meta.json' } },
      ],
    });
  });

  it('handles numeric values', () => {
    const num = {
      ...config,
      metaProperty: { priority: 5 },
    } as unknown as MetaConfig;
    const filter = buildMetaFilter(num);
    expect(filter).toEqual({
      must: [
        { key: 'priority', match: { value: 5 } },
        { key: 'file_path', match: { text: '.meta/meta.json' } },
      ],
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
        filter: {
          must: [
            { key: 'domains', match: { value: 'meta' } },
            { key: 'file_path', match: { text: '.meta/meta.json' } },
          ],
        },
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
