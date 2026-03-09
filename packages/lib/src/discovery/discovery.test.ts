import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type MetaJson, metaJsonSchema } from '../schema/index.js';
import { ensureMetaJson } from './ensureMetaJson.js';
import { globMetas } from './globMetas.js';
import { buildOwnershipTree, findNode } from './ownershipTree.js';
import { filterInScope, getScopeExclusions, getScopePrefix } from './scope.js';

const testRoot = join(tmpdir(), `jeeves-meta-test-${Date.now().toString()}`);

function mkdirs(...paths: string[]): void {
  for (const p of paths) {
    mkdirSync(join(testRoot, p), { recursive: true });
  }
}

function abs(p: string): string {
  return join(testRoot, p).replace(/\\/g, '/');
}

beforeEach(() => {
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('globMetas', () => {
  it('finds .meta/ directories recursively', () => {
    mkdirs('a/.meta', 'a/b/.meta', 'a/c/d/.meta');
    const results = globMetas([testRoot]);
    expect(results).toHaveLength(3);
  });

  it('returns empty for no .meta/ directories', () => {
    mkdirs('a/b/c');
    const results = globMetas([testRoot]);
    expect(results).toHaveLength(0);
  });

  it('handles multiple watchPaths', () => {
    mkdirs('x/.meta', 'y/.meta');
    const results = globMetas([join(testRoot, 'x'), join(testRoot, 'y')]);
    expect(results).toHaveLength(2);
  });
});

describe('buildOwnershipTree', () => {
  it('builds correct parent/child relationships', () => {
    mkdirs('a/.meta', 'a/b/.meta', 'a/c/.meta');
    const paths = globMetas([testRoot]);
    const tree = buildOwnershipTree(paths);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].children).toHaveLength(2);
    expect(tree.roots[0].treeDepth).toBe(0);
    expect(tree.roots[0].children[0].treeDepth).toBe(1);
  });

  it('handles deeply nested ownership', () => {
    mkdirs('a/.meta', 'a/b/.meta', 'a/b/c/.meta');
    const paths = globMetas([testRoot]);
    const tree = buildOwnershipTree(paths);

    expect(tree.roots).toHaveLength(1);
    const root = tree.roots[0];
    expect(root.children).toHaveLength(1);
    expect(root.children[0].children).toHaveLength(1);
    expect(root.children[0].children[0].treeDepth).toBe(2);
  });

  it('handles multiple independent roots', () => {
    mkdirs('x/.meta', 'y/.meta');
    const paths = globMetas([testRoot]);
    const tree = buildOwnershipTree(paths);

    expect(tree.roots).toHaveLength(2);
    expect(tree.nodes.size).toBe(2);
  });
});

describe('ensureMetaJson', () => {
  it('creates meta.json with UUID if missing', () => {
    mkdirs('a/.meta');
    const metaPath = join(testRoot, 'a/.meta');
    const meta: MetaJson = ensureMetaJson(metaPath);

    expect(meta._id).toBeDefined();
    const result = metaJsonSchema.safeParse(meta);
    expect(result.success).toBe(true);

    // File should exist on disk
    expect(existsSync(join(metaPath, 'meta.json'))).toBe(true);

    // Archive directory should be created
    expect(existsSync(join(metaPath, 'archive'))).toBe(true);
  });

  it('reads existing meta.json without overwriting', () => {
    mkdirs('a/.meta');
    const metaPath = join(testRoot, 'a/.meta');
    writeFileSync(
      join(metaPath, 'meta.json'),
      JSON.stringify({
        _id: '550e8400-e29b-41d4-a716-446655440000',
        _steer: 'test',
      }),
    );

    const meta: MetaJson = ensureMetaJson(metaPath);
    expect(meta._id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(meta._steer).toBe('test');
  });
});

describe('scope', () => {
  it('getScopePrefix returns ownerPath', () => {
    mkdirs('a/.meta');
    const paths = globMetas([testRoot]);
    const tree = buildOwnershipTree(paths);
    const node = tree.roots[0];

    expect(getScopePrefix(node)).toBe(node.ownerPath);
  });

  it('getScopeExclusions returns child ownerPaths', () => {
    mkdirs('a/.meta', 'a/b/.meta', 'a/c/.meta');
    const paths = globMetas([testRoot]);
    const tree = buildOwnershipTree(paths);
    const root = tree.roots[0];

    const exclusions = getScopeExclusions(root);
    expect(exclusions).toHaveLength(2);
  });

  it('filterInScope excludes child subtrees but includes child meta.json', () => {
    mkdirs('a/.meta', 'a/b/.meta');
    const paths = globMetas([testRoot]);
    const tree = buildOwnershipTree(paths);
    const root = tree.roots[0];

    const files = [
      abs('a/file1.txt'),
      abs('a/file2.txt'),
      abs('a/b/file3.txt'), // under child meta — excluded
      abs('a/b/.meta/meta.json'), // child meta.json — included as rollup input
    ];

    const inScope = filterInScope(root, files);
    expect(inScope).toContain(abs('a/file1.txt'));
    expect(inScope).toContain(abs('a/file2.txt'));
    expect(inScope).not.toContain(abs('a/b/file3.txt'));
    expect(inScope).toContain(abs('a/b/.meta/meta.json'));
  });
});

describe('findNode', () => {
  it('finds node by metaPath', () => {
    mkdirSync(join(testRoot, 'domain/.meta'), { recursive: true });
    const metaPaths = globMetas([testRoot]);
    const tree = buildOwnershipTree(metaPaths);
    const metaPath = Array.from(tree.nodes.values())[0].metaPath;

    const found = findNode(tree, metaPath);
    expect(found).toBeDefined();
    expect(found!.metaPath).toBe(metaPath);
  });

  it('finds node by ownerPath', () => {
    mkdirSync(join(testRoot, 'domain/.meta'), { recursive: true });
    const metaPaths = globMetas([testRoot]);
    const tree = buildOwnershipTree(metaPaths);
    const ownerPath = Array.from(tree.nodes.values())[0].ownerPath;

    const found = findNode(tree, ownerPath);
    expect(found).toBeDefined();
    expect(found!.ownerPath).toBe(ownerPath);
  });

  it('returns undefined for non-existent path', () => {
    mkdirSync(join(testRoot, 'domain/.meta'), { recursive: true });
    const metaPaths = globMetas([testRoot]);
    const tree = buildOwnershipTree(metaPaths);

    expect(findNode(tree, '/nonexistent/path')).toBeUndefined();
  });
});
