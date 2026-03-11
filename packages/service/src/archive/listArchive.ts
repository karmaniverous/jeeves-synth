/**
 * List archive snapshot files in chronological order.
 *
 * @module archive/listArchive
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * List archive .json files sorted chronologically (oldest first).
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @returns Array of absolute paths to archive files, or empty if none.
 */
export function listArchiveFiles(metaPath: string): string[] {
  const archiveDir = join(metaPath, 'archive');
  try {
    return readdirSync(archiveDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(archiveDir, f));
  } catch {
    return [];
  }
}
