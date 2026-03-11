import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireLock,
  cleanupStaleLocks,
  isLocked,
  releaseLock,
} from './lock.js';

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
      JSON.stringify({ _lockPid: 99999, _lockStartedAt: staleDate }),
    );
    expect(acquireLock(metaPath)).toBe(true);
  });

  it('overrides corrupt lock file', () => {
    writeFileSync(join(metaPath, '.lock'), 'not json');
    expect(acquireLock(metaPath)).toBe(true);
  });

  it('overrides staged synthesis result (_id present)', () => {
    writeFileSync(
      join(metaPath, '.lock'),
      JSON.stringify({ _id: 'abc', _generatedAt: new Date().toISOString() }),
    );
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
      JSON.stringify({ _lockPid: 99999, _lockStartedAt: staleDate }),
    );
    expect(isLocked(metaPath)).toBe(false);
  });

  it('returns false when lock is corrupt', () => {
    writeFileSync(join(metaPath, '.lock'), 'garbage');
    expect(isLocked(metaPath)).toBe(false);
  });

  it('returns false when lock is staged result', () => {
    writeFileSync(
      join(metaPath, '.lock'),
      JSON.stringify({ _id: 'abc', _generatedAt: new Date().toISOString() }),
    );
    expect(isLocked(metaPath)).toBe(false);
  });
});

describe('cleanupStaleLocks', () => {
  it('removes PID-only lock files', () => {
    writeFileSync(
      join(metaPath, '.lock'),
      JSON.stringify({
        _lockPid: 99999,
        _lockStartedAt: new Date().toISOString(),
      }),
    );
    const logger = { warn: vi.fn() };
    cleanupStaleLocks([metaPath], logger);
    expect(existsSync(join(metaPath, '.lock'))).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('removes staged synthesis lock files with warning', () => {
    writeFileSync(
      join(metaPath, '.lock'),
      JSON.stringify({ _id: 'abc', _generatedAt: new Date().toISOString() }),
    );
    const logger = { warn: vi.fn() };
    cleanupStaleLocks([metaPath], logger);
    expect(existsSync(join(metaPath, '.lock'))).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metaPath }),
      expect.stringContaining('staged synthesis result'),
    );
  });

  it('no-ops when no lock exists', () => {
    const logger = { warn: vi.fn() };
    cleanupStaleLocks([metaPath], logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
