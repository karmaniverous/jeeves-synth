import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import type { MetaExecutor } from '../interfaces/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import { orchestrate } from './orchestrate.js';

const testRoot = join(
  tmpdir(),
  `jeeves-meta-orch-int-${Date.now().toString()}`,
);

const config: MetaConfig = {
  watcherUrl: 'http://localhost:3456',
  gatewayUrl: 'http://127.0.0.1:3000',
  depthWeight: 1,
  architectEvery: 10,
  maxArchive: 20,
  maxLines: 500,
  architectTimeout: 120,
  builderTimeout: 600,
  criticTimeout: 300,
  thinking: 'low',
  defaultArchitect: 'You are the architect.',
  defaultCritic: 'You are the critic.',
  skipUnchanged: true,
  batchSize: 1,
  metaProperty: { domains: ['meta'] },
  metaArchiveProperty: { domains: ['meta-archive'] },
};

/**
 * Create a mock watcher that handles both discovery and scope scans.
 *
 * Discovery scans (with domain filter) return metaJsonPaths.
 * Scope scans (with pathPrefix) return scopeFiles.
 */
function createMockWatcher(
  scopeFiles: string[] = [],
  metaJsonPaths?: string[],
): WatcherClient {
  return {
    scan: vi.fn().mockImplementation((params: Record<string, unknown>) => {
      // Discovery scan — has a domain filter, no pathPrefix
      const filter = params.filter as Record<string, unknown> | undefined;
      if (filter && !params.pathPrefix) {
        const paths = metaJsonPaths ?? [];
        return Promise.resolve({
          files: paths.map((p) => ({
            file_path: p,
            modified_at: Math.floor(Date.now() / 1000),
            content_hash: 'abc',
          })),
        });
      }
      // Scope/staleness scan — has pathPrefix
      return Promise.resolve({
        files: scopeFiles.map((f) => ({
          file_path: f,
          modified_at: Math.floor(Date.now() / 1000),
          content_hash: 'abc',
        })),
      });
    }),
    registerRules: vi.fn().mockResolvedValue(undefined),
    unregisterRules: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockExecutor(responses?: Record<string, string>): MetaExecutor {
  let callIndex = 0;
  const defaultResponses = [
    'Analyze the data and produce a synthesis.',
    JSON.stringify({ _content: '# Synthesis output', topics: ['test'] }),
    'Good synthesis. Covers key areas.',
  ];

  return {
    spawn: vi.fn().mockImplementation((task: string) => {
      if (responses) {
        for (const [key, val] of Object.entries(responses)) {
          if (task.includes(key)) return Promise.resolve({ output: val });
        }
      }
      const response = defaultResponses[callIndex] ?? 'output';
      callIndex++;
      return Promise.resolve({ output: response });
    }),
  };
}

beforeEach(() => {
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('orchestrate', () => {
  it('returns synthesized: false when no .meta/ directories exist', async () => {
    const watcher = createMockWatcher();
    const executor = createMockExecutor();
    const results = await orchestrate(config, executor, watcher);
    expect(results[0]?.synthesized ?? false).toBe(false);
  });

  it('runs a full cycle on a fresh meta (first synthesis)', async () => {
    mkdirSync(join(testRoot, 'domain/.meta'), { recursive: true });
    writeFileSync(join(testRoot, 'domain/data.md'), '# Some data');
    writeFileSync(
      join(testRoot, 'domain/.meta/meta.json'),
      JSON.stringify({ _id: '550e8400-e29b-41d4-a716-446655440000' }),
    );

    const scopeFiles = [testRoot.replaceAll('\\', '/') + '/domain/data.md'];
    const metaJsonPath =
      testRoot.replaceAll('\\', '/') + '/domain/.meta/meta.json';
    const watcher = createMockWatcher(scopeFiles, [metaJsonPath]);
    const executor = createMockExecutor();
    const spawnSpy = vi.spyOn(executor, 'spawn');

    const results = await orchestrate(config, executor, watcher);
    const result = results[0];

    expect(result.synthesized).toBe(true);
    expect(result.metaPath).toBeDefined();
    expect(result.error).toBeUndefined();

    // Verify meta.json was written with content
    const metaPath = join(testRoot, 'domain/.meta/meta.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as MetaJson;
    expect(meta._content).toBe('# Synthesis output');
    expect(meta._generatedAt).toBeDefined();
    expect(meta._structureHash).toBeDefined();

    // Executor called 3 times: architect, builder, critic
    expect(spawnSpy).toHaveBeenCalledTimes(3);
  });

  it('skips architect when builder is cached and structure unchanged', async () => {
    mkdirSync(join(testRoot, 'domain/.meta/archive'), { recursive: true });

    // Hash must match scope-filtered file list from mock watcher
    const fullFilePath =
      testRoot.replaceAll('\\', '/') + '/domain/test-file.md';
    const fileHash = createHash('sha256').update(fullFilePath).digest('hex');

    const metaJson: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _builder: 'Cached builder brief',
      _content: '# Old content',
      _generatedAt: new Date(Date.now() - 60000).toISOString(),
      _structureHash: fileHash,
      _synthesisCount: 1,
    };
    writeFileSync(
      join(testRoot, 'domain/.meta/meta.json'),
      JSON.stringify(metaJson),
    );
    // Archive with same _steer (no steer change)
    writeFileSync(
      join(testRoot, 'domain/.meta/archive/2026-01-01.json'),
      JSON.stringify(metaJson),
    );

    // Need at least one file so isStale returns true (full paths for filterInScope)
    const metaJsonPath =
      testRoot.replaceAll('\\', '/') + '/domain/.meta/meta.json';
    const watcher = createMockWatcher([fullFilePath], [metaJsonPath]);
    const executor = createMockExecutor();
    const spawnSpy = vi.spyOn(executor, 'spawn');

    const results = await orchestrate(config, executor, watcher);
    void results;

    // Only builder + critic (2 calls, no architect)
    expect(spawnSpy).toHaveBeenCalledTimes(2);
  });

  it('handles builder failure gracefully', async () => {
    mkdirSync(join(testRoot, 'domain/.meta'), { recursive: true });
    writeFileSync(
      join(testRoot, 'domain/.meta/meta.json'),
      JSON.stringify({ _id: '550e8400-e29b-41d4-a716-446655440001' }),
    );

    const metaJsonPath =
      testRoot.replaceAll('\\', '/') + '/domain/.meta/meta.json';
    const watcher = createMockWatcher(['test-file.md'], [metaJsonPath]);
    const executor: MetaExecutor = {
      spawn: vi.fn().mockImplementation((task: string) => {
        if (task.includes('TASK BRIEF')) {
          return Promise.reject(new Error('Builder timed out'));
        }
        return Promise.resolve({ output: 'architect output' });
      }),
    };

    const results = await orchestrate(config, executor, watcher);
    const result = results[0];

    expect(result.synthesized).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.error!.step).toBe('builder');
  });

  it('skips locked meta', async () => {
    mkdirSync(join(testRoot, 'domain/.meta'), { recursive: true });
    writeFileSync(
      join(testRoot, 'domain/.meta/meta.json'),
      JSON.stringify({ _id: '550e8400-e29b-41d4-a716-446655440000' }),
    );
    // Write a fresh lock
    writeFileSync(
      join(testRoot, 'domain/.meta/.lock'),
      JSON.stringify({ pid: 99999, startedAt: new Date().toISOString() }),
    );

    const metaJsonPath =
      testRoot.replaceAll('\\', '/') + '/domain/.meta/meta.json';
    const watcher = createMockWatcher([], [metaJsonPath]);
    const executor = createMockExecutor();
    const results = await orchestrate(config, executor, watcher);
    expect(results[0]?.synthesized ?? false).toBe(false);
  });
});
