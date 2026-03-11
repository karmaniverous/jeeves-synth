/**
 * Prune old archive snapshots beyond maxArchive.
 *
 * @module archive/prune
 */

import { unlinkSync } from 'node:fs';

import { listArchiveFiles } from './listArchive.js';

/**
 * Prune archive directory to keep at most maxArchive snapshots.
 * Removes the oldest files.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @param maxArchive - Maximum snapshots to retain.
 * @returns Number of files pruned.
 */
export function pruneArchive(metaPath: string, maxArchive: number): number {
  const files = listArchiveFiles(metaPath);
  const toRemove = files.length - maxArchive;
  if (toRemove <= 0) return 0;

  for (let i = 0; i < toRemove; i++) {
    unlinkSync(files[i]);
  }

  return toRemove;
}
