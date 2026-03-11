import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, isLocked, releaseLock } from '../lock.js';
import type { MetaJson } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import { pruneArchive } from './prune.js';
import { readLatestArchive } from './readLatest.js';
import { createSnapshot } from './snapshot.js';

const testRoot = join(tmpdir(), `jeeves-meta-archive-${Date.now().toString()}`);

const sampleMeta: MetaJson = {
  _id: '550e8400-e29b-41d4-a716-446655440000',
  _content: '# Test synthesis',
  _generatedAt: '2026-03-08T07:00:00Z',
};

beforeEach(() => {
  mkdirSync(join(testRoot, '.meta', 'archive'), { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

const metaPath = join(testRoot, '.meta');

describe('createSnapshot', () => {
  it('creates an archive file with _archived and _archivedAt', () => {
    const archivePath = createSnapshot(metaPath, sampleMeta);
    expect(existsSync(archivePath)).toBe(true);

    const archivedRaw = readFileSync(archivePath, 'utf8');
    const archived = JSON.parse(archivedRaw) as MetaJson;
    expect(archived._archived).toBe(true);
    expect(archived._archivedAt).toBeDefined();
    expect(archived._id).toBe(sampleMeta._id);
    expect(archived._content).toBe(sampleMeta._content);
  });
});

describe('pruneArchive', () => {
  it('removes oldest files when over maxArchive', () => {
    const archiveDir = join(metaPath, 'archive');
    for (let i = 0; i < 5; i++) {
      writeFileSync(
        join(archiveDir, `2026-03-0${(i + 1).toString()}T00-00-00Z.json`),
        '{}',
      );
    }

    const pruned = pruneArchive(metaPath, 3);
    expect(pruned).toBe(2);
    expect(
      readdirSync(archiveDir).filter((f) => f.endsWith('.json')),
    ).toHaveLength(3);
  });

  it('does nothing when under maxArchive', () => {
    const archiveDir = join(metaPath, 'archive');
    writeFileSync(join(archiveDir, 'snap1.json'), '{}');
    expect(pruneArchive(metaPath, 10)).toBe(0);
  });
});

describe('readLatestArchive', () => {
  it('reads the most recent archive', () => {
    const archiveDir = join(metaPath, 'archive');
    writeFileSync(
      join(archiveDir, '2026-03-01.json'),
      JSON.stringify({ _id: 'old', _steer: 'old steer' }),
    );
    writeFileSync(
      join(archiveDir, '2026-03-02.json'),
      JSON.stringify({ _id: 'new', _steer: 'new steer' }),
    );

    const latest = readLatestArchive(metaPath);
    expect(latest).not.toBeNull();
    expect(latest!._steer).toBe('new steer');
  });

  it('returns null when no archives exist', () => {
    expect(readLatestArchive(metaPath)).toBeNull();
  });
});

describe('computeStructureHash', () => {
  it('produces consistent hash for same file list', () => {
    const files = ['/a/b.txt', '/a/c.txt', '/a/a.txt'];
    const hash1 = computeStructureHash(files);
    const hash2 = computeStructureHash([...files].reverse());
    expect(hash1).toBe(hash2); // Sorted before hashing
  });

  it('produces different hash for different file lists', () => {
    const hash1 = computeStructureHash(['/a/b.txt']);
    const hash2 = computeStructureHash(['/a/c.txt']);
    expect(hash1).not.toBe(hash2);
  });
});

describe('lock', () => {
  it('acquires and releases lock', () => {
    expect(acquireLock(metaPath)).toBe(true);
    expect(isLocked(metaPath)).toBe(true);
    releaseLock(metaPath);
    expect(isLocked(metaPath)).toBe(false);
  });

  it('rejects second lock acquisition', () => {
    expect(acquireLock(metaPath)).toBe(true);
    expect(acquireLock(metaPath)).toBe(false);
    releaseLock(metaPath);
  });

  it('allows acquisition of stale lock', () => {
    // Write a lock file with old timestamp
    writeFileSync(
      join(metaPath, '.lock'),
      JSON.stringify({ pid: 99999, startedAt: '2020-01-01T00:00:00Z' }),
    );
    expect(acquireLock(metaPath)).toBe(true);
    releaseLock(metaPath);
  });

  it('treats corrupt lock file as unlocked', () => {
    writeFileSync(join(metaPath, '.lock'), 'not json');
    expect(isLocked(metaPath)).toBe(false);
    expect(acquireLock(metaPath)).toBe(true);
    releaseLock(metaPath);
  });
});
