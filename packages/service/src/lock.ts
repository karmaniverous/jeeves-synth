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
const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface LockData {
  _lockPid: number;
  _lockStartedAt: string;
}

/**
 * Attempt to acquire a lock on a .meta directory.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @returns True if lock was acquired, false if already locked (non-stale).
 */
export function acquireLock(metaPath: string): boolean {
  const lockPath = join(metaPath, LOCK_FILE);

  if (existsSync(lockPath)) {
    try {
      const raw = readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;

      // Check for staged synthesis result (has _id key = completed synthesis)
      if ('_id' in data) {
        // Synthesis completed but finalization was interrupted — safe to overwrite
        return true;
      }

      // Normal lock data
      const startedAt = data._lockStartedAt as string | undefined;
      if (startedAt) {
        const lockAge = Date.now() - new Date(startedAt).getTime();
        if (lockAge < STALE_TIMEOUT_MS) {
          return false; // Lock is active
        }
      }
      // Stale or corrupt lock — fall through to overwrite
    } catch {
      // Corrupt lock file — overwrite
    }
  }

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
  const lockPath = join(metaPath, LOCK_FILE);

  if (!existsSync(lockPath)) return false;

  try {
    const raw = readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;

    // Staged result = not "locked" in the active-synthesis sense
    if ('_id' in data) return false;

    const startedAt = data._lockStartedAt as string | undefined;
    if (!startedAt) return false;

    const lockAge = Date.now() - new Date(startedAt).getTime();
    return lockAge < STALE_TIMEOUT_MS;
  } catch {
    return false; // Corrupt lock = not locked
  }
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
    const lockPath = join(metaPath, LOCK_FILE);
    if (!existsSync(lockPath)) continue;

    try {
      const raw = readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;

      if ('_id' in data) {
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

      unlinkSync(lockPath);
    } catch {
      // Corrupt — just delete
      try {
        unlinkSync(lockPath);
      } catch {
        // Already gone
      }
    }
  }
}
