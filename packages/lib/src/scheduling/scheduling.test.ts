import { describe, expect, it, vi } from 'vitest';

import type { MetaNode } from '../discovery/index.js';
import type { MetaJson } from '../schema/index.js';
import { selectCandidate } from './selectCandidate.js';
import {
  actualStaleness,
  hasSteerChanged,
  isArchitectTriggered,
} from './staleness.js';
import { computeEffectiveStaleness } from './weightedFormula.js';

function makeNode(depth: number): MetaNode {
  return {
    metaPath: '/test/.meta',
    ownerPath: '/test',
    treeDepth: depth,
    children: [],
    parent: null,
  };
}

function makeMeta(overrides: Partial<MetaJson> = {}): MetaJson {
  return {
    _id: '550e8400-e29b-41d4-a716-446655440000',
    ...overrides,
  };
}

describe('actualStaleness', () => {
  it('returns Infinity for never-synthesized meta', () => {
    expect(actualStaleness(makeMeta())).toBe(Infinity);
  });

  it('returns positive seconds for past _generatedAt', () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const staleness = actualStaleness(makeMeta({ _generatedAt: oneHourAgo }));
    expect(staleness).toBeGreaterThan(3500);
    expect(staleness).toBeLessThan(3700);
  });
});

describe('computeEffectiveStaleness', () => {
  it('applies depth weighting correctly', () => {
    const candidates = [
      { node: makeNode(0), meta: makeMeta(), actualStaleness: 3600 },
      { node: makeNode(1), meta: makeMeta(), actualStaleness: 3600 },
      { node: makeNode(2), meta: makeMeta(), actualStaleness: 3600 },
    ];

    const result = computeEffectiveStaleness(candidates, 1);

    // depth 0 (normalized 0): 3600 * (0+1)^1 = 3600
    expect(result[0].effectiveStaleness).toBe(3600);
    // depth 1 (normalized 1): 3600 * (1+1)^1 = 7200
    expect(result[1].effectiveStaleness).toBe(7200);
    // depth 2 (normalized 2): 3600 * (2+1)^1 = 10800
    expect(result[2].effectiveStaleness).toBe(10800);
  });

  it('ignores depth when depthWeight is 0', () => {
    const candidates = [
      { node: makeNode(0), meta: makeMeta(), actualStaleness: 3600 },
      { node: makeNode(2), meta: makeMeta(), actualStaleness: 3600 },
    ];

    const result = computeEffectiveStaleness(candidates, 0);

    // (anything)^0 = 1, so all get same effective staleness
    expect(result[0].effectiveStaleness).toBe(3600);
    expect(result[1].effectiveStaleness).toBe(3600);
  });

  it('uses _depth override instead of treeDepth', () => {
    const candidates = [
      {
        node: makeNode(0),
        meta: makeMeta({ _depth: 5 }),
        actualStaleness: 3600,
      },
      { node: makeNode(2), meta: makeMeta(), actualStaleness: 3600 },
    ];

    const result = computeEffectiveStaleness(candidates, 1);

    // _depth 5 normalized to (5-2)=3: 3600 * (3+1)^1 = 14400
    expect(result[0].effectiveStaleness).toBe(14400);
    // treeDepth 2 normalized to (2-2)=0: 3600 * (0+1)^1 = 3600
    expect(result[1].effectiveStaleness).toBe(3600);
  });

  it('normalizes negative _depth values', () => {
    const candidates = [
      {
        node: makeNode(0),
        meta: makeMeta({ _depth: -2 }),
        actualStaleness: 3600,
      },
      { node: makeNode(1), meta: makeMeta(), actualStaleness: 3600 },
    ];

    const result = computeEffectiveStaleness(candidates, 1);

    // min depth is -2, so normalized: -2 - (-2) = 0, 1 - (-2) = 3
    expect(result[0].effectiveStaleness).toBe(3600); // (0+1)^1 * 3600
    expect(result[1].effectiveStaleness).toBe(14400); // (3+1)^1 * 3600
  });

  it('applies _emphasis as multiplier on depthWeight', () => {
    const candidates = [
      {
        node: makeNode(0),
        meta: makeMeta({ _emphasis: 0.5 }),
        actualStaleness: 3600,
      },
      {
        node: makeNode(2),
        meta: makeMeta({ _emphasis: 0.5 }),
        actualStaleness: 3600,
      },
      {
        node: makeNode(2),
        meta: makeMeta(),
        actualStaleness: 3600,
      },
    ];

    const result = computeEffectiveStaleness(candidates, 1);

    // depth 0 (norm 0), emph 0.5: 3600 * (0+1)^(1*0.5) = 3600 * 1 = 3600
    expect(result[0].effectiveStaleness).toBe(3600);
    // depth 2 (norm 2), emph 0.5: 3600 * (2+1)^(1*0.5) = 3600 * sqrt(3)
    expect(result[1].effectiveStaleness).toBeCloseTo(3600 * Math.sqrt(3), 5);
    // depth 2 (norm 2), emph 1: 3600 * (2+1)^(1*1) = 10800
    expect(result[2].effectiveStaleness).toBe(10800);
  });

  it('returns empty array for empty input', () => {
    expect(computeEffectiveStaleness([], 1)).toEqual([]);
  });
});

describe('selectCandidate', () => {
  it('picks the candidate with highest effective staleness', () => {
    const candidates = computeEffectiveStaleness(
      [
        { node: makeNode(0), meta: makeMeta(), actualStaleness: 3600 },
        { node: makeNode(1), meta: makeMeta(), actualStaleness: 3600 },
        { node: makeNode(2), meta: makeMeta(), actualStaleness: 3600 },
      ],
      1,
    );

    const winner = selectCandidate(candidates);
    expect(winner).not.toBeNull();
    expect(winner!.node.treeDepth).toBe(2); // deepest wins
  });

  it('returns null for empty candidates', () => {
    expect(selectCandidate([])).toBeNull();
  });

  it('picks staleness over depth when staleness dominates', () => {
    const candidates = computeEffectiveStaleness(
      [
        { node: makeNode(0), meta: makeMeta(), actualStaleness: 100000 },
        { node: makeNode(2), meta: makeMeta(), actualStaleness: 100 },
      ],
      1,
    );

    const winner = selectCandidate(candidates);
    expect(winner).not.toBeNull();
    expect(winner!.node.treeDepth).toBe(0); // very stale root beats fresh leaf
  });
});

describe('isStale', () => {
  // Dynamic import to avoid circular issues
  it('returns true for never-synthesized meta', async () => {
    const { isStale } = await import('./staleness.js');
    const watcher = {
      scan: vi.fn().mockResolvedValue({ files: [] }),
      registerRules: vi.fn().mockResolvedValue(undefined),
      unregisterRules: vi.fn().mockResolvedValue(undefined),
    };
    const meta = makeMeta();
    const result = await isStale('/test', meta, watcher);
    expect(result).toBe(true);
    // Should not call scan since no _generatedAt
    expect(watcher.scan).not.toHaveBeenCalled();
  });

  it('returns true when watcher reports modified files', async () => {
    const { isStale } = await import('./staleness.js');
    const watcher = {
      scan: vi.fn().mockResolvedValue({
        files: [
          { file_path: '/test/a.md', modified_at: 999999, content_hash: 'x' },
        ],
      }),
      registerRules: vi.fn().mockResolvedValue(undefined),
      unregisterRules: vi.fn().mockResolvedValue(undefined),
    };
    const meta = makeMeta({ _generatedAt: '2026-01-01T00:00:00Z' });
    const result = await isStale('/test', meta, watcher);
    expect(result).toBe(true);
  });

  it('returns false when no files modified since _generatedAt', async () => {
    const { isStale } = await import('./staleness.js');
    const watcher = {
      scan: vi.fn().mockResolvedValue({ files: [] }),
      registerRules: vi.fn().mockResolvedValue(undefined),
      unregisterRules: vi.fn().mockResolvedValue(undefined),
    };
    const meta = makeMeta({ _generatedAt: '2026-01-01T00:00:00Z' });
    const result = await isStale('/test', meta, watcher);
    expect(result).toBe(false);
  });
});

describe('isArchitectTriggered', () => {
  it('triggers when no cached builder', () => {
    const meta = { _id: 'test' };
    expect(isArchitectTriggered(meta, false, false, 10)).toBe(true);
  });

  it('triggers when structure changed', () => {
    const meta = { _id: 'test', _builder: 'cached' };
    expect(isArchitectTriggered(meta, true, false, 10)).toBe(true);
  });

  it('triggers when steer changed', () => {
    const meta = { _id: 'test', _builder: 'cached' };
    expect(isArchitectTriggered(meta, false, true, 10)).toBe(true);
  });

  it('triggers when synthesis count exceeds architectEvery', () => {
    const meta = { _id: 'test', _builder: 'cached', _synthesisCount: 10 };
    expect(isArchitectTriggered(meta, false, false, 10)).toBe(true);
  });

  it('does not trigger when nothing changed and count below threshold', () => {
    const meta = { _id: 'test', _builder: 'cached', _synthesisCount: 3 };
    expect(isArchitectTriggered(meta, false, false, 10)).toBe(false);
  });
});

describe('hasSteerChanged', () => {
  it('returns true when steer is set and no archive exists', () => {
    expect(hasSteerChanged('focus on X', undefined, false)).toBe(true);
  });

  it('returns false when no steer and no archive', () => {
    expect(hasSteerChanged(undefined, undefined, false)).toBe(false);
  });

  it('returns true when steer differs from archive', () => {
    expect(hasSteerChanged('new focus', 'old focus', true)).toBe(true);
  });

  it('returns false when steer matches archive', () => {
    expect(hasSteerChanged('same', 'same', true)).toBe(false);
  });
});
