/**
 * File-system lock for preventing concurrent synthesis on the same meta.
 *
 * Lock file: .meta/.lock containing PID + timestamp.
 * Stale timeout: 30 minutes.
 *
 * Module: lock
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILE = '.lock';
const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface LockData {
  pid: number;
  startedAt: string;
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
      const data = JSON.parse(raw) as LockData;
      const lockAge = Date.now() - new Date(data.startedAt).getTime();

      if (lockAge < STALE_TIMEOUT_MS) {
        return false; // Lock is active
      }
      // Stale lock — fall through to overwrite
    } catch {
      // Corrupt lock file — overwrite
    }
  }

  const lock: LockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
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
    const data = JSON.parse(raw) as LockData;
    const lockAge = Date.now() - new Date(data.startedAt).getTime();
    return lockAge < STALE_TIMEOUT_MS;
  } catch {
    return false; // Corrupt lock = not locked
  }
}
