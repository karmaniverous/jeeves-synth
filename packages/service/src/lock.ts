/**
 * File-system lock for preventing concurrent synthesis on the same meta.
 *
 * Lock file: .meta/.lock containing `_lockPid` + `_lockStartedAt` (underscore-prefixed
 * reserved keys, consistent with meta.json conventions).
 * Stale timeout: 30 minutes.
 *
 * @module lock
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILE = '.lock';

/**
 * Resolve a path to a .meta directory.
 *
 * If the path already ends with '.meta', returns it as-is.
 * Otherwise, appends '.meta' as a subdirectory.
 *
 * @param inputPath - Path that may or may not end with '.meta'.
 * @returns The resolved .meta directory path.
 */
export function resolveMetaDir(inputPath: string): string {
  return inputPath.endsWith('.meta') ? inputPath : join(inputPath, '.meta');
}
const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface LockData {
  _lockPid: number;
  _lockStartedAt: string;
}

/** Parsed state of a .lock file. */
export interface LockState {
  /** Whether the lock file exists. */
  exists: boolean;
  /** Whether the lock contains a staged synthesis result. */
  staged: boolean;
  /** Whether the lock is actively held (non-stale PID lock). */
  active: boolean;
  /** Raw parsed data, or null if missing/corrupt. */
  data: Record<string, unknown> | null;
}

/**
 * Read and classify the state of a .meta/.lock file.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @returns Parsed lock state.
 */
export function readLockState(metaPath: string): LockState {
  const lockPath = join(metaPath, LOCK_FILE);

  if (!existsSync(lockPath)) {
    return { exists: false, staged: false, active: false, data: null };
  }

  try {
    const raw = readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;

    if ('_id' in data) {
      return { exists: true, staged: true, active: false, data };
    }

    const startedAt = data._lockStartedAt as string | undefined;
    if (startedAt) {
      const lockAge = Date.now() - new Date(startedAt).getTime();
      return {
        exists: true,
        staged: false,
        active: lockAge < STALE_TIMEOUT_MS,
        data,
      };
    }

    return { exists: true, staged: false, active: false, data };
  } catch {
    return { exists: true, staged: false, active: false, data: null };
  }
}

/**
 * Attempt to acquire a lock on a .meta directory.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @returns True if lock was acquired, false if already locked (non-stale).
 */
export function acquireLock(metaPath: string): boolean {
  const state = readLockState(metaPath);

  // Active non-stale lock — cannot acquire
  if (state.active) return false;

  // Staged, stale, corrupt, or missing — safe to (over)write
  const lockPath = join(metaPath, LOCK_FILE);
  const lock: LockData = {
    _lockPid: process.pid,
    _lockStartedAt: new Date().toISOString(),
  };
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return true;
}

/**
 * Release a lock on a .meta directory.
 *
 * @param metaPath - Absolute path to the .meta directory.
 */
export function releaseLock(metaPath: string): void {
  const lockPath = join(metaPath, LOCK_FILE);
  try {
    unlinkSync(lockPath);
  } catch {
    // Already removed or never existed
  }
}

/**
 * Check if a .meta directory is currently locked (non-stale).
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @returns True if locked and not stale.
 */
export function isLocked(metaPath: string): boolean {
  return readLockState(metaPath).active;
}

/**
 * Clean up stale lock files on startup.
 *
 * For each .meta directory found via the provided paths:
 * - If lock contains PID-only data (synthesis incomplete), delete it.
 * - If lock contains staged result (_id present), log warning and delete.
 *
 * @param metaPaths - Array of .meta directory paths to check.
 * @param logger - Optional logger for warnings.
 */
export function cleanupStaleLocks(
  metaPaths: string[],
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void },
): void {
  for (const metaPath of metaPaths) {
    const state = readLockState(metaPath);
    if (!state.exists) continue;

    const lockPath = join(metaPath, LOCK_FILE);
    if (state.staged) {
      logger?.warn(
        { metaPath },
        'Found staged synthesis result in lock file from previous crash — deleting (conservative: not auto-finalizing)',
      );
    } else {
      logger?.warn(
        { metaPath },
        'Found stale lock file from previous crash — deleting',
      );
    }

    try {
      unlinkSync(lockPath);
    } catch {
      // Already gone
    }
  }
}
