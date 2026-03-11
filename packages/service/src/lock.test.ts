import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, isLocked, releaseLock } from './lock.js';

const testRoot = join(tmpdir(), `jeeves-meta-lock-${Date.now().toString()}`);
const metaPath = join(testRoot, '.meta');

beforeEach(() => {
  mkdirSync(metaPath, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('acquireLock', () => {
  it('acquires lock on unlocked directory', () => {
    expect(acquireLock(metaPath)).toBe(true);
    expect(existsSync(join(metaPath, '.lock'))).toBe(true);
  });

  it('fails to acquire when already locked', () => {
    expect(acquireLock(metaPath)).toBe(true);
    expect(acquireLock(metaPath)).toBe(false);
  });

  it('overrides stale lock (> 30 min)', () => {
    const staleDate = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    writeFileSync(
      join(metaPath, '.lock'),
      JSON.stringify({ pid: 99999, startedAt: staleDate }),
    );
    expect(acquireLock(metaPath)).toBe(true);
  });

  it('overrides corrupt lock file', () => {
    writeFileSync(join(metaPath, '.lock'), 'not json');
    expect(acquireLock(metaPath)).toBe(true);
  });
});

describe('releaseLock', () => {
  it('removes lock file', () => {
    acquireLock(metaPath);
    releaseLock(metaPath);
    expect(existsSync(join(metaPath, '.lock'))).toBe(false);
  });

  it('does not throw when no lock exists', () => {
    expect(() => {
      releaseLock(metaPath);
    }).not.toThrow();
  });
});

describe('isLocked', () => {
  it('returns false when no lock exists', () => {
    expect(isLocked(metaPath)).toBe(false);
  });

  it('returns true when lock is fresh', () => {
    acquireLock(metaPath);
    expect(isLocked(metaPath)).toBe(true);
  });

  it('returns false when lock is stale', () => {
    const staleDate = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    writeFileSync(
      join(metaPath, '.lock'),
      JSON.stringify({ pid: 99999, startedAt: staleDate }),
    );
    expect(isLocked(metaPath)).toBe(false);
  });

  it('returns false when lock is corrupt', () => {
    writeFileSync(join(metaPath, '.lock'), 'garbage');
    expect(isLocked(metaPath)).toBe(false);
  });
});
